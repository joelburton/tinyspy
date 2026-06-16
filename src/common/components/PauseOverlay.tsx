import type { SetupMember } from '../lib/games'
import styles from './PauseOverlay.module.css'

type Props = {
  /** Members expected at the game who aren't currently on the
   *  realtime channel. Populated for presence-driven pauses. */
  missing: SetupMember[]
  /** Set when a player clicked the Pause button. Drives the
   *  "X paused the game" copy line. null when the pause has no
   *  manual source (e.g. presence-only). */
  manuallyPausedBy?: SetupMember | null
  /** Resume handler — rendered as a Resume button when
   *  `manuallyPausedBy` is set. Any connected player can call
   *  it; there's no privileged "original pauser" check. */
  onResume?: () => void
}

/**
 * Banner + dim overlay rendered when a game is paused. Composes
 * its copy from the two possible pause sources:
 *
 *   - **presence-only** (missing[].length > 0, !manuallyPausedBy):
 *     "Waiting for Bea to reconnect…"
 *   - **manual-only** (!missing[].length, manuallyPausedBy set):
 *     "Bea paused the game" + Resume button
 *   - **both** (both populated): stack both messages; Resume
 *     button still shown (clicking Resume only clears the
 *     manual pause; presence-pause stays until everyone's back)
 *
 * Paused ≠ suspended. Paused is the transient gameplay-pause
 * state — same UX as a video player's pause: clock stops, no
 * moves accepted, overlay shows. Resolves automatically when
 * the missing peer reconnects (for presence-pause) or when
 * anyone clicks Resume (for manual-pause). Game stays
 * is_current_view=true in common.games. Suspended (club-level)
 * is about whether the game's common.games row still has
 * is_current_view=true for this club (it stops being the
 * current game when a new one starts and vacates the prior);
 * that concept surfaces in the ClubPage's "Suspended games"
 * section.
 */
export function PauseOverlay({ missing, manuallyPausedBy, onResume }: Props) {
  if (missing.length === 0 && !manuallyPausedBy) return null

  const missingNames = missing.map((m) => m.username)
  const missingList =
    missingNames.length === 1
      ? missingNames[0]
      : missingNames.length === 2
        ? `${missingNames[0]} and ${missingNames[1]}`
        : missingNames.length > 2
          ? `${missingNames.slice(0, -1).join(', ')}, and ${missingNames[missingNames.length - 1]}`
          : ''

  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div className={styles.banner}>
        {missing.length > 0 && (
          <strong>Waiting for {missingList} to reconnect…</strong>
        )}
        {manuallyPausedBy && (
          <strong>{manuallyPausedBy.username} paused the game.</strong>
        )}
        <p className="muted">
          The game pauses while anyone's offline, and any player can pause it.
          Your in-progress selections reset on every pause.
        </p>
        {onResume && manuallyPausedBy && (
          <div className={styles.actions}>
            <button type="button" onClick={onResume}>
              Resume
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
