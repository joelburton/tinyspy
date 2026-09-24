// cs-unmet

import { describe, expect, it } from 'vitest'
import { cellsOf, unreachableFrom } from '@/common/board-cursor/reachability.fixture'
import { BOARD_SHAPE, cellAt, coordAt } from './boardShape'

describe('BOARD_SHAPE', () => {
  it('is six across and eight down, a cell for each of the 48 letters', () => {
    expect([BOARD_SHAPE.cols, BOARD_SHAPE.rows]).toEqual([6, 8])
    expect(cellsOf(BOARD_SHAPE)).toHaveLength(48)
  })

  // The board names a cell [row, col]; the cursor names it { x, y }.
  it('converts a board coordinate to a cursor cell and back', () => {
    expect(cellAt([2, 5])).toEqual({ x: 5, y: 2 })
    expect(coordAt({ x: 5, y: 2 })).toEqual([2, 5])
    for (const cell of cellsOf(BOARD_SHAPE)) expect(cellAt(coordAt(cell))).toEqual(cell)
  })

  // The reachability invariant: the keyboard cursor can get from every letter to
  // every other.
  it('every letter can reach every other by arrows', () => {
    for (const start of cellsOf(BOARD_SHAPE)) {
      expect(unreachableFrom(BOARD_SHAPE, start), `from ${start.x},${start.y}`).toEqual([])
    }
  })
})
