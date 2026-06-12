import type { ClueRow } from '../hooks/useClues'
import type { Database } from '../types/db'
import { labelName } from '../lib/labels'

type WordRow = Database['public']['Tables']['words']['Row']

type Props = {
  clues: ClueRow[]
  words: WordRow[]
}

/**
 * Turn-by-turn replay shown beneath the board.
 *
 * Each turn slot contains, in order:
 *   1. the clue (if one was given — sudden-death turns don't have one), and
 *   2. each guess made during that turn, ordered by `revealed_at`.
 *
 * Data source: the same `clues` array and `words` array the board
 * already has from useClues + useBoard. We do all grouping here client-side
 * — no extra queries — because the data set is tiny (≤ a handful of clues
 * and ≤ 25 guesses).
 */
export function GameLog({ clues, words }: Props) {
  if (clues.length === 0) return null

  const guesses = words
    .filter((w) => w.revealed_at !== null)
    .sort((a, b) =>
      (a.revealed_in_turn ?? 0) - (b.revealed_in_turn ?? 0)
      || (a.revealed_at ?? '').localeCompare(b.revealed_at ?? ''),
    )

  // Turns may exist in the clue list, in the guess list, or both. Union the
  // turn numbers so the log shows every turn that did anything.
  const turnNumbers = Array.from(
    new Set([
      ...clues.map((c) => c.turn_number),
      ...guesses.map((g) => g.revealed_in_turn ?? 0),
    ]),
  ).sort((a, b) => a - b)

  return (
    <section className="game-log">
      <h3>Game log</h3>
      <ol>
        {turnNumbers.map((t) => {
          const clue = clues.find((c) => c.turn_number === t)
          const turnGuesses = guesses.filter((g) => g.revealed_in_turn === t)
          return (
            <li key={t}>
              <span className="muted">turn {t}</span>
              {clue && (
                <span>
                  {' '}· <strong>{clue.by_seat}</strong>: {clue.word.toUpperCase()} · {clue.count}
                </span>
              )}
              {turnGuesses.map((g) => (
                <div key={g.position} className="log-guess">
                  <strong>{g.revealed_by}</strong> → {g.word}{' '}
                  <span className={`log-label log-label-${g.revealed_as}`}>
                    {labelName(g.revealed_as)}
                  </span>
                </div>
              ))}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
