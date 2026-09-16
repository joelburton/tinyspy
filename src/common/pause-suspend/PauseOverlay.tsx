// cs-met-pause-suspend

import type { Member } from '../members/member'
import { Dot } from '../members/Dot'
import { DotActor } from '../members/ActorMention'
import { ActionButton } from '../actions/ActionButton'
import type { BoundAction } from '../actions/useBoundAction'
import styles from './PauseOverlay.module.css'
import { StandardButton } from '../buttons/StandardButton'

type Props = {
  // The players to draw — everyone we are waiting on (conceders already
  // excluded upstream), one per row with an identity disc: filled color when
  // present, a hollow gray "away" ring when absent.
  players: Member[]
  // User ids currently on the game's realtime channel. Anyone in `players` but
  // not here is drawn as an away ring.
  presentUserIds: Set<string>
  // Set when a player pressed Pause, which is what draws the "X paused the
  // game" line. null when the pause is presence-only.
  manuallyPausedBy: Member | null
  // Releases a manual pause, drawn as the Resume button beside it. Any
  // connected player may press it — there is no privileged "original pauser".
  onResume: () => void
  // Leave for the club, shelving the game — the reliable escape when a presence
  // pause will not clear (the automatic recovery is `useRealtimeReconnect`, and
  // its docstring is where that deadlock is written down). `GamePage`'s
  // `act-back-to-club`, the same one every other surface places, so leaving
  // from here is the act it is anywhere else: a solo game shelves at once, a
  // game with peers asks first. It goes through PostgREST, so it works even if
  // Realtime is wedged.
  actBackToClub: BoundAction
  // End the game now — the other escape from a stuck pause. Bound by
  // `GamePage`, above the boundary that unmounts the play area, so this binding
  // survives the pause that the game's own does not. It hides itself unless
  // paused, so this places it without asking.
  actEndGame: BoundAction
}

/**
 * The banner that stands in for the board while a game is paused: who we are
 * waiting on, or who pressed Pause, and the ways out. Rendered only by
 * `PauseBoundary`, in the slot the play surface left.
 *
 * What it says comes from the two pause sources, which can both be true:
 *
 *   - somebody in `players` is off the channel — "Waiting for everyone to
 *     connect…" over the roster, which covers a player who dropped AND one who
 *     was invited and has not arrived yet;
 *   - `manuallyPausedBy` is set — "Bea paused the game", with Resume beside it.
 *     Resume clears only the manual pause; a presence pause outlives it.
 *
 * The roster it draws is the WHOLE team and not just the missing, so a waiting
 * player sees who is already here alongside who we are still waiting on. Names stay black wherever the overlay writes one — the disc alone carries
 * identity, the same grammar as the header's `PageHeaderPlayersStrip`
 * (docs/ui.md → "Player identity = a colored disc").
 *
 * Paused is not suspended; docs/states.md → paused defines both words.
 */
export function PauseOverlay({
  players,
  presentUserIds,
  manuallyPausedBy,
  onResume,
  actBackToClub,
  actEndGame,
}: Props) {
  // Anyone on the list but off the channel is who we're waiting on, which is
  // what draws the roster. Whether the game is paused at all is not asked here — the
  // boundary decided that before rendering this.
  const someoneMissing = players.some((m) => !presentUserIds.has(m.user_id))

  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div className={styles.banner}>
        {someoneMissing && (
          <>
            <strong>Waiting for everyone to connect…</strong>
            {/* The whole team, one per row. The list block is centered but
                its rows are left-aligned, so every dot shares one column. */}
            <ul className={styles.roster}>
              {players.map((m) => {
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
            {/* `show="both"`, against DotActor's default: this banner is the
                whole message and has 32rem to itself, so no name can overflow
                it — and "who stopped my game" is worth the width on a phone
                too. */}
            <DotActor actor={manuallyPausedBy} show="both" /> paused the game.
          </strong>
        )}
        {/* One sentence per source, so neither explains the other's pause. */}
        <p className="muted">
          {someoneMissing && 'The game is waiting until everyone is joined and connected. '}
          {manuallyPausedBy && 'Any player can pause the game.'}
        </p>
        {/* Resume belongs to a manual pause only — a presence pause clears
            when the player comes back, not because anyone pressed anything.
            The two escapes are always here: they are the out if presence never
            comes back. */}
        <div className={styles.actions}>
          {manuallyPausedBy && (
            <StandardButton show="label" label="Resume" weight="primary" onClick={onResume} />
          )}
          {/* Both escapes are the shell's own actions, placed the same way.
              The button says "Back to club" and the confirm behind it is what
              spells out that leaving shelves the game for everyone — which it
              does better than a longer label could. */}
          <ActionButton action={actBackToClub} show="both" />
          <ActionButton action={actEndGame} show="both" />
        </div>
      </div>
    </div>
  )
}
