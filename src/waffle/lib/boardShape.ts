// cs-unmet

import type { BoardShape } from '@/common/board-cursor/stepCell'
import { GRID, isHole } from './waffle'

/**
 * The shape of the board, for the keyboard's selection cursor: the 5×5 grid
 * with its four holes missing. A hole is shape, not state — it never has a
 * letter to pick — so an arrow passes over it to the tile beyond.
 */
export const BOARD_SHAPE: BoardShape = {
  cols: GRID,
  rows: GRID,
  exists: (x, y) => !isHole(positionAt(x, y)),
}

/** The board position at a cell — row by row, as the board string is. */
export function positionAt(x: number, y: number): number {
  return y * GRID + x
}

/** The cell a board position sits at. */
export function cellAt(position: number): { x: number; y: number } {
  return { x: position % GRID, y: Math.floor(position / GRID) }
}
