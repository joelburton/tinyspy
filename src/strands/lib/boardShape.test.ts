// cs-unmet

import { describe, expect, it } from 'vitest'
import { ZTest_cellsOf, ZTest_unreachableFrom } from '@/common/board-cursor/reachability.fixture'
import { ZTest_makeTiles } from './gameData.fixture'
import { BOARD_SHAPE, cellOf, tileIdAt } from './boardShape'

describe('BOARD_SHAPE', () => {
  it('is six across and eight down, a cell for each of the 48 letters', () => {
    expect([BOARD_SHAPE.numCols, BOARD_SHAPE.numRows]).toEqual([6, 8])
    expect(ZTest_cellsOf(BOARD_SHAPE)).toHaveLength(48)
  })

  // A tile names its place "r,c"; the cursor names it { x, y }.
  it('turns a tile into its cursor cell, and a cell into its tile\'s id', () => {
    const tiles = ZTest_makeTiles()
    expect(cellOf(tiles.find((t) => t.id === '2,5')!)).toEqual({ x: 5, y: 2 })
    expect(tileIdAt({ x: 5, y: 2 })).toBe('2,5')
    for (const t of tiles) expect(tileIdAt(cellOf(t))).toBe(t.id)
  })

  // The reachability invariant: the keyboard cursor can get from every letter to
  // every other.
  it('every letter can reach every other by arrows', () => {
    for (const start of ZTest_cellsOf(BOARD_SHAPE)) {
      expect(ZTest_unreachableFrom(BOARD_SHAPE, start), `from ${start.x},${start.y}`).toEqual([])
    }
  })
})
