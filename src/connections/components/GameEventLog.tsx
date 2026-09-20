// cs-met-connections

import { Fragment } from 'react'
import { cls } from '@/common/utils/cls'
import { memberById } from '@/common/members/memberList'
import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import type { Category } from '../lib/board'
import type { EventRow, Player } from '../hooks/useGame'
import styles from './GameEventLog.module.css'

type Props = {
  // Every guess the viewer can currently see. Coop: the whole shared game.
  // Compete: the viewer's own during play, and (once terminal, when RLS opens)
  // everyone's — which is what makes the picker below useful.
  guesses: EventRow[]
  // The board's four categories — PUBLIC in both modes (the FE holds the
  // answer key, see doc.md). Used to name a correct guess's category, so an
  // OPPONENT's correct rows name theirs too; deriving the names from the
  // viewer's own matches would leave every opponent row saying just "Correct".
  categories: Category[]
  players: Player[]
  selfId: string
  mode: 'coop' | 'compete'
  // Distinguishes an opponent's RLS-hidden log from a genuinely empty one.
  isTerminal: boolean
  // The turn currently open in the board viewer — the row's own id — or null
  // when live. Its `#N` handle wears the shared history ring.
  historyId: number | null
  // Open a turn in the board viewer (click its `#N`) — the row's id, and the
  // `#N` this log printed beside it, which is what the banner shows back.
  onShowHistory: (id: number, n: number) => void
}

/**
 * connections's event log — the guesses, in the shared `<EventLog>` table.
 *
 * Each turn is two `<tr>`s (the row anatomy is the game's — see EventLog.tsx):
 * row 1 is `[bar ⇣rowSpan 2] | #N | verdict | actor` in real `<td>` columns,
 * and row 2 spans them with the four guessed tiles in board order, as the FE
 * stored them. The verdict names the matched category on a correct guess
 * ("Colors"), so the row that solved the blue band is legible at a glance;
 * the other two carry the NYT-canonical short text.
 *
 * Whose guesses are shown is the shared `useEventLogPlayerPicker` dropdown in
 * the header. In compete an opponent's rows are empty during play (RLS hides
 * them) and fill in once the game ends, which is what the picker's empty text
 * says.
 */
export function GameEventLog({
  guesses,
  categories,
  players,
  selfId,
  mode,
  isTerminal,
  historyId,
  onShowHistory,
}: Props) {
  const eventLogPicker = useEventLogPlayerPicker<EventRow>({
    players,
    selfId,
    mode,
    isTerminal,
    label: 'Whose guesses to show',
    emptyLabel: 'No guesses yet.',
  })
  const shown = eventLogPicker.filter(guesses)

  // rank → name, off the BOARD (public in both modes) rather than off the
  // viewer's own matches — so an opponent's correct rows name their category
  // too. Each rank appears exactly once, so a Map is the honest shape.
  const nameByRank = new Map<number, string>(categories.map((c) => [c.rank, c.name]))

  return (
    <EventLog heading="Guesses" picker={eventLogPicker} shown={shown}>
      {shown.map((g, i) => (
        <Fragment key={g.id}>
          {/* Row 1, real columns: [bar ⇣rowSpan 2] | #N handle | verdict (`.main`,
              absorbs the slack) | actor (`.who`, shrinks to the username).
              `.divider` draws the line above this turn; `.entryHead`/
              `.entryCont` hug the two rows together. The `#N` handle opens that turn
              on the board viewer. */}
          <tr className={cls(gameEventLog.divider, gameEventLog.entryHead)}>
            <EventLogOutcomeBar outcome={g.outcome} rowSpan={2} />
            {/* The `#N` handle replays that turn on the board. The number counts
                the rows on show; the handle is the row's own id, and PlayArea
                folds the rows of whoever wrote it — so an opponent's row at a
                compete terminal replays THEIR board. */}
            <EventLogNumber
              n={i + 1}
              isOpenInHistory={historyId === g.id}
              onShowHistory={() => onShowHistory(g.id, i + 1)}
            />
            <td className={gameEventLog.main}>{verdictLabel(g, nameByRank)}</td>
            <EventLogActor actor={memberById(players, g.user_id)} />
          </tr>
          {/* Row 2: the four guessed tiles, full width — spanning the #N + verdict +
              who columns beneath the meta line. */}
          <tr className={gameEventLog.entryCont}>
            <td colSpan={3} className={styles.words}>{g.tiles.join(' · ')}</td>
          </tr>
        </Fragment>
      ))}
    </EventLog>
  )
}

/**
 * Short verdict line for one guess row. Correct guesses just name the category
 * (the green outcome bar already says "found", so no "Matched:" prefix); the
 * other two carry the NYT-canonical short text.
 *
 * `matched_category_rank` is non-null IFF the guess MATCHED (the SQL
 * constraint guarantees this); a defensive fallback to plain "Correct" if a
 * future correct row somehow arrived without a rank.
 */
function verdictLabel(
  g: EventRow,
  nameByRank: Map<number, string>,
): string {
  // The MATCH flag, not the color: naming the category is a question about the
  // rules, and `outcome === 'won'` would be a color answering it.
  if (g.matched) {
    const name =
      g.matched_category_rank != null
        ? nameByRank.get(g.matched_category_rank)
        : undefined
    return name ?? 'Correct'
  }
  if (g.outcome === 'near') return 'One away!'
  return 'Not a match'
}
