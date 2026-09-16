// cs-met-pause-suspend

import type { Member } from '../members/member'
import { Dot } from '../members/Dot'
import { DotActor } from '../members/ActorMention'
import { ActionButton } from '../actions/ActionButton'
import type { BoundAction } from '../actions/useBoundAction'
import styles from './PauseOverlay.module.css'
import { StandardButton } from '../buttons/StandardButton'

type Props = {
  /** The full presence-pause roster — every player we're waiting on
   *  (conceders already excluded upstream). Listed vertically, each
   *  with an identity disc: filled color when present, a hollow gray
   *  "away" ring when absent. */
  expected: Member[]
  /** User ids currently on the game's realtime channel. Anyone in
   *  `expected` but not here is drawn as an away ring. */
  presentUserIds: Set<string>
  /** Set when a player clicked the Pause button. Drives the
   *  "X paused the game" copy line. null when the pause has no
   *  manual source (e.g. presence-only). */
  manuallyPausedBy?: Member | null
  /** Resume handler — rendered as a Resume button when
   *  `manuallyPausedBy` is set. Any connected player can call
   *  it; there's no privileged "original pauser" check. */
  onResume?: () => void
  /** Leave for the club, shelving the game — the reliable escape when a
   *  presence-pause won't clear (both players walked away, presence timed out).
   *  `GamePage`'s `act-back-to-club`, the same one every other surface places,
   *  so leaving from here is the same act it is anywhere else: a solo game
   *  shelves at once, a game with peers asks first. It goes through PostgREST,
   *  so it works even if Realtime is wedged. */
  actBackToClub?: BoundAction
  /** End the game now — the other escape from a stuck pause. Bound by
   *  `GamePage`, which sits above the boundary that unmounts the play area, so
   *  the binding survives the pause that the game's own one does not. It hides
   *  itself unless paused, so this places it without asking. */
  actEndGame?: BoundAction
}

/**
 * Banner + dim overlay rendered when a game is paused. Composes
 * its copy from the two possible pause sources:
 *
 *   - **presence-only** (someone in `expected` is absent, !manuallyPausedBy):
 *     "Waiting for everyone to connect…" over the roster list — which
 *     covers a player who disconnected AND one who's been invited but
 *     hasn't joined the game yet.
 *   - **manual-only** (everyone present, manuallyPausedBy set):
 *     "Bea paused the game" + Resume button
 *   - **both** (both populated): stack both messages; Resume
 *     button still shown (clicking Resume only clears the
 *     manual pause; presence-pause stays until everyone's back)
 *
 * The roster (shown whenever anyone's absent) lists the WHOLE expected
 * team, not just the missing — so a waiting player sees who's already
 * here (their color dot) alongside who we're still waiting on (a hollow
 * gray ring).
 *
 * Names stay black wherever the overlay writes one — the roster's rows and the
 * "X paused the game" line alike. The disc alone carries identity, the same
 * grammar as the club-page `PageHeaderPlayersStrip` (docs/ui.md → "Player
 * identity = a colored disc").
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
  expected,
  presentUserIds,
  manuallyPausedBy,
  onResume,
  actBackToClub,
  actEndGame,
}: Props) {
  // Anyone expected but off the channel is who we're waiting on. Derived
  // here (not passed in) so the roster and the "someone's missing" gate
  // share a single source of truth.
  const someoneMissing = expected.some((m) => !presentUserIds.has(m.user_id))
  if (!someoneMissing && !manuallyPausedBy) return null

  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div className={styles.banner}>
        {someoneMissing && (
          <>
            <strong>Waiting for everyone to connect…</strong>
            {/* The whole team, one per row. The list block is centered but
                its rows are left-aligned, so every dot shares one column. */}
            <ul className={styles.roster}>
              {expected.map((m) => {
                const present = presentUserIds.has(m.user_id)
                return (
                  <li key={m.user_id} className={styles.rosterItem}>
                    {/* Present: their color disc. Absent: a hollow gray ring
                        (--dot-ring override) — "not here" reads at a glance. */}
                    <Dot
                      color={m.color}
                      hollow={!present}
                      className={styles.rosterDot}
                    />
                    <span className={styles.rosterName}>{m.username}</span>
                  </li>
                )
              })}
            </ul>
          </>
        )}
        {manuallyPausedBy && (
          <strong>
            {/* `show="both"` because this is a sentence, not a pill: dropping the
                name on a phone would leave "● paused the game." */}
            <DotActor actor={manuallyPausedBy} show="both" /> paused the game.
          </strong>
        )}
        <p className="muted">
          The game waits until everyone's joined and connected, and any player
          can pause it. Your in-progress selections reset on every pause.
        </p>
        {/* Actions: Resume (manual pause only), plus the always-available
            escapes — the reliable out if presence never comes back. */}
        {(onResume && manuallyPausedBy) || actBackToClub || actEndGame ? (
          <div className={styles.actions}>
            {onResume && manuallyPausedBy && (
              <StandardButton show="label" label="Resume" weight="primary" onClick={onResume} />
            )}
            {/* Both escapes are the shell's own actions, placed the same way.
                The button says "Back to club" and the confirm behind it is what
                spells out that leaving shelves the game for everyone — which it
                does better than a longer label could. */}
            {actBackToClub && <ActionButton action={actBackToClub} show="both" />}
            {actEndGame && <ActionButton action={actEndGame} show="both" />}
          </div>
        ) : null}
      </div>
    </div>
  )
}
