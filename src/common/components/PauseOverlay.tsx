import type { SetupMember } from '../lib/games'
import styles from './PauseOverlay.module.css'

type Props = {
  /** Whose absence is pausing the game. */
  missing: SetupMember[]
}

/**
 * Banner + dim overlay rendered when a game is paused — i.e.,
 * not everyone expected at the game is currently connected to
 * its realtime channel. See `computePause` for the trigger
 * logic and `docs/wordknit.md` for the wider pattern.
 *
 * Paused ≠ suspended. Paused is the transient gameplay-pause
 * state (same UX as a video player's pause: clock stops, no
 * moves accepted, overlay shows). It resolves automatically
 * when the missing peer reconnects — the game stays open and
 * active in the DB. Suspended (club-level) is about which game
 * `common.club_active_game` points at; that concept lives in
 * the ClubPage's "Suspended games" section.
 *
 * The overlay is sticky-positioned across the host's content
 * area; the host is expected to wrap its main interactive
 * surface so the overlay covers it while paused. Pointer events
 * are blocked at the overlay layer so clicks don't reach
 * underlying tiles / buttons.
 */
export function PauseOverlay({ missing }: Props) {
  if (missing.length === 0) return null

  const names = missing.map((m) => m.username)
  const list =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`

  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div className={styles.banner}>
        <strong>Waiting for {list} to reconnect…</strong>
        <p className="muted">
          The game pauses while anyone's offline. It'll pick back up
          automatically — your in-progress selections will reset.
        </p>
      </div>
    </div>
  )
}
