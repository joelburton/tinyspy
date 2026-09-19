// cs-fixed-outcome-fix

import { cls } from '@/common/utils/cls'
import { memberById } from '@/common/members/memberList'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import { eventToOutcome } from '../lib/answer'
import type { Player, EventRow } from '../hooks/useGame'
import styles from './GameEventLog.module.css'

type Props = {
  /** Every turn the viewer can see. Coop: the whole shared game. Compete: the
   *  viewer's own during play, and (once terminal, when RLS opens) everyone's. */
  guesses: EventRow[]
  players: Player[]
  selfId: string
  mode: 'coop' | 'compete'
  /** Distinguishes an opponent's RLS-hidden log from a genuinely empty one. */
  isTerminal: boolean
  /** The turn currently open in the board viewer — the row's own id — or null
   *  when live. Its `#N` handle wears the shared history-blue ring. */
  historyId: number | null
  /** Open a turn in the board viewer (click its `#N`) — the row's id, and the
   *  `#N` this log printed beside it, which is what the banner shows back. */
  onShowHistory: (id: number, n: number) => void
}

/**
 * psychicnum's event log — its turns (guesses, hints, spoilers) rendered with the
 * shared `<EventLog>` table. (Named GameEventLog, not GuessHistory: it's this
 * game's event log, and a turn isn't always a guess — see EventLog.tsx.)
 *
 * Stateless and presentational — owns no state, makes no RPC calls, just renders
 * the rows from the props it's given, newest snapping into view.
 *
 * Each turn is a single `<tr>` psychicnum renders itself (the row anatomy is the
 * game's — see EventLog.tsx): the shared `<EventLogOutcomeBar>` cell, then the turn number
 * (muted), the word (bold — the important part), the result, and the actor
 * (right-aligned with their identity dot, so the dots line up down the column).
 * Cells use `<EventLog>`'s content classes so they match other games' logs; the
 * `.divider` class on each row draws the between-turns line (suppressed on
 * the first by `:first-child`).
 *
 * Three row kinds. The bar's color is `lib/answer.ts`'s in every one of them —
 * the log names no word of its own — and what differs here is the CELLS:
 *   - a **guess** → word + result ("Correct" / "Incorrect").
 *   - a **reveal** (a revealed answer) → word + "Answer".
 *   - a **hint** (a clue) → the word+result columns are **replaced by a single
 *     colspan** cell "Hint: <clue>" (the row carries the clue text, not a word).
 *
 * **Whose turns** are shown is picked by the shared `useEventLogPlayerPicker`
 * dropdown in the header — one vocabulary across every event-log game (solo: your
 * handle; coop: "Team" plus each player; compete: "All" plus each player). In
 * compete an opponent's rows are RLS-hidden during play and open at terminal,
 * which is exactly what the picker's empty text says.
 */
export function GameEventLog({
  guesses,
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
    emptyLabel: 'No turns yet.',
  })
  const shown = eventLogPicker.filter(guesses)

  // The actor's identity cell — shared by every row kind. The shared
  // <EventLogActor> is the right-aligned `.who` <td> wrapping the name + disc;
  // this local helper just resolves the userId to a member first.
  const whoCell = (userId: string) => (
    <EventLogActor actor={memberById(players, userId)} />
  )

  // A guessed / revealed word is a real dictionary word, so it is definable; a
  // HINT row's `word` is a clue sentence, so it is not.

  // The "#N" cell, shared by both row kinds. The NUMBER is the row's place in
  // the list on show — it counts 1, 2, 3 under whatever filter is applied, which
  // from the reader's seat is honest. The HANDLE is the row's own id, so the
  // board opens the event the number is beside whatever the filter did.
  const turnNumber = (row: EventRow, i: number) => (
    <EventLogNumber
      n={i + 1}
      isOpenInHistory={historyId === row.id}
      onShowHistory={() => onShowHistory(row.id, i + 1)}
    />
  )

  return (
    <EventLog heading="Turns" picker={eventLogPicker} shown={shown}>
      {shown.map((g, i) => {
        // Hint: the word + result columns collapse into one colspan cell, since
        // the row carries a clue sentence, not a word + a one-word result.
        if (g.kind === 'hint') {
          return (
            <tr key={g.id} className={gameEventLog.divider}>
              <EventLogOutcomeBar outcome={eventToOutcome(g)} />
              {turnNumber(g, i)}
              {/* The hint sentence spans the word+result columns; it's the row's
                  main column (absorbs the slack so `.who` stays snug). */}
              <td colSpan={2} className={cls(gameEventLog.main, styles.hint)}>
                <span className={gameEventLog.muted}>Hint:</span> {g.word}
              </td>
              {whoCell(g.user_id)}
            </tr>
          )
        }
        // A guess (right or wrong), or a spoiler — the answer, handed over.
        const isSpoiler = g.kind === 'spoiler'
        return (
          <tr key={g.id} className={gameEventLog.divider}>
            {/* The color is `lib/answer.ts`'s, so the log has none of its own
                to disagree with the pill about the same turn. The row's WORDS
                are the log's — the word and the verdict are two columns here,
                not a sentence. */}
            <EventLogOutcomeBar outcome={eventToOutcome(g)} />
            {turnNumber(g, i)}
            {/* word = sized-to-fit (`.other`) + the bold lead look (`.primary`);
                result = the main column, absorbing the slack so the word + result
                stay clustered and `.who` sits snug at the right. */}
            <td className={cls(gameEventLog.other, gameEventLog.primary)}>
              <DefinableWord word={g.word} />
            </td>
            <td className={gameEventLog.main}>{isSpoiler ? 'Answer' : g.is_correct ? 'Correct' : 'Incorrect'}</td>
            {whoCell(g.user_id)}
          </tr>
        )
      })}
    </EventLog>
  )
}
