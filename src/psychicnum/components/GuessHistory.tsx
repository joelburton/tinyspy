import { colorVarFor } from '../../common/lib/memberColor'
import { TurnLog, TurnLogEntry } from '../../common/components/TurnLog'
import turnLog from '../../common/components/TurnLog.module.css'
import type { Player, PsychicnumGuess } from '../hooks/useGame'
import styles from './GuessHistory.module.css'

type Props = {
  guesses: PsychicnumGuess[]
  players: Player[]
}

/**
 * The append-only log of guesses and hints, rendered with the shared
 * `<TurnLog>` table.
 *
 * Stateless and presentational — owns no state, makes no RPC calls, just renders
 * the rows from the props it's given, newest snapping into view.
 *
 * Columns (after the shared outcome-bar cell): the turn number (muted), the
 * number (bold — the important part), the result, and the actor (right-aligned
 * with their identity dot, so the dots line up down the column). Cells use
 * `<TurnLog>`'s content classes so they match other games' logs.
 *
 * Two row kinds:
 *   - a **guess** → green (correct) / red (incorrect) outcome bar.
 *   - a **hint** (a revealed secret) → amber (`partial`) bar, labeled "Hint".
 *
 * In compete mode RLS scopes both to the caller, so this shows only the
 * viewer's own attempts + hints.
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
        const actor = playerFor(g.user_id)
        const isHint = g.kind === 'hint'
        return (
          <TurnLogEntry
            key={g.id}
            outcome={isHint ? 'partial' : g.was_correct ? 'good' : 'bad'}
          >
            <td className={turnLog.meta}>#{i + 1}</td>
            <td className={turnLog.primary}>{g.word.toUpperCase()}</td>
            <td>{isHint ? 'Hint' : g.was_correct ? 'Correct' : 'Incorrect'}</td>
            <td className={turnLog.who}>
              <span className={turnLog.actor}>
                {actor?.username ?? 'someone'}
              </span>
              <span
                className={turnLog.dot}
                style={{ color: colorVarFor(actor?.color) }}
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
