import { useEffect, type MouseEvent } from 'react'
import type { GamePlayer } from '../../common/lib/games'
import { useTurnLogPlayerPicker } from '../../common/hooks/game/useTurnLogPlayerPicker'
import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import {
  TurnLog,
  TurnLogBar,
  TurnLogNumber,
  type TurnOutcome,
} from '../../common/components/game/lists/TurnLog'
import { TurnLogActor } from '../../common/components/game/lists/TurnLogActor'
import { memberById } from '../../common/lib/game/peers'
import { BOARD_SIZE } from '../lib/board'
import type { EventRow } from '../hooks/useGame'
import turnLog from '../../common/components/game/lists/TurnLog.module.css'
import styles from './PlayArea.module.css'

/**
 * letterboxed's turn log — one `<tr>` per move in the shared `<TurnLog>` table,
 * composing the same atoms every other v3 log does: the outcome bar, the move
 * number, the move itself in the slack-absorbing `main` column, and the actor
 * on the right so the identity discs line up down the log.
 *
 * COVERAGE IS ITS OWN COLUMN (`turnLog.other`), not a suffix on the move text.
 * Appended, it landed wherever the word happened to end and the numbers
 * staggered down the log; as a column they line up, which is most of why the
 * shared log is a `<table>` rather than a list of rows.
 *
 * Bar colours are `barFor` below.
 *
 * Retreats appear at all because `letterboxed.events` is an append-only stream
 * rather than a table rows get deleted from — "what did we already try?" is
 * most of the value of a log in a game you can walk backwards.
 *
 * **Whose moves** are shown comes from the shared `useTurnLogPlayerPicker`, on
 * the same vocabulary as every other turn-log game: solo is your handle, coop
 * is "Team" plus each player, compete is "All" plus each player and defaults to
 * your own. In compete an opponent's rows are empty during play (RLS hides
 * them) and fill in once the game ends.
 */
export function GameTurnLog({
  events,
  players,
  selfId,
  mode,
  isTerminal,
  viewingIndex,
  onSelectTurn,
  onRowsChange,
}: {
  events: EventRow[]
  players: GamePlayer[]
  selfId: string
  mode: 'coop' | 'compete'
  isTerminal: boolean
  /** The move open in the board viewer, or null when live. */
  viewingIndex: number | null
  /** Open a move on the board (click its `#N`). */
  onSelectTurn: (index: number) => void
  /** The rows currently on show, handed up so the board replays the SAME list
   *  the numbers are indexing. */
  onRowsChange: (rows: EventRow[], boardIsShown: boolean) => void
}) {
  const who = useTurnLogPlayerPicker<EventRow>({
    players,
    selfId,
    mode,
    isTerminal,
    label: 'Whose moves to show',
    emptyLabel: 'No moves yet.',
  })
  const shown = who.filter(events)

  // The viewer indexes by POSITION in the displayed rows, so the board has to
  // fold the same list. Handing it up (rather than the board re-deriving it)
  // keeps one definition of "the rows on show".
  const boardIsShown = who.boardIsShown
  useEffect(() => {
    onRowsChange(shown, boardIsShown)
  }, [shown, boardIsShown, onRowsChange])

  // Click-to-define (a common feature — common/hooks/definitions/useDefinePopover).
  // Every word in the log is a real dictionary word, whether it was played,
  // taken back, or handed over by a spoiler; words are stored lowercase, which
  // the lookup wants.
  const { define, popover } = useDefinePopover()
  // Pointer-only, deliberately: NOT focusable, no role="button". See
  // common/theme.css → `.definable` for why every definable word is like this.
  const defineProps = (word: string) => ({
    className: 'definable',
    title: 'Click to define',
    onClick: (e: MouseEvent<HTMLSpanElement>) => define(word, e.currentTarget),
  })

  return (
    <>
    <TurnLog
      heading="Moves"
      headerAction={who.picker}
      empty={shown.length === 0}
      emptyText={who.emptyText}
      scrollKey={shown}
    >
      {shown.map((e, i) => (
        <tr key={e.id} className={turnLog.turnLogDivider}>
          <TurnLogBar outcome={barFor(e)} />
          {/* A live handle only when the rows on show ARE the board's rows —
              otherwise a click would replay someone else's chain onto your
              board. */}
          {boardIsShown ? (
            <TurnLogNumber n={i + 1} viewing={viewingIndex === i} onSelect={() => onSelectTurn(i)} />
          ) : (
            <td className={turnLog.meta}>#{i + 1}</td>
          )}
          <td className={turnLog.main}>
            <Move event={e} defineProps={defineProps} />
          </td>
          <td className={turnLog.other}>
            <span className={turnLog.meta}>
              {e.letters_covered}/{BOARD_SIZE}
            </span>
          </td>
          <TurnLogActor actor={memberById(players, e.user_id)} />
        </tr>
      ))}
    </TurnLog>
    {popover}
    </>
  )
}

/**
 * The row's bar colour.
 *
 * A PLAYED WORD IS `good` — green. Getting a legal word onto this board is the
 * achievement here: it has to be a real word, fit the twelve letters, cross a
 * side at every step AND start on the letter the last word left you. Unlike a
 * wordle guess (which is one of six tries and usually wrong), landing one is
 * unambiguously progress, so it reads as a success rather than as a neutral
 * event.
 *
 * `partial` (amber) marks help taken, matching psychicnum's reveal rows and the
 * amber of the Hint / Spoiler buttons themselves. `neutral` is left for the
 * retreats: in turn-by-turn co-op an undo costs the undoer their turn and is
 * usually made for the next player, so red would misdescribe it.
 */
function barFor(e: EventRow): TurnOutcome {
  if (e.kind === 'played') return 'good'
  if (e.kind === 'hint' || e.kind === 'spoiler') return 'partial'
  return 'neutral'
}

/**
 * A row's move text. Each kind names what HAPPENED in the game's own words, and
 * every one that carries a word makes that word definable.
 */
function Move({
  event,
  defineProps,
}: {
  event: EventRow
  defineProps: (word: string) => Record<string, unknown>
}) {
  const word = event.word ? (
    <span {...defineProps(event.word)}>{event.word.toUpperCase()}</span>
  ) : null

  switch (event.kind) {
    case 'played':
      return <span className={styles.logWord}>{word}</span>
    case 'undone':
      return <span className={styles.logRetreat}>took back {word}</span>
    case 'cleared':
      return <span className={styles.logRetreat}>started over</span>
    case 'hint':
      return <span className={styles.logRetreat}>took a hint</span>
    case 'spoiler':
      return <span className={styles.logRetreat}>was shown {word}</span>
  }
}
