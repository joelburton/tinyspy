import { Suspense, useEffect, useRef, useState } from 'react'
import type { GameManifest, SetupMember } from '../lib/games'
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
  members: SetupMember[]
  /** Club the game would start in. */
  clubId: string
  /** RPC succeeded — caller navigates into the new game's URL. */
  onStarted: (gameId: string) => void
  /** User dismissed the dialog (Cancel, Esc, or backdrop click). */
  onCancel: () => void
}

/**
 * Modal shell for collecting per-game setup options before
 * `create_game` fires. The chrome (backdrop, focus trap, Cancel
 * / Start buttons, busy + error state) lives here once; the
 * body is per-game and lazy-loaded from `manifest.setupForm`.
 *
 * Lifecycle model: the parent (ClubPage) conditionally renders
 * this component — mounting it opens the dialog, unmounting it
 * closes it. We never hold a separate "is open" state. On
 * Cancel / Esc / backdrop-click we call `onCancel`, which is
 * the parent's signal to stop rendering us. No close animation
 * — the modal disappears with the unmount.
 *
 * Built on the native `<dialog>` element, same pattern as
 * `HowToPlayModal`: ref + `showModal()` to engage the backdrop
 * + focus trap, native `cancel` event (Esc) wired to onCancel.
 *
 * Setup-value flow: the wrapper owns `setup` state (seeded from
 * `manifest.setupForm.defaults` on mount). The body renders
 * against it and reports changes via `onChange`. On Start we
 * hand the collected value to `manifest.startGameInClub`.
 * Server-side validation rejects malformed payloads — see each
 * game's `create_game` RPC.
 *
 * Cancel during a pending start: we don't try to abort the RPC.
 * If the user cancels after clicking Start, the RPC keeps going
 * and the resulting game lands in the club's paused-games list.
 * The friends-only audience makes "the click was loud — don't
 * sneak around it" the wrong trade; we accept the minor
 * accidental-creation possibility.
 */
export function SetupGameDialog({
  manifest, members, clubId, onStarted, onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Seed setup from the manifest's defaults on mount. We don't
  // re-seed on prop changes — the parent unmounts and remounts
  // us per game-start attempt, so each open starts fresh by
  // construction.
  const [setup, setSetup] = useState<unknown>(manifest.setupForm?.defaults)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Open the modal on mount. The dialog stays open until our
  // parent stops rendering us; no manual close() needed — the
  // DOM removal handles it.
  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  // Safety net: a parent that opens us for a setupForm-less
  // manifest is a bug, not a UX state we should render around.
  // Bail loudly in dev by rendering nothing; production
  // behavior is the same.
  if (!manifest.setupForm) return null
  const SetupBody = manifest.setupForm.Component

  async function handleStart() {
    setBusy(true)
    setError(null)
    // For now: default playerUserIds to every club member. A
    // future player-picker UI will let users select a subset
    // (defaulting to all-selected) and live above this call;
    // until then, all club members play every game — matching
    // pre-game_players behavior.
    const playerUserIds = members.map((m) => m.user_id)
    const result = await manifest.startGameInClub(clubId, setup, playerUserIds)
    if ('error' in result) {
      setBusy(false)
      setError(result.error)
      return
    }
    // Don't bother clearing `busy` — we're about to unmount.
    onStarted(result.id)
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.setupDialog}
      onClose={onCancel}
      onClick={(e) => {
        // A click whose target is the <dialog> itself (not a
        // descendant) lands on the backdrop area.
        if (e.target === dialogRef.current) onCancel()
      }}
    >
      <div className={styles.content}>
        <h2>Start {manifest.name}</h2>
        <Suspense fallback={<p className="muted">Loading options…</p>}>
          <SetupBody members={members} value={setup} onChange={setSetup} />
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
          <button type="button" onClick={handleStart} disabled={busy} autoFocus>
            {busy ? 'Starting…' : `Start ${manifest.name}`}
          </button>
        </div>
      </div>
    </dialog>
  )
}
