// cs-fixed-outcome-fix

import type { Member } from '@/common/members/member'
import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import { eventToOutcome } from '../lib/answer'
import { makeEventText } from '../lib/eventText'
import type { GEvent, GHistoryView } from '../types'
import styles from './GameEventLog.module.css'

/**
 * scrabble's move log, on the shared `<EventLog>`: per row, the outcome bar
 * (`eventToOutcome`), the turn number, what the turn did, and who. Newest at
 * the bottom.
 *
 * A word reads "+<score> <WORD> …", the score green and each word bold and
 * **clickable to define**. The rows an ending writes read as the banner and
 * the printout read them (`makeEventText`): "-7 for 3 tiles left", "+7 for
 * going out". Every row is public in both modes: the board is.
 *
 * **Whose moves** are shown is the shared player picker. It defaults to every
 * player in both modes (`competeSharesOneGame`): even a race is one board
 * everyone plays on. A bot is pickable like anyone.
 *
 * The `#N` opens the row's turn on the board viewer by the row's own id; the
 * number counts the rows on show, so a filter renumbers the log without
 * changing which turn a number opens.
 */
export function GameEventLog({
  events,
  players,
  myId,
  mode,
  historyView,
}: {
  // Every row, every player's, oldest first.
  events: GEvent[]
  players: Member[]
  myId: string
  mode: 'coop' | 'compete'
  historyView: GHistoryView
}) {
  const eventLogPicker = useEventLogPlayerPicker<GEvent>({
    players,
    myId,
    mode,
    // Every row is public, so a filtered-empty log is never "hidden".
    isGameEnded: true,
    competeSharesOneGame: true,
    label: 'Whose moves to show',
    emptyLabel: 'No moves yet.',
  })
  const shown = eventLogPicker.filter(events)

  return (
    <EventLog heading="Turns" picker={eventLogPicker} shown={shown}>
      {shown.map((event, i) => (
        <tr key={event.id} className={gameEventLog.divider}>
          {/* The bar's word is `lib/answer.ts`'s — the log names none of its
              own, so it cannot disagree with the pill about the same turn. */}
          <EventLogOutcomeBar outcome={eventToOutcome(event)} />
          <EventLogNumber
            n={i + 1}
            isOpenInHistory={historyView.viewedEventId === event.id}
            onShowHistory={() => historyView.show(event.id, i + 1)}
          />
          <td className={gameEventLog.main}>
            {event.kind === 'word' && (
              <>
                <span className={styles.score}>+{event.score!}</span>{' '}
                {event.words!.map((w, j) => (
                  <span key={`${w}-${j}`}>
                    {j > 0 ? ' ' : ''}
                    <DefinableWord word={w} className={styles.word} />
                  </span>
                ))}
              </>
            )}
            {event.kind === 'exchange' && <span>Exchanged {event.nTiles!} tiles</span>}
            {event.kind === 'pass' && <span>Passed</span>}
            {event.kind === 'leftovers' && (
              <span className={styles.scoreNeg}>{makeEventText(event)}</span>
            )}
            {event.kind === 'went_out' && (
              <span className={styles.score}>{makeEventText(event)}</span>
            )}
          </td>
          <EventLogActor actor={event.by} />
        </tr>
      ))}
    </EventLog>
  )
}
