import { useEffect, type RefObject } from 'react'
import { isNonGameField } from '../../common/hooks/input/useAppShortcuts'
import {
  advanceAfterFill,
  jumpClue,
  jumpWordEdge,
  moveCursor,
  retreatForBackspace,
  type ArrowKey,
  type Cursor,
} from '../lib/cursor'
import type { Cell } from '../lib/types'

/** The current, mutable play state the window handler reads on each event
 *  (via a ref, to dodge stale closures). PlayArea rebuilds it every render. */
export type GridKeyboard = {
  enabled: boolean
  grid: Cell[][]
  cursor: Cursor
  pencil: boolean
  setCursor: (c: Cursor) => void
  /** Current fill at a cell (null if empty); used for Backspace's two-step. */
  fillAt: (row: number, col: number) => string | null
  isGiven: (row: number, col: number) => boolean
  setCell: (row: number, col: number, fill: string | null, pencil: boolean) => void
}

const ARROWS = new Set<ArrowKey>(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

/**
 * The crossword keyboard, ported from crossplay's PuzzleView (grid keys
 * only — the ⌥ chat/menu shortcuts belong to the PupGames shell). A single
 * window `keydown` listener reads the latest state from `ref`.
 *
 * Bails when disabled, when focus is in an editable field (so the setup
 * dialog / help modal keep their keys), and on Ctrl/Meta/Alt chords. Shift
 * is a play modifier (Shift+Arrow, Shift+Tab), so it's allowed through.
 */
export function useGridKeyboard(ref: RefObject<GridKeyboard | null>) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const k = ref.current
      if (!k || !k.enabled) return
      // Tab still navigates clues even from a field; everything else bails.
      if (isNonGameField(e.target) && e.key !== 'Tab') return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const { grid, cursor, pencil, setCursor, fillAt, isGiven, setCell } = k
      const { row, col } = cursor

      // Letters: fill + advance. A given cell is immutable — slide off it.
      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault()
        if (!isGiven(row, col)) setCell(row, col, e.key.toUpperCase(), pencil)
        setCursor(advanceAfterFill(grid, cursor))
        return
      }

      if (e.key === 'Backspace') {
        e.preventDefault()
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

      if (e.key === ' ') {
        e.preventDefault()
        setCursor(advanceAfterFill(grid, cursor))
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
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ref])
}
