import { Fragment } from 'react'
import { TurnLogActor } from '../../common/components/game/lists/TurnLogActor'
import { cls } from '../../common/lib/util/cls'
import { memberById } from '../../common/lib/game/peers'
import { TurnLog, TurnLogBar, TurnLogNumber, type TurnOutcome } from '../../common/components/game/lists/TurnLog'
import turnLog from '../../common/components/game/lists/TurnLog.module.css'
import { useTurnLogPlayerPicker } from '../../common/hooks/game/useTurnLogPlayerPicker'
import type { Category } from '../lib/board'
import type { GuessRow, Player } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

type Props = {
  /** Every guess the viewer can currently see. Coop: the whole shared game.
   *  Compete: the viewer's own during play, and (once terminal, when RLS opens)
   *  everyone's — which is what makes the picker below useful. */
  guesses: GuessRow[]
  /** The board's four categories — PUBLIC in both modes (the FE holds the answer
   *  key, see connections.md). Used to name a correct guess's category, so an
   *  OPPONENT's correct rows name theirs too; deriving the names from the
   *  viewer's own matches would leave every opponent row saying just "Correct". */
  categories: Category[]
  players: Player[]
  selfId: string
  mode: 'coop' | 'compete'
  /** Distinguishes an opponent's RLS-hidden log from a genuinely empty one. */
  isTerminal: boolean
  /** Turn-history: the turn currently open in the board viewer (by log position),
   *  or null when live. Its `#N` handle wears the shared yellow ring. */
  viewingIndex: number | null
  /** Open a turn in the board viewer (click its `#N`). */
  onSelectTurn: (index: number) => void
}

/** connections's three guess verdicts → the shared turn-log outcome bar. */
const OUTCOME: Record<GuessRow['result'], TurnOutcome> = {
  correct: 'won',
  oneAway: 'near',
  wrong: 'lost',
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
 * playarea.md → Turn log (conversion gotchas)). `.turnLogDivider` on row 1 draws the
 * between-turns line. The verdict names the matched
 * category on a correct guess ("Matched: Colors"), so "the row that solved the
 * blue band" is legible at a glance; the other two outcomes carry the
 * NYT-canonical copy.
 *
 * **Whose guesses** are shown is picked by the shared
 * `useTurnLogPlayerPicker` dropdown in the header — solo is your handle, coop is
 * "Team" plus each player, compete is "All" plus each player (defaulting to your
 * own board). In compete an
 * opponent's rows are empty during play (RLS hides them) and fill in once the
 * game ends, which is exactly what the picker's empty text says.
 */
export function GameTurnLog({
  guesses,
  categories,
  players,
  selfId,
  mode,
  isTerminal,
  viewingIndex,
  onSelectTurn,
}: Props) {
  const who = useTurnLogPlayerPicker<GuessRow>({
    players,
    selfId,
    mode,
    isTerminal,
    label: 'Whose guesses to show',
    emptyLabel: 'No guesses yet.',
  })
  const shown = who.filter(guesses)

  // rank → name, off the BOARD (public in both modes) rather than off the
  // viewer's own matches — so an opponent's correct rows name their category
  // too. Each rank appears exactly once, so a Map is the honest shape.
  const nameByRank = new Map<number, string>(categories.map((c) => [c.rank, c.name]))

  return (
    <TurnLog
      heading="Guesses"
      headerAction={who.picker}
      empty={shown.length === 0}
      emptyText={who.emptyText}
      scrollKey={shown}
    >
      {shown.map((g, i) => (
        <Fragment key={g.id}>
          {/* Row 1, real columns: [bar ⇣rowSpan 2] | #N handle | verdict (`.main`,
              absorbs the slack) | actor (`.who`, shrinks to the username).
              `.turnLogDivider` draws the line above this turn; `.entryHead`/
              `.entryCont` hug the two rows together. The `#N` handle opens that turn
              on the board viewer. */}
          <tr className={cls(turnLog.turnLogDivider, turnLog.entryHead)}>
            <TurnLogBar outcome={OUTCOME[g.result]} rowSpan={2} />
            {/* The `#N` handle replays that turn on the board — live ONLY when the
                rows on show ARE the board's (my own, or coop's shared game). On an
                opponent's log, or the All view, the board still shows mine, so the
                number stays a plain read-only marker. */}
            {who.boardIsShown ? (
              <TurnLogNumber n={i + 1} viewing={viewingIndex === i} onSelect={() => onSelectTurn(i)} />
            ) : (
              <td className={turnLog.meta}>#{i + 1}</td>
            )}
            <td className={turnLog.main}>{verdictLabel(g, nameByRank)}</td>
            <TurnLogActor actor={memberById(players, g.user_id)} />
          </tr>
          {/* Row 2: the four guessed tiles, full width — spanning the #N + verdict +
              who columns beneath the meta line. */}
          <tr className={turnLog.entryCont}>
            <td colSpan={3} className={styles.words}>{g.tiles.join(' · ')}</td>
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
