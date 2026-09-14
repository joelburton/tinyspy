// cs-audited-club-page

import type { GameManifest } from '../manifest/gameManifest'
import { Link } from '../routing/Link'
import { gamePath } from '../routing/routes'
import { friendlyDate } from '../utils/friendlyDate'
import { GameEntry } from './GameEntry'
import { ClubGameDeleteButton } from './ClubGameDeleteButton'
import styles from './CurrentGameCard.module.css'

type Props = {
  /** The id of this game (drives the routing target). */
  gameId: string
  /** The gametype's manifest — drives the routing target, the logo and the
   *  mode badge. ClubPage has it in hand for every row it builds. */
  manifest: GameManifest
  // The algorithmic per-game title, from `common.games.title` — `not null`
  // there, and resolved by ClubPage before it builds the card.
  title: string
  /** Gametype-rendered status string, produced by the manifest's `labelFor`. */
  statusLabel: string
  /** `common.games.last_active_at`, ISO. Rendered via friendlyDate. */
  lastActiveAt: string
  /** Called when the user confirms the delete affordance. ClubPage owns the
   *  mechanics. Omit and the callout is read-only. */
  onDelete?: () => Promise<void> | void
  /** Whether this club is a solo club. Forwarded to <ModeBadge>. */
  soloClub: boolean
}

/**
 * The club's CURRENT game, called out above the start list — the one game entry
 * on the page that belongs to no list.
 *
 * It is not a SelectionList of one (Joel, 2026-08-24). It wears a face close to
 * `<ClubGameRow>`'s and is deliberately a step larger: a bordered box with a
 * bigger title, being a single call to action with nothing to be dense against.
 * The current game also appears as an ordinary row down in "Your games", flying
 * its orange flag there — this is the second, louder place it shows up, not a
 * variant of the first.
 *
 * **The duplication between this and `<ClubGameRow>` is known and left.**
 * Whether the two should share an inner shape is a club-page question, and that
 * area has not opened (docs/ui.md → Selection lists).
 */
export function CurrentGameCard({
  gameId,
  manifest,
  title,
  statusLabel,
  lastActiveAt,
  onDelete,
  soloClub,
}: Props) {
  const dateLabel = friendlyDate(lastActiveAt)

  return (
    <div className={styles.standalone}>
      <Link to={gamePath(manifest.gametype, gameId)} className={styles.link}>
        <GameEntry
          manifest={manifest}
          title={title}
          isCurrentGameCard
          state="current"
          meta={statusLabel}
          date={dateLabel}
          soloClub={soloClub}
        />
      </Link>
      {onDelete && <ClubGameDeleteButton onDelete={onDelete} />}
    </div>
  )
}
