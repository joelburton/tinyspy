// cs-blessed-connections

import { Fragment } from 'react'
import { cls } from '@/common/utils/cls'
import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import type { Member } from '@/common/members/member'
import type { GCategory, GEvent, GHistoryView } from '../types'
import styles from './GameEventLog.module.css'

type Props = {
  // Every guess the viewer can see: coop's whole shared game; in compete my
  // own during play, and everyone's once the game has ended.
  events: GEvent[]
  // The puzzle's four categories, public in both modes — names a correct
  // guess's category, an opponent's too.
  cats: GCategory[]
  players: Member[]
  myId: string
  mode: 'coop' | 'compete'
  // Distinguishes an opponent's withheld log from a genuinely empty one.
  isGameEnded: boolean
  historyView: GHistoryView
}

/**
 * connections' event log — the guesses, in the shared `<EventLog>` table.
 *
 * Each turn is two `<tr>`s (the row anatomy is the game's — see EventLog.tsx):
 * row 1 is `[bar ⇣rowSpan 2] | #N | verdict | actor` in real `<td>` columns,
 * and row 2 spans them with the four guessed tiles in board order, as the FE
 * stored them. The verdict names the matched category on a correct guess
 * ("Colors"), so the row that solved the blue band is legible at a glance;
 * the other two carry the NYT-canonical short text.
 *
 * Whose guesses are shown is the shared `useEventLogPlayerPicker` dropdown in
 * the header. In compete an opponent's rows are empty during play (the seat
 * rule withholds them) and fill in once the game ends, which is what the
 * picker's empty text says.
 */
export function GameEventLog({
  events,
  cats,
  players,
  myId,
  mode,
  isGameEnded,
  historyView,
}: Props) {
  const eventLogPicker = useEventLogPlayerPicker<GEvent>({
    players,
    myId,
    mode,
    isGameEnded,
    label: 'Whose guesses to show',
    emptyLabel: 'No guesses yet.',
  })
  const shown = eventLogPicker.filter(events)

  // rank → name, off the PUZZLE rather than off the viewer's own matches, so an
  // opponent's correct rows name their category too.
  const nameByRank = new Map<number, string>(cats.map((c) => [c.rank, c.name]))

  return (
    <EventLog heading="Guesses" picker={eventLogPicker} shown={shown}>
      {shown.map((g, i) => (
        <Fragment key={g.id}>
          {/* Row 1: the bar spanning both rows, the `#N` handle that opens
              this turn on the board, the verdict, the actor. */}
          <tr className={cls(gameEventLog.divider, gameEventLog.entryHead)}>
            <EventLogOutcomeBar outcome={g.outcome} rowSpan={2} />
            {/* The number counts the rows on show; the handle is the row's own
                id, and the history view folds the rows of whoever wrote it. */}
            <EventLogNumber
              n={i + 1}
              isOpenInHistory={historyView.viewedEventId === g.id}
              onShowHistory={() => historyView.show(g.id, i + 1)}
            />
            <td className={gameEventLog.main}>{verdictLabel(g, nameByRank)}</td>
            <EventLogActor actor={g.by} />
          </tr>
          {/* Row 2: the four guessed tiles, across the three columns. */}
          <tr className={gameEventLog.entryCont}>
            <td
              colSpan={3}
              className={styles.words}
            >
              {g.tiles.map((t) => t.word).join(' · ')}
            </td>
          </tr>
        </Fragment>
      ))}
    </EventLog>
  )
}

/**
 * Short verdict line for one guess row. A correct guess just names its
 * category (the green outcome bar already says "found", so no "Matched:"
 * prefix); the other two carry the NYT-canonical short text.
 */
function verdictLabel(g: GEvent, nameByRank: Map<number, string>): string {
  // The MATCH flag, not the color: naming the category is a question about the
  // rules. A correct row names a rank `submit_guess` checked against 0..3, and
  // the puzzle carries all four, so neither lookup can miss.
  if (g.matched) return nameByRank.get(g.matchedCatRank!)!
  if (g.result === 'oneAway') return 'One away!'
  return 'Not a match'
}
