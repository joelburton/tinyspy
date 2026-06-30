import { ActorTag } from '../../common/components/ActorTag'
import { memberById } from '../../common/lib/peers'
import { TurnLog, TurnLogBar } from '../../common/components/TurnLog'
import turnLog from '../../common/components/TurnLog.module.css'
import type { Player, PsychicnumGuess } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

type Props = {
  guesses: PsychicnumGuess[]
  players: Player[]
}

/**
 * psychicnum's turn log — its turns (guesses, hints, reveals) rendered with the
 * shared `<TurnLog>` table. (Named GameTurnLog, not GuessHistory: it's this
 * game's turn log, and a turn isn't always a guess — see TurnLog.tsx.)
 *
 * Stateless and presentational — owns no state, makes no RPC calls, just renders
 * the rows from the props it's given, newest snapping into view.
 *
 * Each turn is a single `<tr>` psychicnum renders itself (the row anatomy is the
 * game's — see TurnLog.tsx): the shared `<TurnLogBar>` cell, then the turn number
 * (muted), the word (bold — the important part), the result, and the actor
 * (right-aligned with their identity dot, so the dots line up down the column).
 * Cells use `<TurnLog>`'s content classes so they match other games' logs; the
 * `.turnLogDivider` class on each row draws the between-turns line (suppressed on
 * the first by `:first-child`).
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
export function GameTurnLog({ guesses, players }: Props) {
  // The actor's identity cell — shared by every row kind. The shared <ActorTag>
  // is the name + identity disc; the right-aligned `turnLog.who` column aligns
  // the discs down the log.
  const whoCell = (userId: string) => (
    <td className={turnLog.who}>
      <ActorTag actor={memberById(players, userId)} />
    </td>
  )

  return (
    <TurnLog
      heading="Guesses"
      empty={guesses.length === 0}
      emptyText="No guesses yet."
      scrollKey={guesses}
    >
      {guesses.map((g, i) => {
        // Hint: the word + result columns collapse into one colspan cell, since
        // the row carries a clue sentence, not a word + a one-word result.
        if (g.kind === 'hint') {
          return (
            <tr key={g.id} className={turnLog.turnLogDivider}>
              <TurnLogBar outcome="partial" />
              <td className={turnLog.meta}>#{i + 1}</td>
              <td colSpan={2} className={styles.hint}>
                <span className={turnLog.meta}>Hint:</span> {g.word}
              </td>
              {whoCell(g.user_id)}
            </tr>
          )
        }
        // Guess (good/bad) or reveal (amber, the answer).
        const isReveal = g.kind === 'reveal'
        return (
          <tr key={g.id} className={turnLog.turnLogDivider}>
            <TurnLogBar outcome={isReveal ? 'partial' : g.was_correct ? 'good' : 'bad'} />
            <td className={turnLog.meta}>#{i + 1}</td>
            <td className={turnLog.primary}>{g.word.toUpperCase()}</td>
            <td>{isReveal ? 'Answer' : g.was_correct ? 'Correct' : 'Incorrect'}</td>
            {whoCell(g.user_id)}
          </tr>
        )
      })}
    </TurnLog>
  )
}
