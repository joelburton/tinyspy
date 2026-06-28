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
 * (green correct / amber one-away / red wrong), the turn number, the four
 * tiles guessed (in board order — kept as the FE stored them, so the row
 * matches what the players were looking at), a short verdict beneath them, and
 * the actor with their identity dot. The verdict names the matched category on
 * a correct guess ("Matched: Colors"), so "the row that solved the blue band"
 * is legible at a glance; the other two outcomes carry the NYT-canonical copy.
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

  // The actor's identity cell — shared shape with psychicnum's log.
  const whoCell = (userId: string) => {
    const actor = playerFor(userId)
    return (
      <td className={turnLog.who}>
        <span className={turnLog.actor}>{actor?.username ?? 'someone'}</span>
        <span
          className={turnLog.dot}
          style={{ color: colorVarFor(actor?.color) }}
          aria-hidden="true"
        >
          ●
        </span>
      </td>
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
      {guesses.map((g, i) => (
        <TurnLogEntry key={g.id} outcome={OUTCOME[g.result]}>
          <td className={turnLog.meta}>#{i + 1}</td>
          {/* The 4 tiles, with the verdict on a sub-line — connections rows
              carry more than a single word, so they stack inside one cell while
              the number + who columns still align across rows. */}
          <td>
            <div className={styles.tiles}>{g.tiles.join(' · ')}</div>
            <div className={turnLog.meta}>{verdictLabel(g, nameByRank)}</div>
          </td>
          {whoCell(g.user_id)}
        </TurnLogEntry>
      ))}
    </TurnLog>
  )
}

/**
 * Short verdict line for one guess row. Correct guesses name the category that
 * was matched; the other two carry the NYT-canonical short copy.
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
    return name ? `Matched: ${name}` : 'Correct'
  }
  if (g.result === 'oneAway') return 'One away!'
  return 'Not a match'
}
