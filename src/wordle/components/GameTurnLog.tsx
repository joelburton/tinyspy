import type { MouseEvent } from 'react'
import { TurnLogActor } from '../../common/components/game/lists/TurnLogActor'
import { cls } from '../../common/lib/util/cls'
import { memberById } from '../../common/lib/game/peers'
import { useTurnLogPlayerPicker } from '../../common/hooks/game/useTurnLogPlayerPicker'
import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import { TurnLog, TurnLogBar, TurnLogNumber } from '../../common/components/game/lists/TurnLog'
import turnLog from '../../common/components/game/lists/TurnLog.module.css'
import type { Member } from '../../common/lib/games'
import { tileColor } from '../lib/colors'
import type { GuessRow } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

type Props = {
  /** Every guess the viewer can currently see, in order. Coop: the whole shared
   *  board. Compete: the viewer's own during play, and (once terminal, when RLS
   *  opens) everyone's — which is what makes the opponent picker below useful. */
  guesses: GuessRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  /** Terminal yet? Distinguishes an opponent's RLS-hidden log (during play) from
   *  a genuinely empty one (at terminal, when their guesses reveal). */
  isTerminal: boolean
  /** Turn-history: the turn currently open in the board viewer (by log position),
   *  or null when live. Its `#N` handle wears the shared yellow ring. */
  viewingIndex: number | null
  /** Open a turn in the board viewer (click its `#N`). */
  onSelectTurn: (index: number) => void
}

/**
 * wordle's turn log — each guess is one `<tr>` in the shared `<TurnLog>` table
 * (named GameTurnLog like the other games' logs; a wordle turn IS a guess).
 *
 * Each row composes the shared atoms: the outcome bar, the guess number, the
 * guess as its five colored letter-squares, and the guesser's identity.
 *   - **outcome bar** — `neutral` for an ordinary guess (a non-winning guess is
 *     progress, not pass/fail), `good` (green) only on the guess that solves it.
 *   - **`#n`** — the log position. On the board being replayed (team / my own) it's
 *     the shared `<TurnLogNumber>` handle — click it to open that turn on the board;
 *     on an opponent's read-only log (compete) it's a plain muted number.
 *   - **the squares** — the guess + its g/y/x feedback; the row's headline, so it
 *     takes the slack-absorbing `turnLog.main` column (keeping `who` snug right).
 *   - **who** — the guesser's `<ActorTag>` in the right-aligned `turnLog.who`
 *     column, so the identity discs line up down the log.
 *
 * The who column is rendered **unconditionally**, like every other v3 turn log:
 * in compete, RLS scopes `guesses` to the caller, so it simply shows the viewer's
 * own identity on each row.
 *
 * **Whose guesses** are shown is picked by a small dropdown in the header
 * (right-aligned, kept understated — a rarely-used control): the shared
 * `useTurnLogPlayerPicker`, on one vocabulary across every turn-log game — solo
 * is your handle, coop is "Team" plus each player, compete is "All" plus each
 * player, defaulting to your own board. Compete is the "see opponents' boards"
 * affordance — an opponent's rows are empty during play (RLS hides them) and fill
 * in once the game ends and their guesses reveal.
 */
export function GameTurnLog({
  guesses,
  players,
  selfId,
  mode,
  isTerminal,
  viewingIndex,
  onSelectTurn,
}: Props) {
  // Whose guesses to show. The control, its default, the aggregate label, the row
  // filter, the `#N`-handle gate and the honest empty line all come from the
  // shared hook — see useTurnLogPlayerPicker.
  const who = useTurnLogPlayerPicker<GuessRow>({
    players,
    selfId,
    mode,
    isTerminal,
    label: 'Whose guesses to show',
    emptyLabel: 'No guesses yet.',
  })
  const shown = who.filter(guesses)

  // The turn-history `#N` is a LIVE (clickable) control only when the log is showing
  // the same board that replays on the main grid — the coop team board, or my own
  // board (compete). In those cases the displayed rows ARE the board's rows, so log
  // position lines up 1:1 with the board row and clicking `#N` opens the right turn.
  // When an OPPONENT's board is picked (compete, at terminal), the main grid still
  // shows MY board, so their rows stay a plain, read-only `#N` (no replay).
  const boardIsShown = who.boardIsShown

  // Click-to-define (a common feature — see common/hooks/definitions/useDefinePopover). Every
  // wordle guess is a legal dictionary word, so the whole guess is definable — the
  // affordance rides the WORD (the five-square group), not the individual cells, so
  // one click looks up the guess. Guesses are stored lowercase, which the lookup wants.
  const { define, popover } = useDefinePopover()
  // Pointer-only, deliberately: NOT focusable, no `role="button"`. See
  // common/theme.css → `.definable` for why every definable word is like this.
  const defineProps = (word: string) => ({
    className: cls(styles.squares, styles.definable),
    title: 'Click to define',
    onClick: (e: MouseEvent<HTMLSpanElement>) => define(word, e.currentTarget),
  })

  return (
    <>
    <TurnLog
      heading="Guesses"
      headerAction={who.picker}
      empty={shown.length === 0}
      emptyText={who.emptyText}
      scrollKey={shown}
    >
      {shown.map((g, i) => (
        <tr key={`${g.user_id}-${g.seq}`} className={turnLog.turnLogDivider}>
          <TurnLogBar outcome={g.is_correct ? 'won' : 'neutral'} />
          {boardIsShown ? (
            <TurnLogNumber n={i + 1} viewing={viewingIndex === i} onSelect={() => onSelectTurn(i)} />
          ) : (
            <td className={turnLog.meta}>#{i + 1}</td>
          )}
          <td className={turnLog.main}>
            <span {...defineProps(g.guess)}>
              {[...g.guess].map((ch, c) => (
                <span key={c} className={cls(styles.sq, styles[tileColor(g.colors[c])])}>
                  {ch.toUpperCase()}
                </span>
              ))}
            </span>
          </td>
          <TurnLogActor actor={memberById(players, g.user_id)} />
        </tr>
      ))}
    </TurnLog>
    {popover}
    </>
  )
}
