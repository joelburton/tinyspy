import { games } from '../../games'
import { Link } from '../lib/Link'
import { cls } from '../lib/cls'
import styles from './ClubGameCard.module.css'

type State = 'active' | 'suspended' | 'completed'

type Props = {
  /** The id of this game (drives the routing target). */
  gameId: string
  /** The gametype — drives both the routing target and the
   *  "Wordknit" / "Tinyspy" header label. */
  gametype: string
  /** Algorithmic per-game title from `common.games.title`.
   *  Optional because the lookup map may not have populated by
   *  first render. */
  title?: string
  /** Gametype-rendered status string, e.g. "13/16 agents" or
   *  "lost (assassin)". Produced by the manifest's `labelFor`. */
  statusLabel: string
  /** Server-stamped game-start timestamp, ISO. Rendered as
   *  "Mar 5, 2026, 2:11 PM" via toLocaleString. */
  startedAt: string
  /** Where in the lifecycle this game sits. Drives both the
   *  action affordance (link vs not) and CSS treatment:
   *  prominent for current, regular for non-terminal-non-current,
   *  muted for terminal. */
  state: State
}

/**
 * One game's entry in a club's games list — the shared card shape
 * for the current game and every game in the merged "other games"
 * list on ClubPage.
 *
 * One component, three states. The fields are the same:
 *
 *   - **Gametype name** (from the manifest, e.g. "Wordknit"), as
 *     a small label above the title.
 *   - **Title** — the algorithmic per-game title from
 *     `common.games.title` ("ALPHA, ANGEL, APPLE, ARROW",
 *     "ada-v-bea: SUN, MOON, …", "7"). The card's biggest text.
 *   - **Status label** — the gametype's own free-form text
 *     ("won — bea guessed it", "13/15 agents", "in progress · 1/4
 *     categories"), produced by `manifest.labelFor`.
 *   - **Started-at** date, smaller / muted.
 *
 * What varies by state, all in CSS:
 *   - `active` — larger font, accent treatment.
 *   - `suspended` — regular treatment.
 *   - `completed` — muted treatment.
 *
 * All three are clickable. Each game's PlayArea already handles
 * the terminal play_state as a "view the final state" mode: the
 * game's own load logic reads its row, sees `is_terminal`, and
 * renders the post-game shape (wordknit: matched + revealed-
 * unmatched bands, no tile grid; tinyspy: full 5×5 board with
 * post-game peer-key stripes; psychic-num: ResultBanner +
 * GuessHistory). No special review-page is needed.
 */
export function ClubGameCard({
  gameId,
  gametype,
  title,
  statusLabel,
  startedAt,
  state,
}: Props) {
  const gameTypeName =
    games.find((g) => g.gametype === gametype)?.name ?? gametype
  const startedAtLabel = new Date(startedAt).toLocaleString()

  return (
    <Link to={`/g/${gametype}/${gameId}`} className={styles.link}>
      <div className={cls(styles.card, styles[state])}>
        <div className={styles.gametype}>{gameTypeName}</div>
        {title && <div className={styles.title}>{title}</div>}
        <div className={styles.statusRow}>
          <span className={styles.status}>{statusLabel}</span>
          <span className={styles.startedAt}>{startedAtLabel}</span>
        </div>
      </div>
    </Link>
  )
}
