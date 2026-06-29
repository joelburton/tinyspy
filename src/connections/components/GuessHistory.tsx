import { colorVarFor } from '../../common/lib/memberColor'
import { TurnLog, TurnLogEntry, type TurnOutcome } from '../../common/components/TurnLog'
import turnLog from '../../common/components/TurnLog.module.css'
import type { GuessRow, MatchedCategory, Player } from '../hooks/useGame'
import styles from './GuessHistory.module.css'

type Props = {
  guesses: GuessRow[]
  matchedCategories: MatchedCategory[]
  players: Player[]
}

/** connections's three guess verdicts → the shared turn-log outcome bar. */
const OUTCOME: Record<GuessRow['result'], TurnOutcome> = {
  correct: 'good',
  oneAway: 'partial',
  wrong: 'bad',
}

/**
 * The append-only log of this connections game's guesses, rendered with the
 * shared `<TurnLog>` table (same chrome psychicnum uses, so a player reads the
 * same log shape across games).
 *
 * Stateless and presentational. One row per guess: the shared outcome bar
 * (green correct / amber one-away / red wrong), the four tiles guessed on top
 * (full width, in board order — kept as the FE stored them, so the row matches
 * what the players were looking at), then a second line with the verdict (left)
 * and the actor + their identity dot (right). The verdict names the matched
 * category on a correct guess ("Matched: Colors"), so "the row that solved the
 * blue band" is legible at a glance; the other two outcomes carry the
 * NYT-canonical copy.
 *
 * In compete mode RLS scopes `guesses` to the caller, so this shows only the
 * viewer's own attempts.
 */
export function GuessHistory({ guesses, matchedCategories, players }: Props) {
  const playerFor = (userId: string) =>
    players.find((m) => m.user_id === userId)

  // rank → name, for the matched-category attribution. Each rank appears at
  // most once in matchedCategories (one band per rank), so a Map is the honest
  // shape and the per-row lookup reads cleanly.
  const nameByRank = new Map<number, string>(
    matchedCategories.map((m) => [m.rank, m.name]),
  )

  // The actor's identity — name + colored dot, right-justified on the meta line.
  const whoInline = (userId: string) => {
    const actor = playerFor(userId)
    return (
      <span className={styles.who}>
        <span className={turnLog.actor}>{actor?.username ?? 'someone'}</span>
        <span
          className={turnLog.dot}
          style={{ color: colorVarFor(actor?.color) }}
          aria-hidden="true"
        >
          ●
        </span>
      </span>
    )
  }

  return (
    <TurnLog
      heading="Guesses"
      empty={guesses.length === 0}
      emptyText="No guesses yet."
      scrollKey={guesses}
      className={styles.history}
    >
      {guesses.map((g) => (
        <TurnLogEntry key={g.id} outcome={OUTCOME[g.result]}>
          {/* One content cell beside the outcome bar: the four guessed tiles on
              top (full width — not squished by a who-column), then the verdict
              (left) and the actor (right) below. */}
          <td>
            <div className={styles.words}>{g.tiles.join(' · ')}</div>
            <div className={styles.metaRow}>
              <span className={turnLog.meta}>{verdictLabel(g, nameByRank)}</span>
              {whoInline(g.user_id)}
            </div>
          </td>
        </TurnLogEntry>
      ))}
    </TurnLog>
  )
}

/**
 * Short verdict line for one guess row. Correct guesses just name the category
 * (the green outcome bar already says "found", so no "Matched:" prefix); the
 * other two carry the NYT-canonical short copy.
 *
 * `matched_category_rank` is non-null IFF result === 'correct' (the SQL
 * constraint guarantees this); a defensive fallback to plain "Correct" if a
 * future correct row somehow arrived without a rank.
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
    return name ?? 'Correct'
  }
  if (g.result === 'oneAway') return 'One away!'
  return 'Not a match'
}
