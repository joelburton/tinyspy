// cs-unmet

import type { Cell } from './stepCell'

/** The board position at a cell, counting row by row across `cols` columns. */
export function positionAt(x: number, y: number, cols: number): number {
  return y * cols + x
}

/** The cell a board position sits at, on a board `cols` columns wide. */
export function cellAt(position: number, cols: number): Cell {
  return { x: position % cols, y: Math.floor(position / cols) }
}
