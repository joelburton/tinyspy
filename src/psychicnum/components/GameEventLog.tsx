// cs-blessed-psychicnum

import { cls } from '@/common/utils/cls'
import { memberById } from '@/common/members/memberList'
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
import type { EventRow } from '../hooks/useGame'
import type { HistoryView } from '../hooks/useHistoryView'
import styles from './GameEventLog.module.css'

type Props = {
  // Every turn the viewer can see. Coop: the whole shared game. Compete: the
  // viewer's own during play, and (once the game has ended, when RLS opens)
  // everyone's.
  events: EventRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  // Distinguishes an opponent's RLS-hidden log from a genuinely empty one.
  isGameEnded: boolean
  // The turn open on the board: its `#N` wears the history-blue ring, and a
  // `#N` click opens another.
  historyView: HistoryView
}

/**
 * psychicnum's event log: its turns in the shared `<EventLog>` table, one row
 * each, colored by `lib/answer.ts`. Three row kinds:
 *   - a **guess** → the word and "Correct" / "Wrong";
 *   - a **spoiler** (a secret handed over) → the word and "Spoiler";
 *   - a **hint** (a clue) → one cell spanning both, "Hint: <clue>".
 *
 * Whose turns show is the shared `useEventLogPlayerPicker`'s: "Team" or "All"
 * plus each player. In compete an opponent's rows are hidden by RLS until the
 * game ends, which is what the picker's empty text says.
 */
export function GameEventLog({
  events,
  players,
  selfId,
  mode,
  isGameEnded,
  historyView,
}: Props) {
  const eventLogPicker = useEventLogPlayerPicker<EventRow>({
    players,
    selfId,
    mode,
    isTerminal: isGameEnded,
    emptyLabel: 'No turns yet.',
  })
  const shownEvents = eventLogPicker.filter(events)

  function drawActorCell(userId: string) {
    return <EventLogActor actor={memberById(players, userId)} />
  }

  // The NUMBER counts 1, 2, 3 under whatever filter is on; the handle is the
  // row's own id, so the board opens the event the number is beside.
  function drawTurnNumber(event: EventRow, index: number) {
    return (
      <EventLogNumber
        n={index + 1}
        isOpenInHistory={historyView.viewedEventId === event.id}
        onShowHistory={() => historyView.show(event.id, index + 1)}
      />
    )
  }

  // The verdict word is the log's own; its color is `lib/answer.ts`'s.
  function makeResultText(event: EventRow): string {
    if (event.kind === 'spoiler') return 'Spoiler'
    else if (event.is_correct) return 'Correct'
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
              {drawActorCell(event.user_id)}
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
            {drawActorCell(event.user_id)}
          </tr>
        )
      })}
    </EventLog>
  )
}
