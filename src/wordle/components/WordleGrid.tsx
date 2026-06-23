import { cls } from '../../common/lib/cls'
import { tileColor } from '../lib/colors'
import styles from './WordleGrid.module.css'

type SubmittedRow = { guess: string; colors: string }

type Props = {
  /** Submitted guesses (letters + their g/y/x colors), in order. */
  rows: SubmittedRow[]
  /** The active typing row's current letters (empty when not the
   *  player's turn / game over). Rendered just below the submitted
   *  rows, with no colors yet. */
  current: string
  /** Total rows to draw — the guess budget (`max_guesses`). */
  maxGuesses: number
  /** Whether the active typing row should show (game still in play for
   *  this player). */
  active: boolean
}

/**
 * The Wordle board: `maxGuesses` rows of 5 tiles. A submitted row shows
 * each letter on its server-computed color (green/yellow/gray); the
 * active row shows the player's in-progress typing (uncolored); the
 * rest are empty. Colors come from `wordle.compute_colors` server-side
 * — the FE only renders them (it never holds the target).
 */
export function WordleGrid({ rows, current, maxGuesses, active }: Props) {
  const activeIndex = active ? rows.length : -1

  return (
    <div className={styles.grid} role="grid" aria-label="WordNerd board">
      {Array.from({ length: maxGuesses }, (_, r) => {
        const submitted = rows[r]
        const isActive = r === activeIndex
        return (
          <div key={r} className={styles.row} role="row">
            {Array.from({ length: 5 }, (_, c) => {
              let letter = ''
              let color = tileColor(undefined)
              if (submitted) {
                letter = submitted.guess[c] ?? ''
                color = tileColor(submitted.colors[c])
              } else if (isActive) {
                letter = current[c] ?? ''
              }
              return (
                <div
                  key={c}
                  className={cls(
                    styles.tile,
                    styles[color],
                    letter && color === 'blank' && styles.filled,
                  )}
                  role="gridcell"
                >
                  {letter.toUpperCase()}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
