// cs-unmet

import { describe, expect, it } from 'vitest'
import { ZTest_cellsOf, ZTest_unreachableFrom } from '@/common/board-cursor/reachability.fixture'
import { BOARD_SHAPE } from './boardShape'

describe('BOARD_SHAPE', () => {
  it('is six across and eight down, a cell for each of the 48 letters', () => {
    expect([BOARD_SHAPE.numCols, BOARD_SHAPE.numRows]).toEqual([6, 8])
    expect(ZTest_cellsOf(BOARD_SHAPE)).toHaveLength(48)
  })

  // The reachability invariant: the keyboard cursor can get from every letter to
  // every other.
  it('every letter can reach every other by arrows', () => {
    for (const start of ZTest_cellsOf(BOARD_SHAPE)) {
      expect(ZTest_unreachableFrom(BOARD_SHAPE, start), `from ${start.x},${start.y}`).toEqual([])
    }
  })
})
