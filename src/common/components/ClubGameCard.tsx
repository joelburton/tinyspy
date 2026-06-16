import { games } from '../../games'
import type { ClubGameEntry } from '../lib/games'
import { Link } from '../lib/Link'
import { cls } from '../lib/cls'
import styles from './ClubGameCard.module.css'

type State = 'active' | 'suspended' | 'completed'

type Props = {
  entry: ClubGameEntry
  /** Algorithmic per-game title from `common.games.title`. Optional
   *  because the lookup map may not have populated by first render. */
  title?: string
  /** Where in the lifecycle this game sits. Drives both the action
   *  affordance (link vs not) and CSS treatment (prominent for
   *  active, regular for suspended, muted for completed). */
  state: State
}

/**
 * One game's entry in a club's games list — the shared card shape
 * for active, suspended, and completed games on ClubPage.
 *
 * One component, three states. The fields are the same:
 *
 *   - **Gametype name** (from the manifest, e.g. "Wordknit"), as a
 *     small label above the title.
 *   - **Title** — the algorithmic per-game title from
 *     `common.games.title` ("ALPHA, ANGEL, APPLE, ARROW",
 *     "ada-v-bea: SUN, MOON, …", "7"). The card's biggest text.
 *   - **Status label** — the gametype's own free-form text
 *     ("won — bea guessed it", "13/15 agents", "in progress · 1/4
 *     categories"), passed in via `entry.statusLabel`.
 *   - **Started-at** date, smaller / muted.
 *
 * What varies by state, all in CSS:
 *   - `active` — wraps in a Link to the game; larger font,
 *     accent treatment.
 *   - `suspended` — wraps in a Link to the game; regular treatment.
 *   - `completed` — no link (no game-review page yet); muted
 *     treatment.
 *
 * The "is this clickable" check uses `state`, not URL presence —
 * we always *have* the URL, we just choose not to expose it for
 * terminal games.
 */
export function ClubGameCard({ entry, title, state }: Props) {
  const gameTypeName =
    games.find((g) => g.gametype === entry.gameType)?.name
    ?? entry.gameType
  const startedAtLabel = new Date(entry.startedAt).toLocaleString()

  const content = (
    <div className={cls(styles.card, styles[state])}>
      <div className={styles.gametype}>{gameTypeName}</div>
      {title && <div className={styles.title}>{title}</div>}
      <div className={styles.statusRow}>
        <span className={styles.status}>{entry.statusLabel}</span>
        <span className={styles.startedAt}>{startedAtLabel}</span>
      </div>
    </div>
  )

  // Active + suspended → clickable; completed → static. Wrapping
  // in a Link is purely a navigation affordance — the card markup
  // is identical either way.
  if (state === 'completed') return content
  return (
    <Link to={`/g/${entry.gameType}/${entry.gameId}`} className={styles.link}>
      {content}
    </Link>
  )
}
