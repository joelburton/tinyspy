import { colorVarFor } from '../../common/lib/memberColor'
import type { Player, PsychicnumGuess } from '../hooks/useGame'

type Props = {
  guesses: PsychicnumGuess[]
  players: Player[]
}

/**
 * The append-only log of guesses for this game.
 *
 * Stateless and presentational — owns no state, makes no RPC
 * calls, just renders the rows from the props it's given.
 *
 * The pattern this establishes (a per-game "history of moves"
 * section) carries forward to harder games: tinyspy's clue + guess
 * log, wordknit's guess attempts, a future game's move list. When
 * those land, each can have its own `<XHistory>` with the same
 * shape — pure render from a list + the member roster needed to
 * resolve attribution.
 */
export function GuessHistory({ guesses, players }: Props) {
  const playerFor = (userId: string) =>
    players.find((m) => m.user_id === userId)

  return (
    <section>
      <h3>Guesses</h3>
      {guesses.length === 0 ? (
        <p className="muted">No guesses yet.</p>
      ) : (
        <ul>
          {guesses.map((g) => {
            const guesser = playerFor(g.user_id)
            return (
              <li key={g.id}>
                <strong style={{ color: colorVarFor(guesser?.color) }}>
                  {guesser?.username ?? 'someone'}
                </strong>{' '}
                guessed <strong>{g.number}</strong>
                {' — '}
                {g.was_correct ? 'correct!' : 'nope'}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
