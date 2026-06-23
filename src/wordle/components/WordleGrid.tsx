import { useState } from 'react'
import { cls } from '../../common/lib/cls'
import { revealVar, tileColor } from '../lib/colors'
import styles from './WordleGrid.module.css'

/** Per-tile stagger so a row's letters flip left-to-right, not at once. */
const REVEAL_STEP_S = 0.22

type SubmittedRow = { guess: string; colors: string }

type Props = {
  /** Submitted guesses (letters + their g/y/x colors), in order. */
  rows: SubmittedRow[]
  /** The active typing row's current letters (empty when not the
   *  player's turn / game over). Rendered just below the submitted
   *  rows, with no colors yet. */
  current: string
  /** A just-submitted word awaiting its colored server row. Shown in the
   *  next slot as an uncolored (filled) row so the letters stay put
   *  during the round-trip; when the real row lands it flips in place.
   *  Empty when there's nothing in flight. */
  pending: string
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
 *
 * **Reveal animation.** When a guess lands, its row's tiles flip over
 * one at a time (NYT-style), each painting its color at the midpoint of
 * the flip. We animate only rows that *appear after this component
 * mounts* — rows already present at mount (a mid-game refresh, or the
 * opponent's revealed history) render in their final color without
 * re-flipping. `firstRows` captures that initial count once; any row at
 * an index ≥ it is "new" and flips. The static color class is omitted on
 * flipping tiles — the keyframes (with `forwards`) hold the final color —
 * so each tile reads blank until its flip reaches halfway.
 */
export function WordleGrid({ rows, current, pending, maxGuesses, active }: Props) {
  const activeIndex = active ? rows.length : -1
  // Rows present at first render — these don't flip (only fresh guesses do).
  // A lazy useState initializer captures the count once at mount and is
  // safe to read in render; we never call the setter, so it's a constant.
  const [firstRows] = useState(rows.length)

  return (
    <div className={styles.grid} role="grid" aria-label="WordNerd board">
      {Array.from({ length: maxGuesses }, (_, r) => {
        const submitted = rows[r]
        const isActive = r === activeIndex
        // The pending (in-flight) word sits in the first empty slot.
        const isPending = !submitted && !!pending && r === rows.length
        const flipping = !!submitted && r >= firstRows
        return (
          <div key={r} className={styles.row} role="row">
            {Array.from({ length: 5 }, (_, c) => {
              let letter = ''
              let color = tileColor(undefined)
              if (submitted) {
                letter = submitted.guess[c] ?? ''
                color = tileColor(submitted.colors[c])
              } else if (isPending) {
                letter = pending[c] ?? ''
              } else if (isActive) {
                letter = current[c] ?? ''
              }
              return (
                <div
                  key={c}
                  className={cls(
                    styles.tile,
                    // Flipping tiles take their color from the keyframes
                    // (via --reveal-bg), not the static color class.
                    flipping ? styles.reveal : styles[color],
                    letter && color === 'blank' && styles.filled,
                  )}
                  style={
                    flipping
                      ? {
                          ['--reveal-bg' as string]: revealVar(color),
                          animationDelay: `${c * REVEAL_STEP_S}s`,
                        }
                      : undefined
                  }
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
