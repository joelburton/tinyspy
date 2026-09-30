// cs-unmet

import type { Cell } from './stepCell'

/** The board position at a cell, counting row by row across `numCols` columns. */
export function positionAt(x: number, y: number, numCols: number): number {
  return y * numCols + x
}

/** The cell a board position sits at, on a board `numCols` columns wide. */
export function cellAt(position: number, numCols: number): Cell {
  return { x: position % numCols, y: Math.floor(position / numCols) }
}
