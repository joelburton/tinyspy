import type { ClueRow } from '../hooks/useClues'
import type { WordRow } from '../hooks/useBoard'
import type { Player } from '../hooks/useGame'
import { cls } from '../../common/lib/cls'
import { colorVarFor } from '../../common/lib/peerColor'
import { labelName } from '../lib/labels'
import styles from './GameLog.module.css'

type Props = {
  clues: ClueRow[]
  words: WordRow[]
  /** Both seated players, with profile colors. Used to color the
   *  seat letter on each clue/guess row so the log reads as
   *  "this person did that." */
  players: Player[]
}

/**
 * Turn-by-turn replay shown next to the board on desktop (beneath it on
 * narrow screens). Latest turn at the top so the most recent activity
 * is what you see without scrolling; within a turn, the clue is listed
 * first and then each guess in chronological order so each turn reads
 * as a small top-down narrative.
 *
 * Data source: the same `clues` array and `words` array the board
 * already has from useClues + useBoard. We do all grouping here
 * client-side — no extra queries — because the data set is tiny
 * (≤ a handful of clues and ≤ 25 guesses).
 *
 * The CSS gives this section a fixed height matching the board grid
 * and lets the inner <ol> scroll; we don't reverse guesses-within-turn
 * because reading order matters more than recency at that grain.
 */
export function GameLog({ clues, words, players }: Props) {
  if (clues.length === 0) return null

  // seat letter → CSS var for that seat's profile color.
  // Both seats are always populated by create_game, so the
  // lookup never misses in a valid game. Key type is `string`
  // (not the narrower `'A' | 'B'`) so the lookup works on the
  // db-derived `by_seat` / `revealed_by` strings without casts.
  const colorBySeat = new Map<string, string>(
    players.map((p) => [p.seat, colorVarFor(p.color)] as const),
  )

  const guesses = words
    .filter((w) => w.revealed_at !== null)
    .sort((a, b) =>
      (a.revealed_in_turn ?? 0) - (b.revealed_in_turn ?? 0)
      || (a.revealed_at ?? '').localeCompare(b.revealed_at ?? ''),
    )

  // Turns may exist in the clue list, in the guess list, or both. Union the
  // turn numbers so the log shows every turn that did anything. Sorted
  // descending so the latest turn appears at the top of the log.
  const turnNumbers = Array.from(
    new Set([
      ...clues.map((c) => c.turn_number),
      ...guesses.map((g) => g.revealed_in_turn ?? 0),
    ]),
  ).sort((a, b) => b - a)

  return (
    <section className={styles.gameLog}>
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
                  {' '}·{' '}
                  <strong style={{ color: colorBySeat.get(clue.by_seat) }}>
                    {clue.by_seat}
                  </strong>
                  : {clue.word.toUpperCase()} · {clue.count}
                </span>
              )}
              {turnGuesses.map((g) => (
                <div key={g.position} className={styles.logGuess}>
                  <strong
                    style={{
                      color: g.revealed_by
                        ? colorBySeat.get(g.revealed_by)
                        : undefined,
                    }}
                  >
                    {g.revealed_by}
                  </strong>{' '}
                  → {g.word}{' '}
                  <span className={cls(styles.logLabel, styles[`logLabel${g.revealed_as}`])}>
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
