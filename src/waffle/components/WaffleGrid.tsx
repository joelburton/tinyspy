import { useEffect, useRef, useState } from 'react'
import { cls } from '../../common/lib/util/cls'
import { tileColor } from '../../common/lib/color/tileColor'
import { CELLS, isHole } from '../lib/waffle'
import shared from '../../common/components/game/PlayArea.module.css'
import history from '../../common/components/game/lists/historyViewer.module.css'
import styles from './WaffleGrid.module.css'

type Props = {
  /** 25-char board string, holes = '.'. Live board OR a historical snapshot. */
  board: string
  /** 25-char per-tile color codes (g/y/x/.), or null before load. */
  colors: string | null
  /** When true, tiles aren't interactive (terminal / paused / viewing history). */
  disabled?: boolean
  /** Turn-history: draw the yellow "viewing a past turn" frame + suppress the
   *  swap-pop flash (the ringed cells mark the move instead). */
  viewing?: boolean
  /** Turn-history: the cells the viewed swap moved — ring them. */
  highlight?: ReadonlySet<number>
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
export function WaffleGrid({ board, colors, disabled, viewing = false, highlight, onSwap }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  // Drag source (HTML5 drag-and-drop, the desktop alternative to tap).
  const dragFrom = useRef<number | null>(null)

  // Recently-swapped tile flash: when the board changes, the two cells whose
  // letters moved briefly pop, so the eye tracks the change (the only other cue
  // is the recolor). The board updates via the realtime refetch (Pattern A), so
  // we detect the move by diffing the new board against the previous one — which
  // also catches a teammate's swap in coop. The setState is scheduled off the
  // effect body (rAF) so it reads as a transient, not a cascading render.
  const [flashing, setFlashing] = useState<ReadonlySet<number>>(() => new Set())
  const prevBoardRef = useRef<string | null>(null)
  const prevViewingRef = useRef(false)
  useEffect(
    function flashSwappedTiles() {
      const prev = prevBoardRef.current
      prevBoardRef.current = board
      const wasViewing = prevViewingRef.current
      prevViewingRef.current = viewing
      // Don't flash while viewing a past turn (the ringed cells mark the move),
      // nor on the frame we return to live — the board jumps historical→live,
      // which is navigation, not a swap.
      if (viewing || wasViewing) return
      // Seed silently on first load / a length change — don't flash the whole
      // board into existence.
      if (prev === null || prev.length !== board.length) return
      const moved: number[] = []
      for (let i = 0; i < board.length; i++) {
        if (!isHole(i) && board[i] !== prev[i]) moved.push(i)
      }
      if (moved.length === 0) return
      const raf = requestAnimationFrame(() => setFlashing(new Set(moved)))
      const clear = window.setTimeout(() => setFlashing(new Set()), 480)
      return () => {
        cancelAnimationFrame(raf)
        clearTimeout(clear)
      }
    },
    [board, viewing],
  )

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
      {/* The yellow frame marks "you're viewing a past turn" — the shared
          history-view marker (common/components/game/lists/historyViewer.module.css). */}
      <div
        className={cls(styles.grid, viewing && history.frame)}
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
                shared.tile,
                styles[color],
                selected === pos && styles.selected,
                flashing.has(pos) && styles.justSwapped,
                highlight?.has(pos) && styles.highlighted,
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
