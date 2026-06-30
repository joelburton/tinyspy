import { Fragment } from 'react'
import { ActorTag } from '../../common/components/ActorTag'
import { cls } from '../../common/lib/cls'
import { memberById } from '../../common/lib/peers'
import { TurnLog, TurnLogBar, type TurnOutcome } from '../../common/components/TurnLog'
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
 * Stateless and presentational. connections renders its own **two-`<tr>`** turn
 * (the row anatomy is the game's — see TurnLog.tsx): row 1 is `[bar ⇣rowSpan 2] |
 * verdict | actor` in **real `<td>` columns** (the actor right-aligned via the
 * shared `.who`), and row 2 spans those columns with the four guessed tiles (full
 * width, in board order — kept as the FE stored them, so the row matches what the
 * players were looking at). Real table cells, not a flexbox sub-line inside one
 * cell (that throws away the column alignment the table exists for — see
 * design-decisions.md → Conversion gotchas). `.turnLogDivider` on row 1 draws the
 * between-turns line. The verdict names the matched
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

  return (
    <TurnLog
      heading="Guesses"
      empty={guesses.length === 0}
      emptyText="No guesses yet."
      scrollKey={guesses}
    >
      {guesses.map((g) => (
        <Fragment key={g.id}>
          {/* Row 1, real columns: [bar ⇣rowSpan 2] | verdict (`.main`, absorbs
              the slack) | actor (`.who`, shrinks to the username). `.turnLogDivider`
              draws the line above this turn; `.entryHead`/`.entryCont` hug the two
              rows together. */}
          <tr className={cls(turnLog.turnLogDivider, turnLog.entryHead)}>
            <TurnLogBar outcome={OUTCOME[g.result]} rowSpan={2} />
            <td className={turnLog.main}>{verdictLabel(g, nameByRank)}</td>
            <td className={turnLog.who}>
              <ActorTag actor={memberById(players, g.user_id)} />
            </td>
          </tr>
          {/* Row 2: the four guessed tiles, full width — spanning the verdict +
              who columns beneath the meta line. */}
          <tr className={turnLog.entryCont}>
            <td colSpan={2} className={styles.words}>{g.tiles.join(' · ')}</td>
          </tr>
        </Fragment>
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
