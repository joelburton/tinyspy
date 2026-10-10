// cs-unmet

import type { Member } from '@/common/members/member'
import {
  EventLog,
  EventLogActor,
  EventLogOutcomeBar,
  EventLogNumber,
} from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import { answerMessage, eventToOutcome } from '../lib/answer'
import type { GEvent, GHistoryView } from '../types'
import styles from './GameEventLog.module.css'

/**
 * The reveal log: every finished round's words, a row per player — the round,
 * the word, its score and its bonus. A row's number is its ROUND, so every
 * row of a round wears the same `#N`, and clicking it opens that round's
 * table on the board. A player with no word that round reads "no word" in
 * the warning bar.
 */
export function GameEventLog({
  events,
  players,
  myId,
  isGameEnded,
  historyView,
}: {
  // Every finished round's words, oldest first.
  events: GEvent[]
  players: Member[]
  myId: string
  isGameEnded: boolean
  historyView: GHistoryView
}) {
  const eventLogPicker = useEventLogPlayerPicker<GEvent>({
    players,
    myId,
    mode: 'compete',
    isGameEnded,
    // Every player plays the same table each round, so "All" is the round as
    // it was revealed, and a player's own rows are the extra.
    competeSharesOneGame: true,
  })
  const shown = eventLogPicker.filter(events)

  return (
    <EventLog heading="Words" picker={eventLogPicker} shown={shown}>
      {shown.map((event) => (
        <tr key={event.id} className={gameEventLog.divider}>
          <EventLogOutcomeBar outcome={eventToOutcome(event)}/>
          <EventLogNumber
            n={event.num}
            isOpenInHistory={historyView.viewedNum === event.num}
            onShowHistory={() => historyView.show(event.num, event.num)}
          />
          <td className={styles.wordCell}>
            {event.word === ''
              ? <span className={styles.noWord}>{answerMessage({ answerType: 'no_word' }).text}</span>
              : (
                <>
                  <span className={styles.word}>{event.word}</span>
                  {' '}
                  <strong className={styles.score}>{event.score}</strong>
                  {event.bonus > 0 && <span className={styles.bonus}> +{event.bonus}</span>}
                </>
              )}
          </td>
          <EventLogActor actor={event.by}/>
        </tr>
      ))}
    </EventLog>
  )
}
