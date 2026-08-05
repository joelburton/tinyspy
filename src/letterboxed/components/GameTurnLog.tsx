import type { MouseEvent } from 'react'
import type { GamePlayer } from '../../common/lib/games'
import { useTurnLogPlayerPicker } from '../../common/hooks/game/useTurnLogPlayerPicker'
import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import { TurnLog, TurnLogBar } from '../../common/components/game/lists/TurnLog'
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
 * The bar follows wordle's reading: `neutral` for an ordinary move (progress,
 * not pass/fail) and `good` only on the move that covers the board. A RETREAT
 * is neutral too — in turn-by-turn co-op an undo costs the undoer's turn and is
 * usually made for the next player's benefit, so painting it red would
 * misdescribe it. The muted italic text is what separates the two.
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
}: {
  events: EventRow[]
  players: GamePlayer[]
  selfId: string
  mode: 'coop' | 'compete'
  isTerminal: boolean
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
          <TurnLogBar
            outcome={
              e.kind === 'played' && e.letters_covered === BOARD_SIZE ? 'good' : 'neutral'
            }
          />
          <td className={turnLog.meta}>#{i + 1}</td>
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
