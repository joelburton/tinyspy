import { ActorTag } from '../../common/components/ActorTag'
import { cls } from '../../common/lib/cls'
import { memberById } from '../../common/lib/peers'
import { TurnLog, TurnLogBar } from '../../common/components/TurnLog'
import turnLog from '../../common/components/TurnLog.module.css'
import type { Member } from '../../common/lib/games'
import { tileColor } from '../lib/colors'
import type { WordleGuess } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

type Props = {
  /** Guesses to list — coop: every player's (the shared board); compete: the
   *  viewer's own (RLS-scoped server-side). In order. */
  guesses: WordleGuess[]
  players: Member[]
}

/**
 * wordle's turn log — each guess is one `<tr>` in the shared `<TurnLog>` table
 * (named GameTurnLog like the other games' logs; a wordle turn IS a guess).
 *
 * Each row composes the shared atoms: the outcome bar, the guess number, the
 * guess as its five colored letter-squares, and the guesser's identity.
 *   - **outcome bar** — `neutral` for an ordinary guess (a non-winning guess is
 *     progress, not pass/fail), `good` (green) only on the guess that solves it.
 *   - **`#n`** — the log position (`turnLog.meta`, muted).
 *   - **the squares** — the guess + its g/y/x feedback; the row's headline, so it
 *     takes the slack-absorbing `turnLog.main` column (keeping `who` snug right).
 *   - **who** — the guesser's `<ActorTag>` in the right-aligned `turnLog.who`
 *     column, so the identity discs line up down the log.
 *
 * The who column is rendered **unconditionally**, like every other v3 turn log:
 * in compete, RLS scopes `guesses` to the caller, so it simply shows the viewer's
 * own identity on each row. Stateless/presentational — just renders its props,
 * newest snapping into view.
 */
export function GameTurnLog({ guesses, players }: Props) {
  return (
    <TurnLog
      heading="Guesses"
      empty={guesses.length === 0}
      emptyText="No guesses yet."
      scrollKey={guesses}
    >
      {guesses.map((g, i) => (
        <tr key={`${g.user_id}-${g.guess_index}`} className={turnLog.turnLogDivider}>
          <TurnLogBar outcome={g.is_correct ? 'good' : 'neutral'} />
          <td className={turnLog.meta}>#{i + 1}</td>
          <td className={turnLog.main}>
            <span className={styles.squares}>
              {[...g.guess].map((ch, c) => (
                <span key={c} className={cls(styles.sq, styles[tileColor(g.colors[c])])}>
                  {ch.toUpperCase()}
                </span>
              ))}
            </span>
          </td>
          <td className={turnLog.who}>
            <ActorTag actor={memberById(players, g.user_id)} />
          </td>
        </tr>
      ))}
    </TurnLog>
  )
}
