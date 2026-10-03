// cs-unmet

import { describe, expect, it } from 'vitest'
import { ZTest_cellsOf, ZTest_unreachableFrom } from '@/common/board-cursor/reachability.fixture'
import { BOARD_SHAPE } from './boardShape'

describe('BOARD_SHAPE', () => {
  it('is five by five, a cell for each of the 25 words', () => {
    expect([BOARD_SHAPE.numCols, BOARD_SHAPE.numRows]).toEqual([5, 5])
    expect(ZTest_cellsOf(BOARD_SHAPE)).toHaveLength(25)
  })

  // The reachability invariant: the keyboard cursor can get from every word to
  // every other.
  it('every word can reach every other by arrows', () => {
    for (const start of ZTest_cellsOf(BOARD_SHAPE)) {
      expect(ZTest_unreachableFrom(BOARD_SHAPE, start), `from ${start.x},${start.y}`).toEqual([])
    }
  })
})
