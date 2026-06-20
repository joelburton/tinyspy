import { useEffect, useRef } from 'react'
import type { ClueRow } from '../hooks/useClues'
import type { GuessRow } from '../hooks/useBoard'
import type { Player } from '../hooks/useGame'
import { cls } from '../../common/lib/cls'
import { colorVarFor } from '../../common/lib/memberColor'
import styles from './GameLog.module.css'

type Props = {
  clues: ClueRow[]
  /** Every guess, in any order — grouped by turn below. (A word can appear
   *  twice, once per seat, which is exactly why this is the guess log and not
   *  the per-word board state.) */
  guesses: GuessRow[]
  /** Both seated players, with usernames + profile colors. Used to
   *  resolve seat letters (`'A'` / `'B'`) on each clue / guess row
   *  back to the human-facing identity. */
  players: Player[]
}

/**
 * Turn-by-turn replay in the right column, beneath the action slot.
 * Chronological order: oldest turn at the top, latest at the bottom.
 * Auto-scrolls to the bottom on every new clue or guess (effect
 * below) — same pattern as wordknit / psychicnum GuessHistory and
 * ChatBody.
 *
 * Each turn renders as two lines + a divider above (except the first):
 *
 *   Turn #N: <clue-giver>: <count> <WORD>
 *     <guesser> → <WORD₁> <WORD₂> <WORD₃>
 *
 * The clue-giver and guesser are colored by their profile color.
 * Each guessed word is colored by its reveal outcome (agent green
 * / neutral tan / assassin red) — same vocabulary the board uses
 * for revealed tiles. When the guesser passed without making a
 * guess, the line reads `<guesser> → (no guesses made)`.
 *
 * **Why the layout changed.** The previous "one card per guess
 * with a colored left strip" pattern was using the strip for
 * player identity, which clashed with how the same affordance is
 * used elsewhere (wordknit / psychicnum use the strip for the
 * outcome verdict). Now identity rides on text color (matching the
 * PlayersStrip + ClubGameCard pattern) and the outcome rides on
 * the colored word — no double-meaning for the same visual.
 *
 * **Turn separation.** A thin horizontal rule between turns gives
 * the eye a clear unit boundary; previously the per-guess card
 * borders were the strongest line on screen, which made each
 * guess look more important than the turn it belonged to.
 *
 * Data source: the same `clues` and `words` arrays the board
 * already has from useClues + useBoard. All grouping happens
 * client-side — no extra queries — because the data set is tiny.
 */
export function GameLog({ clues, guesses, players }: Props) {
  const listRef = useRef<HTMLOListElement>(null)

  // Auto-scroll to the bottom on every new clue or guess —
  // ChatBody-style "always snap to latest." Effect runs even
  // when listRef is null (empty state); the early null-check on
  // the ref makes that a no-op.
  useEffect(function scrollToLatest() {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [clues, guesses])

  if (clues.length === 0) return null

  // seat letter → Player so each clue / guess row can resolve back
  // to the human-facing identity (username + profile color). Both
  // seats are always populated by create_game, so the lookup
  // never misses in a valid game. Key type is `string` (not the
  // narrower `'A' | 'B'`) so the lookup works on the db-derived
  // `by_seat` / `revealed_by` strings without casts.
  const playerBySeat = new Map<string, Player>(
    players.map((p) => [p.seat, p] as const),
  )

  const sortedGuesses = [...guesses].sort((a, b) =>
    (a.turn_number - b.turn_number)
    || a.guessed_at.localeCompare(b.guessed_at),
  )

  // Turns may exist in the clue list, in the guess list, or both.
  // Union the turn numbers so the log shows every turn that did
  // anything. Sorted ascending so the oldest turn is at the top
  // of the log; the auto-scroll effect keeps the latest in view.
  const turnNumbers = Array.from(
    new Set([
      ...clues.map((c) => c.turn_number),
      ...sortedGuesses.map((g) => g.turn_number),
    ]),
  ).sort((a, b) => a - b)

  return (
    <section className={styles.gameLog}>
      <h3 className={styles.heading}>Game log</h3>
      <ol ref={listRef} className={styles.list}>
        {turnNumbers.map((t) => {
          const clue = clues.find((c) => c.turn_number === t)
          if (!clue) return null
          const clueGiver = playerBySeat.get(clue.by_seat)
          const turnGuesses = sortedGuesses.filter((g) => g.turn_number === t)
          return (
            <li key={t} className={styles.turn}>
              <div className={styles.clueLine}>
                <span className="muted">#{t}:</span>{' '}
                <strong style={{ color: colorVarFor(clueGiver?.color) }}>
                  {clueGiver?.username ?? clue.by_seat}
                </strong>
                : {clue.count}{' '}
                <span className={styles.clueWord}>
                  {clue.word.toUpperCase()}
                </span>
              </div>
              {/* The guesser is implicit (the other of two seats), so the line
                  leads with an arrow rather than naming them. */}
              <div className={styles.guessLine}>
                {'-> '}
                {turnGuesses.length === 0 ? (
                  <span className="muted">(no guesses made)</span>
                ) : (
                  turnGuesses.map((g, idx) => (
                    <span key={g.position}>
                      {idx > 0 && ' '}
                      <span
                        className={cls(
                          styles.guessWord,
                          g.outcome === 'G' && styles.guessWord_G,
                          g.outcome === 'N' && styles.guessWord_N,
                          g.outcome === 'A' && styles.guessWord_A,
                        )}
                      >
                        {g.word.toUpperCase()}
                      </span>
                    </span>
                  ))
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
