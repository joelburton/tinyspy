import { useState } from 'react'
import { cls } from '../../common/lib/cls'
import { CELLS, isHole } from '../lib/waffle'
import { tileColor } from '../lib/colors'
import styles from './WaffleGrid.module.css'

type Props = {
  /** 25-char board string, holes = '.'. */
  board: string
  /** 25-char per-tile color codes (g/y/x/.), or null before load. */
  colors: string | null
  /** When true, tiles aren't interactive (terminal / paused). */
  disabled?: boolean
  /** Swap the letters of two filled cells. */
  onSwap: (a: number, b: number) => void
}

/**
 * The 5×5 waffle lattice. Tap a tile to pick it up (it highlights),
 * tap a second to swap them; tap the same tile again to cancel. Holes
 * render as gaps. Tile background is the server-computed Wordle-style
 * feedback (green / yellow / gray) — the FE only renders it, never
 * recomputes it (it doesn't hold the solution).
 */
export function WaffleGrid({ board, colors, disabled, onSwap }: Props) {
  const [selected, setSelected] = useState<number | null>(null)

  function activate(pos: number) {
    if (disabled || isHole(pos)) return
    if (selected === null) {
      setSelected(pos)
    } else if (selected === pos) {
      setSelected(null)
    } else {
      onSwap(selected, pos)
      setSelected(null)
    }
  }

  return (
    <div
      className={cls(styles.grid, disabled && styles.disabled)}
      role="grid"
      aria-label="Waffle board"
    >
      {Array.from({ length: CELLS }, (_, pos) => {
        if (isHole(pos)) {
          return <span key={pos} className={styles.hole} aria-hidden="true" />
        }
        const letter = board[pos] ?? ' '
        const color = tileColor(colors?.[pos])
        return (
          <button
            key={pos}
            type="button"
            className={cls(
              styles.tile,
              styles[color],
              selected === pos && styles.selected,
            )}
            aria-label={`${letter.toUpperCase()} (${color})`}
            aria-pressed={selected === pos}
            disabled={disabled}
            onClick={() => activate(pos)}
          >
            {letter.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}
