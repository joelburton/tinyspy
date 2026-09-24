// cs-unmet

import type { ArrowKey } from './gridCursor'

export type Cell = { x: number; y: number }

/** Which cells a board HAS — fixed for the game's life. A cell a piece has
 *  been decided on still exists; a hole never does. */
export type BoardShape = {
  cols: number
  rows: number
  exists: (x: number, y: number) => boolean
}

/**
 * Where an arrow takes a selection cursor: the next cell that exists in the
 * arrow's direction, passing over a hole (waffle's) to the cell beyond it. With
 * none that way — the board's edge, or a short last row (psychicnum's) — the
 * cursor stays put.
 *
 * Only whether a cell EXISTS is asked, never whether it can be picked right
 * now: the cursor rests on a decided piece as it does on any other, so the
 * same press always goes the same place.
 */
export function stepCell(from: Cell, key: ArrowKey, shape: BoardShape): Cell {
  const dx = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0
  const dy = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0
  for (let x = from.x + dx, y = from.y + dy; x >= 0 && x < shape.cols && y >= 0 && y < shape.rows; x += dx, y += dy) {
    if (shape.exists(x, y)) return { x, y }
  }
  return from
}
