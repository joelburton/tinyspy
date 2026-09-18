// cs-fixed-outcome-fix

import type { GamePlayer } from '@/common/members/member'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import { memberById } from '@/common/members/memberList'
import { BOARD_SIZE } from '../lib/board'
import { ANSWER_OUTCOME } from '../lib/answer'
import { hintPrefix } from '../lib/hintOrSpoiler'
import type { EventRow } from '../hooks/useGame'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import styles from './PlayArea.module.css'

/**
 * letterboxed's event log — one `<tr>` per move in the shared `<EventLog>` table,
 * composing the same atoms every other v3 log does: the outcome bar, the move
 * number, the move itself in the slack-absorbing `main` column, and the actor
 * on the right so the identity discs line up down the log.
 *
 * COVERAGE IS ITS OWN COLUMN (`gameEventLog.other`), not a suffix on the move text.
 * Appended, it landed wherever the word happened to end and the numbers
 * staggered down the log; as a column they line up, which is most of why the
 * shared log is a `<table>` rather than a list of rows.
 *
 * Bar colors are `lib/answer.ts`'s — the log names no word of its own, so it
 * cannot disagree with the pill that reported the same move.
 *
 * Retreats appear at all because `letterboxed.events` is an append-only stream
 * rather than a table rows get deleted from — "what did we already try?" is
 * most of the value of a log in a game you can walk backwards.
 *
 * **Whose moves** are shown comes from the shared `useEventLogPlayerPicker`, on
 * the same vocabulary as every other event-log game: solo is your handle, coop
 * is "Team" plus each player, compete is "All" plus each player and defaults to
 * your own. In compete an opponent's rows are empty during play (RLS hides
 * them) and fill in once the game ends.
 */
export function GameEventLog({
  events,
  players,
  selfId,
  mode,
  isTerminal,
  historyId,
  onShowHistory,
}: {
  events: EventRow[]
  players: GamePlayer[]
  selfId: string
  mode: 'coop' | 'compete'
  isTerminal: boolean
  /** The move open in the board viewer, or null when live. */
  historyId: number | null
  /** Open a move on the board (click its `#N`) — the row's id, and the `#N` this
   *  log printed beside it, which is what the banner shows back. */
  onShowHistory: (id: number, n: number) => void
}) {
  const eventLogPicker = useEventLogPlayerPicker<EventRow>({
    players,
    selfId,
    mode,
    isTerminal,
    label: 'Whose moves to show',
    emptyLabel: 'No moves yet.',
  })
  const shown = eventLogPicker.filter(events)

  // The viewer addresses a row by its own id, and PlayArea folds the rows of
  // whoever wrote it, resolving that id against them. The list the log shows and
  // the list the board replays need not match, so every handle is live.

  return (
    <EventLog heading="Moves" picker={eventLogPicker} shown={shown}>
      {shown.map((e, i) => (
        <tr key={e.id} className={gameEventLog.divider}>
          <EventLogOutcomeBar outcome={ANSWER_OUTCOME[e.kind]} />
          {/* The number counts the rows on show; the handle is the row's own
              id, so a click replays that row's author's chain rather than
              somebody else's onto your board. */}
          <EventLogNumber
            n={i + 1}
            isOpenInHistory={historyId === e.id}
            onShowHistory={() => onShowHistory(e.id, i + 1)}
          />
          <td className={gameEventLog.main}>
            <Move event={e} />
          </td>
          <td className={gameEventLog.other}>
            <span className={gameEventLog.muted}>
              {e.letters_covered}/{BOARD_SIZE}
            </span>
          </td>
          <EventLogActor actor={memberById(players, e.user_id)} />
        </tr>
      ))}
    </EventLog>
  )
}

/**
 * A row's move text. Each kind names what HAPPENED in the game's own words, and
 * every one that carries a whole word makes that word definable.
 *
 * A hint's and a spoiler's rows carry their CONTENT, not just the fact of the
 * ask (Joel's spec,
 * 2026-08-05): the pills that delivered the hint were transient, so the log is
 * the lasting record of what was given away — the hint's length + opening
 * letters (`hintPrefix`, the same vocabulary the pills used), the spoiler's
 * whole word.
 */
function Move({ event }: { event: EventRow }) {
  const word = event.word ? <DefinableWord word={event.word} /> : null

  switch (event.kind) {
    case 'word':
      return <span className={styles.logWord}>{word}</span>
    case 'undo':
      return <span className={styles.logRetreat}>took back {word}</span>
    case 'clear':
      return <span className={styles.logRetreat}>started over</span>
    case 'hint':
      return (
        <span className={styles.logRetreat}>
          Hint: {(event.word ?? '').length} letters: {hintPrefix(event.word ?? '')}
        </span>
      )
    case 'spoiler':
      return <span className={styles.logRetreat}>Reveal: {word}</span>
  }
}
