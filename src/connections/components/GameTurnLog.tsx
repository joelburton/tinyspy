import { ActorTag } from '../../common/components/ActorTag'
import { memberById } from '../../common/lib/peers'
import { TurnLog, TurnLogItem, type TurnOutcome } from '../../common/components/TurnLog'
import turnLog from '../../common/components/TurnLog.module.css'
import type { GuessRow, MatchedCategory, Player } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

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
 * connections's turn log — its guesses rendered with the shared `<TurnLog>`
 * table (same chrome psychicnum uses, so a player reads the same log shape
 * across games). (Named GameTurnLog, not GuessHistory — see TurnLog.tsx on why
 * a turn-log row isn't "a guess" in the shared vocabulary, even though here it
 * happens to be.)
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
export function GameTurnLog({ guesses, matchedCategories, players }: Props) {
  // rank → name, for the matched-category attribution. Each rank appears at
  // most once in matchedCategories (one band per rank), so a Map is the honest
  // shape and the per-row lookup reads cleanly.
  const nameByRank = new Map<number, string>(
    matchedCategories.map((m) => [m.rank, m.name]),
  )

  // The actor's identity — the shared <ActorTag> (name + colored disc),
  // right-justified on the meta line by the metaRow's space-between.
  const whoInline = (userId: string) => (
    <ActorTag actor={memberById(players, userId)} />
  )

  return (
    <TurnLog
      heading="Guesses"
      empty={guesses.length === 0}
      emptyText="No guesses yet."
      scrollKey={guesses}
    >
      {guesses.map((g) => (
        <TurnLogItem key={g.id} outcome={OUTCOME[g.result]}>
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
        </TurnLogItem>
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
