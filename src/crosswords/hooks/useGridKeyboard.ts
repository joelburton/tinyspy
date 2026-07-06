import { useEffect, type RefObject } from 'react'
import { isNonGameField } from '../../common/hooks/input/useAppShortcuts'
import {
  advanceAfterFill,
  jumpClue,
  jumpWordEdge,
  moveCursor,
  retreatForBackspace,
  wordCells,
  type ArrowKey,
  type Cursor,
} from '../lib/cursor'
import type { Cell } from '../lib/types'

/** The current, mutable play state the window handler reads on each event
 *  (via a ref, to dodge stale closures). PlayArea rebuilds it every render. */
export type GridKeyboard = {
  enabled: boolean
  /** A modal (rebus overlay / number-jump popup) owns the keyboard — bail
   *  entirely so board keys don't fire in parallel (mirrors crossplay's
   *  `numberJumpOpenRef` guard). */
  suspended: boolean
  grid: Cell[][]
  cursor: Cursor
  pencil: boolean
  setCursor: (c: Cursor) => void
  /** Current fill at a cell (null if empty); used for Backspace's two-step. */
  fillAt: (row: number, col: number) => string | null
  isGiven: (row: number, col: number) => boolean
  setCell: (row: number, col: number, fill: string | null, pencil: boolean) => void
  /** Open the rebus (multi-char) overlay over a cell. */
  onRebus: (row: number, col: number) => void
  /** Open the jump-to-clue-number popup (`#`). */
  onNumberJump: () => void
  /** Show a read-only zoom-peek of the current cell's fill (Shift+Space). */
  onPeek: (row: number, col: number) => void
  /** Dismiss the peek — called before every other handled key so it doesn't
   *  linger over the new cursor position. */
  clearPeek: () => void
}

const ARROWS = new Set<ArrowKey>(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

/**
 * The crossword keyboard, ported from crossplay's PuzzleView (grid keys
 * only — the ⌥ chat/menu shortcuts + cryptic `|`/`_` marks belong elsewhere:
 * the former to the PupGames shell, the latter deferred). A single window
 * `keydown` listener reads the latest state from `ref`.
 *
 * The full grid key set:
 *   - letter → fill + advance (given cells slide off)
 *   - Backspace → clear-in-place then retreat (two-step); Shift+Backspace
 *     clears the whole current word
 *   - Space → advance one cell; Shift+Space → read-only zoom-peek of the fill
 *   - arrows → move; Shift+arrows → jump to the word edge
 *   - Tab / Shift+Tab → next / previous clue
 *   - Shift+Enter → rebus (multi-char) overlay; `#` → jump-to-number popup
 *
 * Bails when disabled, when a modal is `suspended`-ing the board, when focus
 * is in an editable field (except Tab, which always navigates clues), and on
 * Ctrl/Meta/Alt chords (except `#`, checked first for Shift+3 layouts). Shift
 * is a play modifier, so it's otherwise allowed through.
 */
export function useGridKeyboard(ref: RefObject<GridKeyboard | null>) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const k = ref.current
      if (!k || !k.enabled) return
      // A modal owns the keyboard — bail entirely (rebus input / number-jump).
      if (k.suspended) return
      // Tab still navigates clues even from a field; everything else bails.
      if (isNonGameField(e.target) && e.key !== 'Tab') return

      const {
        grid, cursor, pencil, setCursor, fillAt, isGiven, setCell,
        onRebus, onNumberJump, onPeek, clearPeek,
      } = k
      const { row, col } = cursor

      // `#` opens the jump-to-clue-number popup. Checked before the chord bail
      // so it works on layouts where `#` is Shift+3.
      if (e.key === '#' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        onNumberJump()
        return
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return

      // Shift+Space: peek at the current cell's fill in a read-only zoom box.
      // It does NOT take focus, so subsequent navigation still flows through
      // this handler; every other branch below clears the peek first. The
      // cursor only ever sits on a fillable cell, so no block guard is needed.
      if (e.key === ' ' && e.shiftKey) {
        e.preventDefault()
        onPeek(row, col)
        return
      }
      // Any other handled key drops a lingering peek.
      clearPeek()

      // Bare Space: step one cell forward, same word-edge stop as a letter.
      if (e.key === ' ') {
        e.preventDefault()
        setCursor(advanceAfterFill(grid, cursor))
        return
      }

      // Shift+Enter opens the rebus overlay over an editable cell. Bare Enter
      // is a no-op (solvers hit it reflexively at a word's end).
      if (e.key === 'Enter') {
        e.preventDefault()
        if (e.shiftKey && !isGiven(row, col)) onRebus(row, col)
        return
      }

      if (ARROWS.has(e.key as ArrowKey)) {
        e.preventDefault()
        const key = e.key as ArrowKey
        setCursor(e.shiftKey ? jumpWordEdge(grid, cursor, key) : moveCursor(grid, cursor, key))
        return
      }

      if (e.key === 'Tab') {
        e.preventDefault()
        setCursor(jumpClue(grid, cursor, e.shiftKey ? -1 : 1))
        return
      }

      // Letters: fill + advance. A given cell is immutable — slide off it.
      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault()
        if (!isGiven(row, col)) setCell(row, col, e.key.toUpperCase(), pencil)
        setCursor(advanceAfterFill(grid, cursor))
        return
      }

      if (e.key === 'Backspace') {
        e.preventDefault()
        // Shift+Backspace: clear every fillable, non-given cell in the current
        // word, then drop the cursor on the word's first editable cell so the
        // solver can re-type immediately (crossplay PuzzleView).
        if (e.shiftKey) {
          const word = wordCells(grid, row, col, cursor.dir)
          for (const p of word) {
            if (!isGiven(p.row, p.col) && fillAt(p.row, p.col) != null) {
              setCell(p.row, p.col, null, false)
            }
          }
          const first = word.find((p) => !isGiven(p.row, p.col))
          if (first) setCursor({ ...cursor, row: first.row, col: first.col })
          return
        }
        if (isGiven(row, col)) {
          setCursor(retreatForBackspace(grid, cursor))
        } else if (fillAt(row, col) != null) {
          // Clear the current cell in place.
          setCell(row, col, null, false)
        } else {
          // Empty already — retreat and clear the cell we land on.
          const prev = retreatForBackspace(grid, cursor)
          if ((prev.row !== row || prev.col !== col) && !isGiven(prev.row, prev.col)) {
            setCell(prev.row, prev.col, null, false)
          }
          setCursor(prev)
        }
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ref])
}
