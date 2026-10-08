// cs-unmet

import { cls } from '@/common/utils/cls'
import {
  useEventLogPlayerPicker,
} from '@/common/event-log/useEventLogPlayerPicker'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import {
  EventLog,
  EventLogActor,
  EventLogOutcomeBar,
  EventLogNumber,
} from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { eventToOutcome } from '../lib/answer'
import { getTileColor } from '../lib/colors'
import type { Member } from '@/common/members/member'
import styles from './GameEventLog.module.css'
import type { GEvent, GHistoryView } from '../types'

type Props = {
  // Every guess the viewer can see (`gd.events`). Coop: the whole shared
  // board. Compete: the viewer's own during play, and everyone's once the game
  // has ended.
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
 * wordleone's event log: its guesses in the shared `<EventLog>` table, one row
 * each — the outcome bar (`lib/answer.ts`'s: green on the solve, red on a
 * miss), the number, the guess as five squares — all green for the solve,
 * uncolored for a miss, which judged nothing — and who guessed it.
 *
 * Whose guesses show is the shared `useEventLogPlayerPicker`'s: "Team" or each
 * player. In compete an opponent's rows are withheld until the game ends
 * (`useGame`'s seat rule), which is what the picker's empty text says.
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
    label: 'Whose guesses to show',
    emptyLabel: 'No guesses yet.',
  })
  const shownGuesses = eventLogPicker.filter(events)

  // The NUMBER counts 1, 2, 3 under whatever filter is on; the handle is the
  // row's own id, so the board opens the guess the number is beside.
  function drawTurnNumber(guess: GEvent, index: number) {
    return (
      <EventLogNumber
        n={index + 1}
        isOpenInHistory={historyView.viewedEventId === guess.id}
        onShowHistory={() => historyView.show(guess.id, index + 1)}
      />
    )
  }

  // The whole guess is one definable word — every wordleone guess is a legal
  // dictionary word — so one click on the five squares looks it up.
  function drawGuessSquares(guess: GEvent) {
    return (
      <DefinableWord
        word={guess.word}
        className={cls(styles.squares, styles.definable)}
      >
        {[...guess.word].map((letter, letterIdx) => (
          <span
            key={letterIdx}
            className={cls(
              styles.sq,
              guess.colors === null
                ? styles.unjudged
                : styles[getTileColor(guess.colors[letterIdx])],
            )}
          >
            {letter.toUpperCase()}
          </span>
        ))}
      </DefinableWord>
    )
  }

  return (
    <EventLog heading="Guesses" picker={eventLogPicker} shown={shownGuesses}>
      {shownGuesses.map((guess, index) => (
        <tr key={guess.id} className={gameEventLog.divider}>
          <EventLogOutcomeBar outcome={eventToOutcome(guess)} />
          {drawTurnNumber(guess, index)}
          <td className={gameEventLog.main}>{drawGuessSquares(guess)}</td>
          <EventLogActor actor={guess.by} />
        </tr>
      ))}
    </EventLog>
  )
}
