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
  /** Open a move on the board (click its `#N`). */
  onShowHistory: (index: number) => void
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

  // The viewer indexes by POSITION in the displayed rows, and PlayArea derives
  // the same list for itself (`boardRows`: coop = all events, compete = own).
  // `boardIsShown` is what keeps the two honest — the `#N` handle is live ONLY
  // while the picker's rows ARE the board's own sequence, so a selected index
  // always means the same row on both sides. (An earlier version handed the
  // rows up through a state-setting effect instead; the fresh array re-fired
  // it every render and hit React's update-depth limit.)
  const boardIsShown = eventLogPicker.boardIsShown

  return (
    <EventLog heading="Moves" picker={eventLogPicker} shown={shown}>
      {shown.map((e, i) => (
        <tr key={e.id} className={gameEventLog.divider}>
          <EventLogOutcomeBar outcome={ANSWER_OUTCOME[e.kind]} />
          {/* A live handle only when the rows on show ARE the board's rows —
              otherwise a click would replay someone else's chain onto your
              board. */}
          <EventLogNumber
            n={i + 1}
            isOpenInHistory={historyId === i}
            onShowHistory={boardIsShown ? () => onShowHistory(i) : undefined}
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
