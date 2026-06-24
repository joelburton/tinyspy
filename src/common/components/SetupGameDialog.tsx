import { Suspense, useState } from 'react'
import { MODE_LABEL, type GameManifest, type Member } from '../lib/games'
import { colorVarFor } from '../lib/memberColor'
import { FloatingPanel } from './FloatingPanel'
import styles from './SetupGameDialog.module.css'

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
  selfUserId: string
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
 * `create_game` fires. Wraps the shared `<FloatingPanel>` shell
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
 * Setup-value flow: the wrapper owns `setup` state (seeded from
 * `manifest.setupForm.defaults` merged under the club's saved
 * default). The body renders against it and reports changes via
 * `onChange`. On Start we hand the collected value to
 * `manifest.startGameInClub`. Server-side validation rejects
 * malformed payloads — see each game's `create_game` RPC.
 *
 * Cancel during a pending start: we don't try to abort the RPC.
 * If the user cancels after clicking Start, the RPC keeps going
 * and the resulting game lands in the club's paused-games list.
 * The friends-only audience makes "the click was loud — don't
 * sneak around it" the wrong trade; we accept the minor
 * accidental-creation possibility.
 */
export function SetupGameDialog({
  manifest, members, selfUserId, clubHandle, savedDefault, onStarted, onCancel,
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
  const [setup, setSetup] = useState<unknown>(() => ({
    ...(manifest.setupForm.defaults as Record<string, unknown>),
    ...((savedDefault ?? {}) as Record<string, unknown>),
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Who's playing this game. Defaults to every club member; the
  // creator unchecks anyone sitting this one out (the moth+joel
  // game while leah's still en route). game_players already models
  // a subset — this is just the UI that finally lets a human pick
  // it. Lazy init once; `members` is the club roster, fixed for the
  // dialog's lifetime.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(members.map((m) => m.user_id)),
  )

  function togglePlayer(userId: string) {
    // The creator is always a player — you can't start a game you're
    // not in. Their checkbox is also disabled below; this guards the
    // state too.
    if (userId === selfUserId) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  // The picker only earns its keep with >1 member — a solo club has
  // nothing to choose. Validate the count against the manifest's
  // [min, max]; the server re-checks in create_game.
  const showPicker = members.length > 1
  const [minPlayers, maxPlayers] = manifest.numberOfPlayers
  const playerCount = selectedIds.size
  const countOk = playerCount >= minPlayers && playerCount <= maxPlayers
  const playerHint =
    playerCount < minPlayers
      ? `Pick at least ${minPlayers} player${minPlayers === 1 ? '' : 's'}.`
      : playerCount > maxPlayers
        ? `At most ${maxPlayers} players.`
        : null

  const SetupBody = manifest.setupForm.Component

  /**
   * The dialog's commit handler. Calls
   * `manifest.startGameInClub`, which fires the RPC that
   * actually writes the new `common.games` row.
   *
   * Named `handleStartGame` (not `handleStart`) to disambiguate
   * the two phases that both used to be called "start":
   *
   *   - **startSetup**: ClubPage's `handleStartSetup` opens
   *     this dialog. Game doesn't exist yet.
   *   - **startGame** (this handler): user clicks Start in the
   *     dialog; the RPC actually creates the game.
   *
   * See docs/naming.md → "start".
   */
  async function handleStartGame() {
    setBusy(true)
    setError(null)
    // The checked members become this game's players. (For a solo
    // club the picker is hidden and the set is just the lone
    // member.) The server validates the count + membership again.
    const playerUserIds = Array.from(selectedIds)
    const result = await manifest.startGameInClub(clubHandle, setup, playerUserIds)
    if ('error' in result) {
      setBusy(false)
      setError(result.error)
      return
    }
    // Don't bother clearing `busy` — we're about to unmount.
    onStarted(result.id)
  }

  // Confirm the chosen mode in the title (the Start buttons no longer
  // carry it in the name). Dropped for a solo club's coop game, matching
  // the ModePill suppression there.
  const showMode = !(clubHandle.startsWith('=') && manifest.mode === 'coop')
  const modeSuffix = showMode ? ` · ${MODE_LABEL[manifest.mode]}` : ''

  return (
    <FloatingPanel
      title={`Start ${manifest.name}${modeSuffix}`}
      onClose={onCancel}
      backdrop
      resizable={false}
      defaultSize={{ width: 480, height: 520 }}
      minWidth={320}
      minHeight={300}
    >
      {showPicker && (
        <fieldset className={styles.players}>
          <legend className={styles.playersLegend}>Players</legend>
          {members.map((m) => {
            const isSelf = m.user_id === selfUserId
            return (
              <label
                key={m.user_id}
                className={styles.playerRow}
                title={isSelf ? "You're always a player" : undefined}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(m.user_id)}
                  onChange={() => togglePlayer(m.user_id)}
                  // The creator can't deselect themselves.
                  disabled={busy || isSelf}
                />
                <span
                  className={styles.playerDot}
                  style={{ background: colorVarFor(m.color) }}
                  aria-hidden
                />
                <span>
                  {m.username}
                  {isSelf && <span className={styles.playerSelf}> (you)</span>}
                </span>
              </label>
            )
          })}
          {playerHint && <p className={styles.playerHint}>{playerHint}</p>}
        </fieldset>
      )}

      <Suspense fallback={<p className="muted">Loading options…</p>}>
        <SetupBody
          members={members}
          clubHandle={clubHandle}
          mode={manifest.mode}
          value={setup}
          onChange={setSetup}
        />
      </Suspense>
      {error && <p className="error">{error}</p>}
      <div className={styles.actions}>
        <button
          type="button"
          className="secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleStartGame}
          disabled={busy || !countOk}
          autoFocus
        >
          {busy ? 'Starting…' : `Start ${manifest.name}`}
        </button>
      </div>
    </FloatingPanel>
  )
}
