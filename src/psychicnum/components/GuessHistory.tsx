import { colorVarFor } from '../../common/lib/memberColor'
import { HistoryPanel, HistoryRow } from '../../common/components/HistoryPanel'
import type { Player, PsychicNumGuess } from '../hooks/useGame'
import styles from './GuessHistory.module.css'

type Props = {
  guesses: PsychicNumGuess[]
  players: Player[]
}

/**
 * The append-only log of guesses for this game.
 *
 * Stateless and presentational — owns no state, makes no RPC
 * calls, just renders the rows from the props it's given.
 *
 * **Visual style** mirrors connections's GuessHistory: each row is
 * a small card with a 10px-wide colored strip on the left
 * (green for correct, red for wrong), the rest transparent.
 * Same semantic palette across games — "wrong guess" reads the
 * same in connections as it does here.
 *
 * **Chronological order** (oldest at top, latest at bottom).
 * The list scrolls inside its own frame (see the `.list` styles
 * + the parent column's bounded height in PlayArea.module.css)
 * and auto-snaps to the bottom on every new guess via the
 * effect below — same UX as a chat panel.
 *
 * The pattern carries forward to harder games: codenamesduet's clue +
 * guess log, future game move lists. When those land, each
 * `<XHistory>` can adopt this same shape — pure render from a
 * list + the member roster needed to resolve attribution.
 */
export function GuessHistory({ guesses, players }: Props) {
  const playerFor = (userId: string) =>
    players.find((m) => m.user_id === userId)

  return (
    <HistoryPanel
      heading="Guesses"
      empty={guesses.length === 0}
      scrollKey={guesses}
      className={styles.history}
    >
      {guesses.map((g) => {
        const guesser = playerFor(g.user_id)
        return (
          <HistoryRow
            key={g.id}
            verdict={g.was_correct ? 'correct' : 'wrong'}
            className={styles.itemRow}
          >
            <div className={styles.number}>{g.number}</div>
            <div className={styles.meta}>
              <span
                className={styles.user}
                style={{ color: colorVarFor(guesser?.color) }}
              >
                {guesser?.username ?? 'someone'}
              </span>
              <span className={styles.separator}>·</span>
              <span>{g.was_correct ? 'Correct!' : 'Not the number'}</span>
            </div>
          </HistoryRow>
        )
      })}
    </HistoryPanel>
  )
}
