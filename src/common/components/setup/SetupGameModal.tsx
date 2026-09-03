// cs-unmet

import { Suspense, useCallback, useState } from 'react'
import { MODE_LABEL, type GameManifest } from '../../lib/gameManifest'
import { type Member } from '../../lib/members/member'
import { NormalModal } from '../floating-panels/NormalModal'
import { HelpButton } from '../buttons/HelpButton'
import { cls } from '../../lib/util/cls'
import { StandardForm } from '../fields/StandardForm'
import { FailureLine } from '../feedback/FailureLine'
import { FORM_ERROR_KEYNAME, type FormErrors } from '../fields/formState'
import actionRow from '../floating-panels/modalActions.module.css'
import styles from './SetupGameModal.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { CancelButton } from '../buttons/CancelButton'
import { reportUnhandled } from '../../lib/supabase/dbEnvelope'

type Props = {
  /**
   * Manifest of the game being set up. The dialog renders the
   * manifest's lazy setup body and calls `startGameInClub` on
   * submit. Non-null while the dialog should be open — the
   * parent unmounts us by passing `null` (we expect to be
   * conditionally rendered, not toggled in place).
   */
  manifest: GameManifest
  /** Club members — forwarded to per-game forms for member-aware UI. */
  members: Member[]
  /** The creating user. Always a player — their checkbox in the
   *  picker is locked on (you can't start a game you don't play in). */
  selfId: string
  /** Club the game would start in. */
  clubHandle: string
  /**
   * The club's last-saved setup for this gametype, from
   * `common.clubs_gametypes.default_setup`. Sourced by the parent
   * (ClubPage) alongside the allowed-gametypes query so the dialog
   * opens instantly without an extra round-trip. Undefined when
   * the friends haven't played this gametype yet — in that case
   * the form seeds from the manifest's static defaults alone.
   * Field-level merged UNDER the manifest defaults: saved fields
   * win, but a manifest growing a new field stays backward-
   * compatible (the new field fills from manifest defaults).
   */
  savedDefault?: unknown
  /** RPC succeeded — caller navigates into the new game's URL. */
  onStarted: (gameId: string) => void
  /** User dismissed the dialog (Cancel, Esc, or X). Backdrop
   *  click is intentionally NOT bound — mid-setup state is too
   *  easy to lose to a stray click outside the panel. */
  onCancel: () => void
}

/**
 * Floating modal for collecting per-game setup options before
 * `create_game` fires. Wraps the shared `<NormalModal>` shell
 * (header + close X + ESC handling + react-rnd drag) with
 * Setup-specific config:
 *
 *   - **backdrop=true** — the dim layer signals "this is the
 *     focused task" and the click-block prevents accidental
 *     Start clicks on other games behind. Chat at z-index 10000
 *     sits above the backdrop so it's still reachable mid-setup.
 *   - **draggable=true, resizable=false** — the form has natural
 *     dimensions (radios, calendar widget); resize would just
 *     create empty space. Drag lets users move the panel aside
 *     to read chat about "what timer should we pick?"
 *   - **No persistKey** — each open lands centered. Persisting
 *     would mean opening Setup once, dragging it to the corner,
 *     and forever after it lands in the corner. Surprising for
 *     a modal whose job is "appear, get the decision, close."
 *
 * Lifecycle model: the parent (ClubPage) conditionally renders
 * this component — mounting opens it, unmounting closes it. We
 * never hold a separate "is open" state. On Cancel / Esc / X
 * we call `onCancel`, which is the parent's signal to stop
 * rendering us.
 *
 * Setup-value flow: it is a `<StandardForm>`, so the FORM owns the
 * values — seeded from `manifest.setupForm.defaults` merged under
 * the club's saved default, plus `player_user_ids`. The game's body
 * renders against them and writes back with `set`. On submit the
 * players are split off as their own RPC argument and the rest goes
 * to `manifest.startGameInClub`. Server-side validation rejects
 * malformed payloads — see each game's `create_game` RPC.
 *
 * Cancel during a pending start: we don't try to abort the RPC.
 * If the user cancels after clicking Start, the RPC keeps going
 * and the resulting game lands in the club's paused-games list.
 * The friends-only audience makes "the click was loud — don't
 * sneak around it" the wrong trade; we accept the minor
 * accidental-creation possibility.
 */
