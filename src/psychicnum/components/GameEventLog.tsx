// cs-blessed-psychicnum

import { cls } from '@/common/utils/cls'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import {
  EventLog,
  EventLogActor,
  EventLogOutcomeBar,
  EventLogNumber,
} from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import { eventToOutcome } from '../lib/answer'
import type { Member } from '@/common/members/member'
import styles from './GameEventLog.module.css'
import type { GEvent, GHistoryView } from '../types'

type Props = {
  // Every turn the viewer can see (`gd.events`). Coop: the whole shared game.
  // Compete: the viewer's own during play, and everyone's once the game has
  // ended.
  events: GEvent[]
  players: Member[]
  myId: string
  mode: 'coop' | 'compete'
  isGameEnded: boolean
  // The turn open on the board: its `#N` wears the history-blue ring, and a
  // `#N` click opens another.
  historyView: GHistoryView
}

/**
 * psychicnum's event log: its turns in the shared `<EventLog>` table, one row
 * each, colored by `lib/answer.ts`. Three row kinds:
 *   - a **guess** → the word and "Correct" / "Wrong";
 *   - a **spoiler** (a secret handed over) → the word and "Spoiler";
 *   - a **hint** (a clue) → one cell spanning both, "Hint: <clue>".
 *
 * Whose turns show is the shared `useEventLogPlayerPicker`'s: "Team" or "All"
 * plus each player. In compete an opponent's rows are withheld until the game
 * ends (`useGame`'s seat rule), which is what the picker's empty text says.
 */
export function GameEventLog({
  events,
  players,
  myId,
  mode,
  isGameEnded,
  historyView,
}: Props) {
  const eventLogPicker = useEventLogPlayerPicker<GEvent>({
    players,
    myId: myId,
    mode,
    isGameEnded,
    emptyLabel: 'No turns yet.',
  })
  const shownEvents = eventLogPicker.filter(events)


  // The NUMBER counts 1, 2, 3 under whatever filter is on; the handle is the
  // row's own id, so the board opens the event the number is beside.
  function drawTurnNumber(event: GEvent, index: number) {
    return (
      <EventLogNumber
        n={index + 1}
        isOpenInHistory={historyView.viewedEventId === event.id}
        onShowHistory={() => historyView.show(event.id, index + 1)}
      />
    )
  }

  // The verdict word is the log's own; its color is `lib/answer.ts`'s.
  function makeResultText(event: GEvent): string {
    if (event.kind === 'spoiler') return 'Spoiler'
    else if (event.correct) return 'Correct'
    else return 'Wrong'
  }

  return (
    <EventLog heading="Turns" picker={eventLogPicker} shown={shownEvents}>
      {shownEvents.map((event, index) => {
        if (event.kind === 'hint') {
          return (
            <tr key={event.id} className={gameEventLog.divider}>
              <EventLogOutcomeBar outcome={eventToOutcome(event)} />
              {drawTurnNumber(event, index)}
              {/* The clue spans the word and result columns, and is the row's
                  main column. */}
              <td colSpan={2} className={cls(gameEventLog.main, styles.hint)}>
                <span className={gameEventLog.muted}>Hint:</span> {event.word}
              </td>
              <EventLogActor actor={event.by} />
            </tr>
          )
        }
        return (
          <tr key={event.id} className={gameEventLog.divider}>
            <EventLogOutcomeBar outcome={eventToOutcome(event)} />
            {drawTurnNumber(event, index)}
            {/* A guessed or spoiled word is a dictionary word, so it can be
                looked up; a hint's clue above cannot. */}
            <td className={cls(gameEventLog.other, gameEventLog.primary)}>
              <DefinableWord word={event.word} />
            </td>
            <td className={gameEventLog.main}>{makeResultText(event)}</td>
            <EventLogActor actor={event.by} />
          </tr>
        )
      })}
    </EventLog>
  )
}
