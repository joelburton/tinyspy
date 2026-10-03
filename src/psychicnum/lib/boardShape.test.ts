// cs-unmet

import { describe, expect, it } from 'vitest'
import { ZTest_cellsOf, ZTest_unreachableFrom } from '@/common/board-cursor/reachability.fixture'
import { makeBoardShape } from './boardShape'

// Every board size setup allows: 5..20 words.
const SIZES = Array.from({ length: 16 }, (_, i) => i + 5)

describe('makeBoardShape', () => {
  it('has a cell for every word and none beyond', () => {
    for (const n of SIZES) expect(ZTest_cellsOf(makeBoardShape(n))).toHaveLength(n)
  })

  it('lays 7 words out 3 across, with one on the last row', () => {
    const boardShape = makeBoardShape(7)
    expect([boardShape.numCols, boardShape.numRows]).toEqual([3, 3])
    expect(boardShape.exists(0, 2)).toBe(true)
    expect(boardShape.exists(1, 2)).toBe(false)
  })

  // The reachability invariant: the keyboard cursor can get from every tile to
  // every other, whatever the short last row leaves out.
  it('every tile can reach every other by arrows, at every size', () => {
    for (const n of SIZES) {
      const boardShape = makeBoardShape(n)
      for (const start of ZTest_cellsOf(boardShape)) {
        expect(ZTest_unreachableFrom(boardShape, start), `${n} words, from ${start.x},${start.y}`).toEqual([])
      }
    }
  })
})
