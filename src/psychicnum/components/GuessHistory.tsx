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
 * word (bold — the important part), the result, and the actor (right-aligned
 * with their identity dot, so the dots line up down the column). Cells use
 * `<TurnLog>`'s content classes so they match other games' logs.
 *
 * Three row kinds:
 *   - a **guess** → green (correct) / red (incorrect) outcome bar; word + result.
 *   - a **reveal** (a revealed answer) → amber bar; word + "Answer".
 *   - a **hint** (a clue) → amber bar; the word+result columns are **replaced by
 *     a single colspan** cell "Hint: <clue>" (the row carries the clue text, not
 *     a word).
 *
 * In compete mode RLS scopes all to the caller, so this shows only the viewer's
 * own attempts + helpers.
 */
export function GuessHistory({ guesses, players }: Props) {
  const playerFor = (userId: string) =>
    players.find((m) => m.user_id === userId)

  // The actor's identity cell — shared by every row kind.
  const whoCell = (userId: string) => {
    const actor = playerFor(userId)
    return (
      <td className={turnLog.who}>
        <span className={turnLog.actor}>{actor?.username ?? 'someone'}</span>
        <span
          className={turnLog.dot}
          style={{ color: colorVarFor(actor?.color) }}
          aria-hidden="true"
        >
          ●
        </span>
      </td>
    )
  }

  return (
    <TurnLog
      heading="Guesses"
      empty={guesses.length === 0}
      emptyText="No guesses yet."
      scrollKey={guesses}
      className={styles.history}
    >
      {guesses.map((g, i) => {
        // Hint: the word + result columns collapse into one colspan cell, since
        // the row carries a clue sentence, not a word + a one-word result.
        if (g.kind === 'hint') {
          return (
            <TurnLogEntry key={g.id} outcome="partial">
              <td className={turnLog.meta}>#{i + 1}</td>
              <td colSpan={2} className={styles.hint}>
                <span className={turnLog.meta}>Hint:</span> {g.word}
              </td>
              {whoCell(g.user_id)}
            </TurnLogEntry>
          )
        }
        // Guess (good/bad) or reveal (amber, the answer).
        const isReveal = g.kind === 'reveal'
        return (
          <TurnLogEntry
            key={g.id}
            outcome={isReveal ? 'partial' : g.was_correct ? 'good' : 'bad'}
          >
            <td className={turnLog.meta}>#{i + 1}</td>
            <td className={turnLog.primary}>{g.word.toUpperCase()}</td>
            <td>{isReveal ? 'Answer' : g.was_correct ? 'Correct' : 'Incorrect'}</td>
            {whoCell(g.user_id)}
          </TurnLogEntry>
        )
      })}
    </TurnLog>
  )
}
