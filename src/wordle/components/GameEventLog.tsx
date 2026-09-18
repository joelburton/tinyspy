// cs-fixed-outcome-fix

import { cls } from '@/common/utils/cls'
import { memberById } from '@/common/members/memberList'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import type { Member } from '@/common/members/member'
import { ANSWER_OUTCOME } from '../lib/answer'
import { tileColor } from '../lib/colors'
import type { EventRow } from '../hooks/useGame'
import styles from './GameEventLog.module.css'

type Props = {
  /** Every guess the viewer can currently see, in order. Coop: the whole shared
   *  board. Compete: the viewer's own during play, and (once terminal, when RLS
   *  opens) everyone's — which is what makes the opponent picker below useful. */
  guesses: EventRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  /** Terminal yet? Distinguishes an opponent's RLS-hidden log (during play) from
   *  a genuinely empty one (at terminal, when their guesses reveal). */
  isTerminal: boolean
  /** The turn currently open in the board viewer (by log position),
   *  or null when live. Its `#N` handle wears the shared yellow ring. */
  historyId: number | null
  /** Open a turn in the board viewer (click its `#N`). */
  onShowHistory: (index: number) => void
}

/**
 * wordle's event log — each guess is one `<tr>` in the shared `<EventLog>` table
 * (named GameEventLog like the other games' logs; a wordle turn IS a guess).
 *
 * Each row composes the shared atoms: the outcome bar, the guess number, the
 * guess as its five colored letter-squares, and the guesser's identity.
 *   - **outcome bar** — `neutral` for an ordinary guess (a non-winning guess is
 *     progress, not pass/fail), `won` (green) only on the guess that solves it.
 *   - **`#n`** — the row's place in the list on show. The shared
 *     `<EventLogNumber>` handle opens that row on the board, addressed by the
 *     row's own id, so the number and the link are two different values and a
 *     filter cannot make them disagree.
 *   - **the squares** — the guess + its g/y/x feedback; the row's headline, so it
 *     takes the slack-absorbing `gameEventLog.main` column (keeping the who column
 *     snug right).
 *   - **who** — the guesser's `<ActorDot>`, which `<EventLogActor>` puts in the
 *     right-aligned who column, so the identity discs line up down the log.
 *
 * The who column is rendered **unconditionally**, like every other v3 event log:
 * in compete, RLS scopes `guesses` to the caller, so it simply shows the viewer's
 * own identity on each row.
 *
 * **Whose guesses** are shown is picked by a small dropdown in the header
 * (right-aligned, kept understated — a rarely-used control): the shared
 * `useEventLogPlayerPicker`, on one vocabulary across every event-log game — solo
 * is your handle, coop is "Team" plus each player, compete is "All" plus each
 * player, defaulting to your own board. Compete is the "see opponents' boards"
 * affordance — an opponent's rows are empty during play (RLS hides them) and fill
 * in once the game ends and their guesses reveal.
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
  // Whose guesses to show. The control, its default, the aggregate label, the row
  // filter, the `#N`-handle gate and the honest empty line all come from the
  // shared hook — see useEventLogPlayerPicker.
  const eventLogPicker = useEventLogPlayerPicker<EventRow>({
    players,
    selfId,
    mode,
    isTerminal,
    label: 'Whose guesses to show',
    emptyLabel: 'No guesses yet.',
  })
  const shown = eventLogPicker.filter(guesses)

  // The turn-history `#N` is a LIVE (clickable) control only when the log is showing
  // the same board that replays on the main grid — the coop team board, or my own
  // board (compete). In those cases the displayed rows ARE the board's rows, so log
  // position lines up 1:1 with the board row and clicking `#N` opens the right turn.
  // When an OPPONENT's board is picked (compete, at terminal), the main grid still
  // shows MY board, so their rows stay a plain, read-only `#N` (no replay).

  return (
    <EventLog heading="Guesses" picker={eventLogPicker} shown={shown}>
      {shown.map((g, i) => (
        <tr key={g.id} className={gameEventLog.divider}>
          {/* The bar's word is `lib/answer.ts`'s, so the log has none of its
              own to disagree with the pill about the same guess. */}
          <EventLogOutcomeBar outcome={ANSWER_OUTCOME[g.is_correct ? 'correct' : 'incorrect']} />
          <EventLogNumber
            n={i + 1}
            isOpenInHistory={historyId === g.id}
            onShowHistory={() => onShowHistory(g.id)}
          />
          <td className={gameEventLog.main}>
            {/* The whole guess is one definable word — every wordle guess is a
                legal dictionary word, so the affordance rides the five-square
                group rather than the cells, and one click looks it up. */}
            <DefinableWord word={g.guess} className={cls(styles.squares, styles.definable)}>
              {[...g.guess].map((ch, c) => (
                <span key={c} className={cls(styles.sq, styles[tileColor(g.colors[c])])}>
                  {ch.toUpperCase()}
                </span>
              ))}
            </DefinableWord>
          </td>
          <EventLogActor actor={memberById(players, g.user_id)} />
        </tr>
      ))}
    </EventLog>
  )
}
