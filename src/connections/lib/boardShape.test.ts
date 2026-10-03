// cs-unmet

import { describe, expect, it } from 'vitest'
import { ZTest_cellsOf, ZTest_unreachableFrom } from '@/common/board-cursor/reachability.fixture'
import { makeBoardShape } from './boardShape'

// Every count of loose tiles a game passes through: 16 at the start, four
// fewer for each solved band.
const COUNTS = [16, 12, 8, 4]

describe('makeBoardShape', () => {
  it('is four across, a row per four tiles, with a cell for every tile', () => {
    for (const n of COUNTS) {
      const shape = makeBoardShape(n)
      expect([shape.numCols, shape.numRows]).toEqual([4, n / 4])
      expect(ZTest_cellsOf(shape)).toHaveLength(n)
    }
  })

  it('has no cells once every category is solved', () => {
    expect(ZTest_cellsOf(makeBoardShape(0))).toEqual([])
  })

  // The reachability invariant: the keyboard cursor can get from every tile to
  // every other, at every count.
  it('every tile can reach every other by arrows, at every count', () => {
    for (const n of COUNTS) {
      const shape = makeBoardShape(n)
      for (const start of ZTest_cellsOf(shape)) {
        expect(ZTest_unreachableFrom(shape, start), `${n} tiles, from ${start.x},${start.y}`).toEqual([])
      }
    }
  })
})
