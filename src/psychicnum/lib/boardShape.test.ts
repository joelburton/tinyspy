// cs-unmet

import { describe, expect, it } from 'vitest'
import { cellsOf, unreachableFrom } from '@/common/board-cursor/reachability.fixture'
import { boardShape } from './boardShape'

// Every board size setup allows: 5..20 words.
const SIZES = Array.from({ length: 16 }, (_, i) => i + 5)

describe('boardShape', () => {
  it('has a cell for every word and none beyond', () => {
    for (const n of SIZES) expect(cellsOf(boardShape(n))).toHaveLength(n)
  })

  it('lays 7 words out 3 across, with one on the last row', () => {
    const shape = boardShape(7)
    expect([shape.cols, shape.rows]).toEqual([3, 3])
    expect(shape.exists(0, 2)).toBe(true)
    expect(shape.exists(1, 2)).toBe(false)
  })

  // The reachability invariant: the keyboard cursor can get from every tile to
  // every other, whatever the short last row leaves out.
  it('every tile can reach every other by arrows, at every size', () => {
    for (const n of SIZES) {
      const shape = boardShape(n)
      for (const start of cellsOf(shape)) {
        expect(unreachableFrom(shape, start), `${n} words, from ${start.x},${start.y}`).toEqual([])
      }
    }
  })
})
