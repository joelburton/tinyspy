// cs-unmet

import { games } from '../../../games'
import { cls } from '../../lib/util/cls'
import { friendlyDate } from '../../lib/util/friendlyDate'
import { GameLogo } from '../branding/GameLogo'
import { ModePill } from '../game/ModePill'
import { ClubGameDeleteButton } from './ClubGameDeleteButton'
import styles from './ClubGameRow.module.css'

export type ClubGameState = 'active' | 'suspended' | 'completed'

type Props = {
  /** The gametype — drives the logo and the mode pill. */
  gametype: string
  /** Algorithmic per-game title from `common.games.title`. Optional because the
   *  lookup map may not have populated by first render. */
  title?: string
  /** Gametype-rendered status string, e.g. "13/16 agents" or "lost (assassin)".
   *  Produced by the manifest's `labelFor`. */
  statusLabel: string
  /** `common.games.last_active_at`, ISO — the last status/progress write (or end
   *  time), a "last played" proxy. Rendered via friendlyDate. */
  lastActiveAt: string
  /** Where in the lifecycle this game sits. Drives exactly one thing: the corner
   *  flag (orange = the club's current game, yellow = shelved but still open,
   *  none = finished). */
  state: ClubGameState
  /** Whether this row's club is a solo club. Forwarded to <ModePill> so the
   *  "Co-op" pill is suppressed there. */
  soloClub: boolean
  /** Omit and the row is read-only — no delete affordance renders. */
  onDelete?: () => Promise<void> | void
}

/**
 * One game's row in ClubPage's "Your games" list — the CONTENTS of a
 * `<SelectionList>` row, not the row itself. The list owns the box, the hover,
 * the cursor ring and the click; this owns what is inside it:
 *
 *   [logo]  <title> <mode pill>
 *           <status> ······················ <last played>
 *
 * with a corner flag when the game is still open and a hover-revealed delete ×.
 *
 * **A row, not a card.** `.card` is a page-level pattern in this repo — a
 * bordered section of a page — and a list item is not one. The standalone
 * current-game callout above the list is a separate component that happens to
 * wear a similar face; it is not a list of one (Joel, 2026-08-24), and the two
 * sharing an inner shape is a question for the club-page area rather than for
 * this pass (plans/selection-lists.md).
 */
export function ClubGameRow({
  gametype,
  title,
  statusLabel,
  lastActiveAt,
  state,
  soloClub,
  onDelete,
}: Props) {
  const manifest = games.find((g) => g.gametype === gametype)
  // Friendly relative date — see friendlyDate.ts. Doesn't tick; re-renders when
  // ClubPage refetches via realtime, which is often enough for a game list.
  const dateLabel = friendlyDate(lastActiveAt)

  return (
    <>
      {state !== 'completed' && (
        // Corner-flag triangle: orange for THE current game, yellow for one
        // that's shelved but still open. A literal triangle rather than a
        // colored circle, which would collide with the member-color dot
        // vocabulary — "flag in the corner" is its own register, with no room
        // to read it as "the yellow player is in this game". aria-hidden
        // because the status label already says the same thing in words.
        <span
          className={cls(
            styles.openFlag,
            state === 'active' ? styles.openFlagActive : styles.openFlagSuspended,
          )}
          aria-hidden="true"
        />
      )}
      <GameLogo gametype={gametype} />
      <div className={styles.content}>
        <div className={styles.titleRow}>
          {title && <span className={styles.gameTitle}>{title}</span>}
          {manifest && (
            <ModePill mode={manifest.mode} soloClub={soloClub} aiOpponent={manifest.aiOpponent} />
          )}
        </div>
        <div className={styles.meta}>
          <span>{statusLabel}</span>
          <span className={styles.startedAt}>{dateLabel}</span>
        </div>
      </div>
      {onDelete && <ClubGameDeleteButton onDelete={onDelete} />}
    </>
  )
}
