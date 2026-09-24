// cs-unmet

import { describe, expect, it } from 'vitest'
import { cellsOf, unreachableFrom } from '@/common/board-cursor/reachability.fixture'
import { BOARD_SHAPE, cellAt, positionAt } from './boardShape'

describe('BOARD_SHAPE', () => {
  it('is five by five, a cell for each of the 25 words', () => {
    expect([BOARD_SHAPE.cols, BOARD_SHAPE.rows]).toEqual([5, 5])
    expect(cellsOf(BOARD_SHAPE)).toHaveLength(25)
  })

  it('names a position by its cell and back, row by row', () => {
    expect(cellAt(0)).toEqual({ x: 0, y: 0 })
    expect(cellAt(7)).toEqual({ x: 2, y: 1 })
    expect(positionAt(4, 4)).toBe(24)
    for (let p = 0; p < 25; p++) expect(positionAt(cellAt(p).x, cellAt(p).y)).toBe(p)
  })

  // The reachability invariant: the keyboard cursor can get from every word to
  // every other.
  it('every word can reach every other by arrows', () => {
    for (const start of cellsOf(BOARD_SHAPE)) {
      expect(unreachableFrom(BOARD_SHAPE, start), `from ${start.x},${start.y}`).toEqual([])
    }
  })
})
