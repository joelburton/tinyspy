import { useRef, useState } from 'react'
import { cls } from '../../common/lib/cls'
import { tileColor } from '../../common/lib/tileColor'
import { CELLS, isHole } from '../lib/waffle'
import shared from '../../common/components/PlayArea.module.css'
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
 *
 * Tiles use the SHARED `.tile` chrome (box / radius / shadow / hover) from
 * common; each color class re-sets the `--tile-*` tokens to a Wordle color, and
 * a picked-up tile gets waffle's own ring (the shared dark `.selected` fill is
 * skipped — it would bury the color). The square board lives in a `.board`
 * wrapper, top-aligned in the shared `.boardCol` (see WaffleGrid.module.css).
 */
export function WaffleGrid({ board, colors, disabled, onSwap }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  // Drag source (HTML5 drag-and-drop, the desktop alternative to tap).
  const dragFrom = useRef<number | null>(null)

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

  function drop(pos: number) {
    const from = dragFrom.current
    dragFrom.current = null
    if (from === null || from === pos || isHole(from) || isHole(pos) || disabled) {
      return
    }
    onSwap(from, pos)
    setSelected(null)
  }

  return (
    <div className={styles.board}>
      <div className={styles.grid} role="grid" aria-label="Waffle board">
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
                shared.tile,
                styles[color],
                selected === pos && styles.selected,
              )}
              aria-label={`${letter.toUpperCase()} (${color})`}
              aria-pressed={selected === pos}
              disabled={disabled}
              draggable={!disabled}
              onClick={() => activate(pos)}
              onDragStart={(e) => {
                dragFrom.current = pos
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                drop(pos)
              }}
              onDragEnd={() => {
                dragFrom.current = null
              }}
            >
              <span className={styles.letter}>{letter.toUpperCase()}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
