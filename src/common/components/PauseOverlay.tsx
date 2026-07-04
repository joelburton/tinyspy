import type { ReactNode } from 'react'
import type { Member } from '../lib/games'
import { colorVarFor } from '../lib/memberColor'
import { BackToClubButton } from './BackToClubButton'
import { EndGameButton } from './buttons/EndGameButton'
import styles from './PauseOverlay.module.css'

type Props = {
  /** Members expected at the game who aren't currently on the
   *  realtime channel. Populated for presence-driven pauses. */
  missing: Member[]
  /** Set when a player clicked the Pause button. Drives the
   *  "X paused the game" copy line. null when the pause has no
   *  manual source (e.g. presence-only). */
  manuallyPausedBy?: Member | null
  /** Resume handler — rendered as a Resume button when
   *  `manuallyPausedBy` is set. Any connected player can call
   *  it; there's no privileged "original pauser" check. */
  onResume?: () => void
  /** Leave for the club, shelving the game (`sendSuspend`). Shown as a
   *  "Return to club" button whenever paused — the reliable escape when a
   *  presence-pause won't clear (both players walked away, presence timed out).
   *  It goes through PostgREST, so it works even if Realtime is wedged. */
  onReturnToClub?: () => void
  /** End the game now (irreversible; the caller confirms first). The other
   *  escape from a stuck pause, dispatched to the gametype's own end_game. */
  onEndGame?: () => void
}

/**
 * Banner + dim overlay rendered when a game is paused. Composes
 * its copy from the two possible pause sources:
 *
 *   - **presence-only** (missing[].length > 0, !manuallyPausedBy):
 *     "Waiting for Bea…" — covers a player who disconnected AND one
 *     who's been invited but hasn't joined the game yet.
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
export function PauseOverlay({
  missing,
  manuallyPausedBy,
  onResume,
  onReturnToClub,
  onEndGame,
}: Props) {
  if (missing.length === 0 && !manuallyPausedBy) return null

  // Each name is its own colored span so the attribution stays
  // legible even when several peers are missing. The connective
  // text ("and", ", ") sits outside the colored spans in the
  // body-text color.
  const missingList = joinNames(missing.map(memberToColoredName))

  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div className={styles.banner}>
        {missing.length > 0 && <strong>Waiting for {missingList}…</strong>}
        {manuallyPausedBy && (
          <strong>
            <span style={{ color: colorVarFor(manuallyPausedBy.color) }}>
              {manuallyPausedBy.username}
            </span>{' '}
            paused the game.
          </strong>
        )}
        <p className="muted">
          The game waits until everyone's joined and connected, and any player
          can pause it. Your in-progress selections reset on every pause.
        </p>
        {/* Actions: Resume (manual pause only), plus the always-available
            escapes — the reliable out if presence never comes back. */}
        {(onResume && manuallyPausedBy) || onReturnToClub || onEndGame ? (
          <div className={styles.actions}>
            {onResume && manuallyPausedBy && (
              <button type="button" onClick={onResume}>
                Resume
              </button>
            )}
            {onReturnToClub && (
              <BackToClubButton onClick={onReturnToClub} label="Suspend and return to club" />
            )}
            {onEndGame && <EndGameButton onClick={onEndGame} />}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Render one member's name with their profile color applied. */
function memberToColoredName(m: Member): ReactNode {
  return (
    <span key={m.user_id} style={{ color: colorVarFor(m.color) }}>
      {m.username}
    </span>
  )
}

/**
 * English-style join of a list of name spans. Equivalent to the
 * plain-string form for 1/2/many cases, but keeps each name as
 * its own colored span so the reader can tell who's who when
 * multiple peers are missing simultaneously.
 *
 *   1 name  → [N]
 *   2 names → [N] and [N]
 *   3+      → [N], [N], and [N]
 */
function joinNames(nodes: ReactNode[]): ReactNode {
  if (nodes.length === 0) return null
  if (nodes.length === 1) return nodes[0]
  if (nodes.length === 2) {
    return (
      <>
        {nodes[0]} and {nodes[1]}
      </>
    )
  }
  return nodes.map((node, i) => (
    <span key={i}>
      {node}
      {i < nodes.length - 2 ? ', ' : i === nodes.length - 2 ? ', and ' : ''}
    </span>
  ))
}