export function SetupGameModal({
  manifest, members, selfId, clubHandle, savedDefault, onStarted, onCancel,
}: Props) {
  // Seed setup from the manifest's defaults merged UNDER the
  // club's saved default (if any). Saved fields override the
  // static defaults; missing fields fall through. A NULL or
  // undefined savedDefault spreads as a no-op, so a fresh club
  // (or a gametype that opts out of save) just gets the manifest
  // defaults verbatim.
  //
  // We don't re-seed on prop changes — the parent unmounts and
  // remounts us per game-start attempt, so each open starts
  // fresh by construction.
  //
  // `player_user_ids` joins them as a field like any other: every club member
  // to start, and the creator unchecks anyone sitting this one out (the
  // moth+joel game while leah's still en route). It is NOT part of the saved
  // default — who plays is a per-game choice.
  const initialValues = {
    ...(manifest.setupForm.defaults as Record<string, unknown>),
    ...((savedDefault ?? {}) as Record<string, unknown>),
    player_user_ids: new Set(members.map((m) => m.user_id)),
  }
  const [busy, setBusy] = useState(false)
  // What is wrong, keyed by field name. The server contributes one entry per
  // failed start; the cross-field guard below contributes the form-level one.
  const [errors, setErrors] = useState<FormErrors>({})

  /**
   * One error in or out, for a setup body that talks to a server itself (the
   * puzzle pickers). Stable, because a body may call it from inside a loader
   * whose identity feeds an effect.
   *
   * `null` deletes the key rather than storing an empty string, so a cleared
   * error leaves no entry behind for `FailureLine` to render as a blank row.
   */
  const setError = useCallback((name: string, message: string | null) => {
    setErrors((prev) => {
      if (message === null) {
        if (!(name in prev)) return prev
        const next = { ...prev }
        delete next[name]
        return next
      }
      if (prev[name] === message) return prev
      return { ...prev, [name]: message }
    })
  }, [])
  // The game's Help/rules, opened from the footer's HelpButton ON TOP of this
  // dialog (which stays open behind it) — read the rules, then keep setting up.
  const [showHelp, setShowHelp] = useState(false)

  const SetupBody = manifest.setupForm.Component

  /**
   * The dialog's commit handler. Calls
   * `manifest.startGameInClub`, which fires the RPC that
   * actually writes the new `common.games` row.
   *
   * Named `handleStartGame` (not `handleStart`) because two
   * phases could both be called "start":
   *
   *   - **startSetup**: ClubPage's `handleStartSetup` opens
   *     this dialog. Game doesn't exist yet.
   *   - **startGame** (this handler): user clicks Start in the
   *     dialog; the RPC actually creates the game.
   *
   * See docs/naming.md → "start".
   */
  async function handleStartGame(values: Record<string, unknown>) {
    setBusy(true)
    setErrors({})
    // THE ONE PLACE the form's shape and the wire's differ. The checked members
    // become this game's players — their own RPC argument, and never part of
    // the setup blob — and everything else IS the setup. (For a solo club the
    // picker is hidden and the set is just the lone member.) The server
    // validates the count + membership again.
    const { player_user_ids, ...setup } = values
    const result = await manifest.startGameInClub(
      clubHandle,
      setup,
      Array.from(player_user_ids as Set<string>),
    )
    if (result.type === 'not-ok') {
      setBusy(false)
      // `field` when the raise named a column, the form's own line when it did
      // not. A fault has already raised the modal on its way through the
      // wrapper; the line is what remains once that is dismissed, with the
      // dialog still open behind it so the player can retry.
      //
      // This is the ONE surface that can put a validation under the control it
      // is about — every in-game New Game throws `field` away, having no form to
      // put it on.
      setErrors({ [result.field ?? FORM_ERROR_KEYNAME]: result.message })
      return
    } else if (result.type === 'ok' && result.data.result === 'created') {
      // Don't bother clearing `busy` — we're about to unmount.
      onStarted(result.data.id)
      return
    } else {
      // `busy` IS cleared here: the dialog stays open, because an unnamed answer
      // means no game to navigate to and the player is left looking at a Start
      // button that must work again.
      setBusy(false)
      reportUnhandled('create_game', result)
      return
    }
  }

  // The chosen mode (Co-op / Compete), shown in BOTH the dialog title and the
  // Start button so it's clear which sibling you're launching. Dropped entirely
  // in a solo club, matching ModePill's suppression there — mode is noise with
  // one player (solo clubs register a single variant per game, so there's no
  // ambiguity to resolve).
  const modeSuffix = clubHandle.startsWith('=')
    ? ''
    : ` · ${MODE_LABEL[manifest.mode]}`

  // The manifest's lazy Help component (same one the in-game menu's Help opens).
  const HelpComponent = manifest.help

  return (
    <>
    <NormalModal
      title={`Start ${manifest.name}${modeSuffix}`}
      onClose={onCancel}
      resizable={false}
      // Grow to fit the setup options on open (capped to the viewport, past
      // which the body scrolls) — a game with many options must open tall
      // enough to show them all. `height` here is just the pre-load seed.
      fitContent
      defaultSize={{ width: 480, height: 520 }}
      minWidth={320}
    >
      <StandardForm<Record<string, unknown>>
        initialValues={initialValues}
        onSubmit={handleStartGame}
      >
        {({ values, set }) => {
          const players = values.player_user_ids as Set<string>
          const [minPlayers, maxPlayers] = manifest.numberOfPlayers
          const countOk = players.size >= minPlayers && players.size <= maxPlayers
          // Cross-field setup guard (optional per manifest). Couples the collected
          // values to the live headcount — e.g. bananagrams's "the bag must hold
          // playerCount × hand_size tiles". Any entry is a reason to keep Start
          // disabled; the server re-checks in create_game.
          //
          // The two sources merge into ONE object because they answer the same
          // question about the same fields — the frontend before the request,
          // the server after. Which one noticed decides nothing about where the
          // message appears; the KEY does. The frontend's win a collision: it
          // reflects what is on screen right now, while `errors` is what the
          // last submit came back with, about values that may since have changed.
          const setupErrors = manifest.setupForm.validate?.(values, players.size) ?? {}
          const allErrors = { ...errors, ...setupErrors }
          return (
            <>
              {/* WHAT THIS GAME IS, first — above the form. It used to live inside
                  each game's SetupForm, which meant it rendered BELOW the player
                  picker: an introduction under the thing it introduces. It is
                  manifest copy now (games.ts → GameSetupForm.intro), so the modal
                  decides where it goes. */}
              {manifest.setupForm.intro && (
                <p className={styles.intro}>{manifest.setupForm.intro}</p>
              )}

              {/* The fallback RESERVES most of a setup body's height rather than being
                    the one bare line it reads as. The panel is `fitContent`: it measures
                  whatever is mounted, so a one-line fallback made it fit to that —
                  collapsing to its 300px floor, then leaping ~370px when the real form
                  arrived ~300ms later, with the footer buttons sailing out from under
                  the cursor. Reserving the slot is the same no-reflow move the setup
                  error line below reflows freely; this one cannot, because it is
                  what the panel MEASURES. */}
              <Suspense
                fallback={<p className={cls('muted', styles.optionsPlaceholder)}>Loading options…</p>}
              >
                <SetupBody
                  members={members}
                  brand={manifest.name}
                  clubHandle={clubHandle}
                  mode={manifest.mode}
                  selfId={selfId}
                  numberOfPlayers={manifest.numberOfPlayers}
                  values={values}
                  set={set}
                  errors={allErrors}
                  setError={setError}
                />
              </Suspense>

              {/* The message that is about the form rather than any one field. A
                  field's own error is drawn by the field. */}
              <FailureLine>{allErrors[FORM_ERROR_KEYNAME]}</FailureLine>
              {/* Help first, away from the pair — it opens the rules on top of this
                  dialog, which stays open behind. Then Cancel and Start in macOS
                  order. */}
              <div className={actionRow.modalActions}>
                <HelpButton
                  className={actionRow.leading}
                  onClick={() => setShowHelp(true)}
                  disabled={busy}
                />
                <CancelButton onClick={onCancel} disabled={busy} />
                <StandardButton
                  name={busy ? 'Starting…' : 'Start'}
                  weight="primary"
                  type="submit"
                  disabled={busy || !countOk || Object.keys(setupErrors).length > 0}
                  autoFocus
                  // On a phone the button is just "Start" — "Start PsychicNum · Co-op"
                  // doesn't fit beside Cancel at 390px. The detail is dropped in CSS
                  // rather than by a `usePhone()` branch: it's presentation, and the
                  // dialog TITLE right above still names the game + mode, so nothing
                  // is actually lost. Hence a NODE for what is drawn while `name`
                  // stays the plain word — the span is a rendering detail, not a
                  // second name for the button.
                  label={
                    busy ? (
                      'Starting…'
                    ) : (
                      <>
                        Start
                        <span className={styles.startDetail}>
                          {' '}
                          {manifest.name}
                          {modeSuffix}
                        </span>
                      </>
                    )
                  }
                />
              </div>
            </>
          )
        }}
      </StandardForm>
    </NormalModal>

    {/* The game's Help, mounted as its OWN FloatingPanel above this dialog (which
        stays open behind it). Lazy — Suspense guards the chunk fetch. */}
    {showHelp && (
      <Suspense fallback={null}>
        <HelpComponent onClose={() => setShowHelp(false)} brand={manifest.name} />
      </Suspense>
    )}
    </>
  )
}
