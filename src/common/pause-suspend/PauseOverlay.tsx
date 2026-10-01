// cs-blessed-pause-suspend

import type { Member } from '../members/member'
import { Dot } from '../members/Dot'
import { DotActor } from '../members/ActorMention'
import { ActionButton } from '../actions/ActionButton'
import type { Action } from '../actions/useBindAction'
import type { GamePause } from './pause'
import styles from './PauseOverlay.module.css'
import { StandardButton } from '../buttons/StandardButton'

/** The two ways out of a pause that won't clear. Bound by the game page, which
 *  sits above the boundary that unmounts the game's own actions. */
export type PauseActions = {
  // Leave for the club, shelving the game.
  actBackToClub: Action
  // Stop the game; hidden unless paused.
  actStopGame: Action
}

type Props = {
  // The pause: who pressed it, who is connected, and Resume.
  pause: GamePause
  // Who the pause waits for, one row each: a filled disc when present, a
  // hollow ring when away.
  players: Member[]
  actions: PauseActions
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
 *   - `pause.manuallyPausedBy` is set — "Bea paused the game", with Resume beside it.
 *     Resume clears only the manual pause; a presence pause outlives it.
 *
 * The roster it draws is the WHOLE team and not just the missing, so a waiting
 * player sees who is already here alongside who we are still waiting on. Names
 * stay black wherever the overlay writes one — the disc alone carries
 * identity, the same grammar as the header's `PageHeaderPlayersStrip`
 * (docs/ui.md → "Player identity = a colored disc").
 *
 * Paused is not suspended; docs/states.md → paused defines both words.
 */
export function PauseOverlay({ pause, players, actions }: Props) {
  // Anyone on the list but off the channel is who we're waiting on, which is
  // what draws the roster. Whether the game is paused at all is not asked here — the
  // boundary decided that before rendering this.
  const someoneMissing = players.some((m) => !pause.presentUserIds.has(m.user_id))

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
                const present = pause.presentUserIds.has(m.user_id)
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
        {pause.manuallyPausedBy && (
          <strong>
            {/* `show="both"`, against DotActor's default: this banner is the
                whole message and has 32rem to itself, so no name can overflow
                it — and "who stopped my game" is worth the width on a phone
                too. */}
            <DotActor actor={pause.manuallyPausedBy} show="both" /> paused the game.
          </strong>
        )}
        {/* One sentence per source, so neither explains the other's pause. */}
        <p className="muted">
          {someoneMissing && 'The game is waiting until everyone is joined and connected. '}
          {pause.manuallyPausedBy && 'Any player can pause the game.'}
        </p>
        {/* Resume belongs to a manual pause only — a presence pause clears
            when the player comes back, not because anyone pressed anything.
            The two escapes are always here: they are the out if presence never
            comes back. */}
        <div className={styles.actions}>
          {pause.manuallyPausedBy && (
            <StandardButton
              show="label"
              label="Resume"
              weight="primary"
              onClick={pause.sendManualUnpause}
            />
          )}
          {/* Both escapes are the shell's own actions, placed the same way.
              The button says "Back to club" and the confirm behind it is what
              spells out that leaving shelves the game for everyone — which it
              does better than a longer label could. */}
          <ActionButton action={actions.actBackToClub} show="both" />
          <ActionButton action={actions.actStopGame} show="both" />
        </div>
      </div>
    </div>
  )
}
