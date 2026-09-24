// cs-unmet

import type { ArrowKey } from './gridCursor'
import { stepCell, type BoardShape, type Cell } from './stepCell'

const ARROWS: readonly ArrowKey[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']

const name = (c: Cell) => `${c.x},${c.y}`

/** Every cell the board has, row by row. */
export function cellsOf(shape: BoardShape): Cell[] {
  const cells: Cell[] = []
  for (let y = 0; y < shape.rows; y++) {
    for (let x = 0; x < shape.cols; x++) {
      if (shape.exists(x, y)) cells.push({ x, y })
    }
  }
  return cells
}

/**
 * For a TEST — the cells a selection cursor starting at `start` can never
 * reach by arrows, walking `stepCell`'s own answers. A board's shape is sound
 * when this is empty from every cell (plans/keyboard-nav-plan.md → the
 * reachability invariant).
 *
 *     for (const start of cellsOf(shape)) expect(unreachableFrom(shape, start)).toEqual([])
 */
export function unreachableFrom(shape: BoardShape, start: Cell): Cell[] {
  const seen = new Set([name(start)])
  const queue = [start]
  for (let cell = queue.shift(); cell !== undefined; cell = queue.shift()) {
    for (const key of ARROWS) {
      const next = stepCell(cell, key, shape)
      if (!seen.has(name(next))) {
        seen.add(name(next))
        queue.push(next)
      }
    }
  }
  return cellsOf(shape).filter((c) => !seen.has(name(c)))
}
