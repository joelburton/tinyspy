// cs-unmet

import { useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { cellKey } from '../lib/cellKey'
import { advanceAfterFill, findCellByNumber, initialCursor, jumpClue } from '../lib/cursor'
import { nextMarkState } from '../lib/marks'
import type { GGridEntry } from '../reactTypes'
import type { GBoard, GCursor, GMarkSide, GMarkType, GPuzzleCell, GRebusPostCommit } from '../types'
import { useGridKeyboard } from './useGridKeyboard'

/**
 * Typing on the grid: the cursor, pen or pencil, and the three overlays a key
 * opens — the rebus box, the read-only peek and the jump-to-number popup —
 * wired to the grid's keys (`useGridKeyboard`) and to the two writes a key
 * makes. The grid is the puzzle's, which never changes; what a cell holds is
 * the board as drawn, my pending writes included.
 */
export function useGridEntry({
  grid,
  board,
  isInteractive,
  isNavigable,
  setCell,
  setMark,
  localFeedbackSlot,
}: {
  grid: GPuzzleCell[][]
  board: GBoard
  // The board takes writes from me right now.
  isInteractive: boolean
  // The cursor still moves: while I play, and once the game has ended, when
  // walking the finished grid is part of the post-game.
  isNavigable: boolean
  setCell: (row: number, col: number, fill: string | null, pencil: boolean) => void
  setMark: (row: number, col: number, side: GMarkSide, mark: GMarkType | null) => void
  // A click is the player's next move, and dismisses what the slot said.
  localFeedbackSlot: FeedbackSlot
}): { entry: GGridEntry } {
  // Every puzzle has an open cell to start on.
  const [cursor, setCursor] = useState<GCursor>(() => initialCursor(grid)!)
  const [pencil, setPencil] = useState(false)
  const [rebus, setRebus] = useState<{ row: number; col: number } | null>(null)
  const [peek, setPeek] = useState<{ row: number; col: number; value: string } | null>(null)
  const [isNumberJumpOpen, setIsNumberJumpOpen] = useState(false)

  /** Is this cell the author's? A given letter can never be typed over. */
  function isGiven(row: number, col: number): boolean {
    const cell = grid[row]?.[col]
    return cell?.kind === 'cell' && cell.given === true
  }
  /** What a cell holds on my board; a given is not on it. */
  function fillAt(row: number, col: number): string | null {
    return board.cellsById[cellKey(row, col)]?.fill ?? null
  }
  /** What a cell READS right now — a given's printed letter, or the fill. */
  function readAt(row: number, col: number): string | null {
    const cell = grid[row]?.[col]
    if (cell?.kind === 'cell' && cell.given === true) return cell.fill ?? null
    return fillAt(row, col)
  }

  /** Cycle the cryptic edge mark on one side of a cell: none → break → hyphen. */
  function cycleMark(row: number, col: number, side: GMarkSide) {
    const cell = board.cellsById[cellKey(row, col)]
    const current = side === 'right' ? cell?.markRight : cell?.markBottom
    setMark(row, col, side, nextMarkState(current ?? undefined))
  }

  const { actRebus } = useGridKeyboard({
    enabled: isNavigable,
    isBoardInteractive: isInteractive,
    // One of this game's own overlays owns the keyboard.
    suspended: rebus !== null || isNumberJumpOpen,
    grid,
    cursor,
    pencil,
    setCursor,
    fillAt,
    isGiven,
    setCell,
    onRebus: (row, col) => setRebus({ row, col }),
    onNumberJump: () => setIsNumberJumpOpen(true),
    onPeek: (row, col) => setPeek({ row, col, value: readAt(row, col) ?? '' }),
    peeking: peek !== null,
    clearPeek: () => setPeek(null),
    onMark: cycleMark,
  })

  function clickCell(row: number, col: number) {
    localFeedbackSlot.dismiss()
    setCursor((prev) => (prev.row === row && prev.col === col
      ? { ...prev, dir: prev.dir === 'across' ? 'down' : 'across' }
      : { row, col, dir: prev.dir }))
  }

  function submitRebus(value: string, post: GRebusPostCommit) {
    if (rebus === null) return
    setCell(rebus.row, rebus.col, value || null, pencil)
    // The cursor sits on the rebus cell, so both moves start there.
    setCursor((cur) => {
      if (post === 'jumpNext') return jumpClue(grid, cur, 1)
      if (post === 'jumpPrev') return jumpClue(grid, cur, -1)
      return advanceAfterFill(grid, cur)
    })
    setRebus(null)
  }

  function jumpTo(n: number): boolean {
    const pos = findCellByNumber(grid, n)
    if (pos === null) return false
    setCursor((cur) => ({ row: pos.row, col: pos.col, dir: cur.dir }))
    setIsNumberJumpOpen(false)
    return true
  }

  return {
    entry: {
      cursor,
      setCursor,
      clickCell,
      pencil,
      togglePencil: () => setPencil((p) => !p),
      rebus: rebus === null ? null : { ...rebus, initial: fillAt(rebus.row, rebus.col) ?? '' },
      submitRebus,
      cancelRebus: () => setRebus(null),
      actRebus,
      peek,
      numberJump: { isOpen: isNumberJumpOpen, jumpTo, close: () => setIsNumberJumpOpen(false) },
    },
  }
}
