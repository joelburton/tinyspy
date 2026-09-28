// cs-unmet

import { describe, expect, it } from 'vitest'
import { cellAt } from '@/common/board-cursor/boardPosition'
import { cellsOf, unreachableFrom } from '@/common/board-cursor/reachability.fixture'
import { stepCell } from '@/common/board-cursor/stepCell'
import { BOARD_SHAPE } from './boardShape'
import { GRID } from './waffle'

const cell = (position: number) => cellAt(position, GRID)

describe('BOARD_SHAPE', () => {
  it('is five by five with the four holes missing — 21 tiles', () => {
    expect([BOARD_SHAPE.cols, BOARD_SHAPE.rows]).toEqual([5, 5])
    expect(cellsOf(BOARD_SHAPE)).toHaveLength(21)
    for (const hole of [6, 8, 16, 18]) {
      const { x, y } = cell(hole)
      expect(BOARD_SHAPE.exists(x, y)).toBe(false)
    }
  })

  // A hole is passed over, not stopped at: from beside it, the arrow lands on
  // the tile beyond.
  it('an arrow jumps a hole', () => {
    expect(stepCell(cell(5), 'ArrowRight', BOARD_SHAPE)).toEqual(cell(7))
    expect(stepCell(cell(1), 'ArrowDown', BOARD_SHAPE)).toEqual(cell(11))
  })

  // The reachability invariant: the keyboard cursor can get from every tile to
  // every other, the holes notwithstanding.
  it('every tile can reach every other by arrows', () => {
    for (const start of cellsOf(BOARD_SHAPE)) {
      expect(unreachableFrom(BOARD_SHAPE, start), `from ${start.x},${start.y}`).toEqual([])
    }
  })
})
