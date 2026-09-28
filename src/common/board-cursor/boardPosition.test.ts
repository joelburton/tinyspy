// cs-unmet

import { describe, expect, it } from 'vitest'
import { cellAt, positionAt } from './boardPosition'

describe('positionAt / cellAt', () => {
  it('counts row by row', () => {
    expect(positionAt(2, 1, 5)).toBe(7)
    expect(cellAt(7, 5)).toEqual({ x: 2, y: 1 })
    expect(cellAt(7, 4)).toEqual({ x: 3, y: 1 })
  })

  it('round-trips every position of a board', () => {
    for (let p = 0; p < 20; p++) {
      const { x, y } = cellAt(p, 4)
      expect(positionAt(x, y, 4)).toBe(p)
    }
  })
})
