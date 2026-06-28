import { colorVarFor } from '../../common/lib/memberColor'
import { TurnLog, TurnLogEntry } from '../../common/components/TurnLog'
import turnLog from '../../common/components/TurnLog.module.css'
import type { Player, PsychicnumGuess } from '../hooks/useGame'
import styles from './GuessHistory.module.css'

type Props = {
  guesses: PsychicnumGuess[]
  players: Player[]
}

// TEMP: cycle the four outcome colors so we can preview the palette. REMOVE —
// revert the TurnLogEntry outcome below to `g.was_correct ? 'good' : 'bad'`.
const TEMP_OUTCOMES = ['good', 'bad', 'partial', 'neutral'] as const

/**
 * The append-only log of guesses, rendered with the shared `<TurnLog>` table.
 *
 * Stateless and presentational — owns no state, makes no RPC calls, just renders
 * the rows from the props it's given, newest snapping into view.
 *
 * Columns (after the shared outcome-bar cell): the turn number (muted), the
 * guessed number (bold — the important part), the result, and the guesser
 * (right-aligned with their identity dot, so the dots line up down the column).
 * Cells use `<TurnLog>`'s content classes so they match other games' logs.
 *
 * In compete mode RLS scopes `guesses` to the caller, so this shows only the
 * viewer's own attempts.
 */
export function GuessHistory({ guesses, players }: Props) {
  const playerFor = (userId: string) =>
    players.find((m) => m.user_id === userId)

  return (
    <TurnLog
      heading="Guesses"
      empty={guesses.length === 0}
      emptyText="No guesses yet."
      scrollKey={guesses}
      className={styles.history}
    >
      {guesses.map((g, i) => {
        const guesser = playerFor(g.user_id)
        return (
          <TurnLogEntry key={g.id} outcome={TEMP_OUTCOMES[i % 4]}>
            <td className={turnLog.meta}>#{i + 1}</td>
            <td className={turnLog.primary}>{g.number}</td>
            <td>{g.was_correct ? 'Correct' : 'Incorrect'}</td>
            <td className={turnLog.who}>
              <span className={turnLog.actor}>
                {guesser?.username ?? 'someone'}
              </span>
              <span
                className={turnLog.dot}
                style={{ color: colorVarFor(guesser?.color) }}
                aria-hidden="true"
              >
                ●
              </span>
            </td>
          </TurnLogEntry>
        )
      })}
    </TurnLog>
  )
}
