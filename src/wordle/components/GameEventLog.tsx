// cs-blessed-wordle

import { cls } from '@/common/utils/cls'
import { memberById } from '@/common/members/memberList'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
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
import type { EventRow } from '../hooks/useGame'
import type { HistoryView } from '../hooks/useHistoryView'
import styles from './GameEventLog.module.css'

type Props = {
  // Every guess the viewer can see. Coop: the whole shared board. Compete: the
  // viewer's own during play, and (once the game has ended, when RLS opens)
  // everyone's.
  guesses: EventRow[]
  players: Member[]
  myId: string
  mode: 'coop' | 'compete'
  isGameEnded: boolean
  // The turn open on the board: its `#N` wears the history-blue ring, and a
  // `#N` click opens another.
  historyView: HistoryView
}

/**
 * wordle's event log: its guesses in the shared `<EventLog>` table, one row
 * each — the outcome bar (`lib/answer.ts`'s: green only on the solving guess),
 * the number, the guess as five colored squares, and who guessed it.
 *
 * Whose guesses show is the shared `useEventLogPlayerPicker`'s: "Team" or each
 * player. In compete an opponent's rows are hidden by RLS until the game ends,
 * which is what the picker's empty text says.
 */
export function GameEventLog({
  guesses,
  players,
  myId,
  mode,
  isGameEnded,
  historyView,
}: Props) {
  const eventLogPicker = useEventLogPlayerPicker<EventRow>({
    players,
    selfId: myId,
    mode,
    isTerminal: isGameEnded,
    label: 'Whose guesses to show',
    emptyLabel: 'No guesses yet.',
  })
  const shownGuesses = eventLogPicker.filter(guesses)

  // The NUMBER counts 1, 2, 3 under whatever filter is on; the handle is the
  // row's own id, so the board opens the guess the number is beside.
  function drawTurnNumber(guess: EventRow, index: number) {
    return (
      <EventLogNumber
        n={index + 1}
        isOpenInHistory={historyView.viewedEventId === guess.id}
        onShowHistory={() => historyView.show(guess.id, index + 1)}
      />
    )
  }

  // The whole guess is one definable word — every wordle guess is a legal
  // dictionary word — so one click on the five squares looks it up.
  function drawGuessSquares(guess: EventRow) {
    return (
      <DefinableWord word={guess.word} className={cls(styles.squares, styles.definable)}>
        {[...guess.word].map((letter, letterIndex) => (
          <span
            key={letterIndex}
            className={cls(styles.sq, styles[getTileColor(guess.colors[letterIndex])])}
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
          <EventLogActor actor={memberById(players, guess.user_id)} />
        </tr>
      ))}
    </EventLog>
  )
}
