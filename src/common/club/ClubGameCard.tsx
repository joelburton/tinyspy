// cs-unmet

import type { GameManifest } from '../manifest/gameManifest'
import { Link } from '../routing/Link'
import { gamePath } from '../routing/routes'
import { friendlyDate } from '../utils/friendlyDate'
import { GameLogo } from '../branding/GameLogo'
import { ModePill } from '../game-page/ModePill'
import { ClubGameDeleteButton } from './ClubGameDeleteButton'
import styles from './ClubGameCard.module.css'

type Props = {
  /** The id of this game (drives the routing target). */
  gameId: string
  /** The gametype's manifest — drives the routing target, the logo and the
   *  mode pill. ClubPage has it in hand for every row it builds. */
  manifest: GameManifest
  /** Algorithmic per-game title from `common.games.title`. Optional because the
   *  lookup map may not have populated by first render. */
  title?: string
  /** Gametype-rendered status string, produced by the manifest's `labelFor`. */
  statusLabel: string
  /** `common.games.last_active_at`, ISO. Rendered via friendlyDate. */
  lastActiveAt: string
  /** Called when the user confirms the delete affordance. ClubPage owns the
   *  mechanics. Omit and the callout is read-only. */
  onDelete?: () => Promise<void> | void
  /** Whether this club is a solo club. Forwarded to <ModePill>. */
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
export function ClubGameCard({
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
        {/* Orange corner flag: "this is THE current game — join now." */}
        <span className={styles.openFlagActive} aria-hidden="true" />
        <GameLogo manifest={manifest} />
        <div className={styles.content}>
          <div className={styles.titleRow}>
            {title && <span className={styles.gameTitle}>{title}</span>}
            <ModePill mode={manifest.mode} soloClub={soloClub} aiOpponent={manifest.aiOpponent} />
          </div>
          <div className={styles.meta}>
            <span>{statusLabel}</span>
            <span className={styles.startedAt}>{dateLabel}</span>
          </div>
        </div>
      </Link>
      {onDelete && <ClubGameDeleteButton onDelete={onDelete} />}
    </div>
  )
}
