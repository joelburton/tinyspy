import { colorVarFor } from '../../common/lib/peerColor'
import type { SetupMember } from '../../common/lib/games'
import type { GuessRow, MatchedCategory } from '../hooks/useGame'
import styles from './GuessHistory.module.css'

type Props = {
  guesses: GuessRow[]
  matchedCategories: MatchedCategory[]
  members: SetupMember[]
}

/**
 * The append-only log of guesses for this wordknit game,
 * rendered to the right of the board.
 *
 * Stateless and presentational — owns no state, makes no RPC
 * calls, just renders what's handed in. Mirrors the
 * `<GuessHistory>` component name in psychic-num so a reader
 * scanning per-game folders sees the parallel.
 *
 * Each row shows: the 4 tiles guessed (in board order — kept as
 * the FE stored them, not re-sorted, so the visual matches what
 * the players were looking at when they submitted), who guessed,
 * and a short verdict. Background fill comes from the common
 * outcome tokens (`--color-outcome-won/lost/near-bg`) so the
 * three states read as a single semantic palette across surfaces:
 *
 *   - **Correct** — green; subtitle names the matched category
 *     ("Matched: Words starting with A"). The category name is
 *     looked up from `matchedCategories` by rank — that array
 *     is what the FE just used to draw the category band, so the
 *     name is guaranteed to be the same string the player saw.
 *   - **One away** — amber. The NYT phrasing ("One away!") is
 *     the gameplay convention so we use it verbatim.
 *   - **Wrong** — red. "Not a match" — short enough to not
 *     dominate the row.
 *
 * Latest first: most players want to scan "what did we just try
 * and what came of it" before the older history. The board
 * shows the current state; the history shows the path to it.
 */
export function GuessHistory({ guesses, matchedCategories, members }: Props) {
  const memberFor = (userId: string) =>
    members.find((m) => m.user_id === userId)

  // Build a rank → name lookup once for the matched-category
  // attribution. Each rank appears at most once in
  // matchedCategories (one band per rank), so a Map is the
  // honest shape; Array.find would also work but reads less
  // self-evidently for a per-row lookup.
  const nameByRank = new Map<number, string>(
    matchedCategories.map((m) => [m.rank, m.name]),
  )

  return (
    <section className={styles.history}>
      <h3 className={styles.heading}>Guesses</h3>
      {guesses.length === 0 ? (
        <p className="muted">No guesses yet.</p>
      ) : (
        <ol className={styles.list}>
          {[...guesses].reverse().map((g) => {
            const guesser = memberFor(g.user_id)
            return (
              <li
                key={g.id}
                className={`${styles.item} ${styles[`item_${g.result}`]}`}
              >
                <div className={styles.tiles}>{g.tiles.join(' · ')}</div>
                <div className={styles.meta}>
                  <span
                    className={styles.user}
                    style={{ color: colorVarFor(guesser?.color) }}
                  >
                    {guesser?.username ?? 'someone'}
                  </span>
                  <span className={styles.separator}> · </span>
                  <span>{verdictLabel(g, nameByRank)}</span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/**
 * Short verdict line for one guess row. Correct guesses name
 * the category that was matched (so "the third row in this list
 * is the one that solved the blue band" is legible at a glance);
 * the other two outcomes carry the NYT-canonical short copy.
 *
 * `matched_category_rank` is non-null IFF result === 'correct' —
 * the SQL constraint guarantees this; if a future correct row
 * somehow arrived with a null rank, we fall back to a plain
 * "Correct" rather than a confusing "Matched: undefined."
 */
function verdictLabel(
  g: GuessRow,
  nameByRank: Map<number, string>,
): string {
  if (g.result === 'correct') {
    const name =
      g.matched_category_rank != null
        ? nameByRank.get(g.matched_category_rank)
        : undefined
    return name ? `Matched: ${name}` : 'Correct'
  }
  if (g.result === 'oneAway') return 'One away!'
  return 'Not a match'
}
