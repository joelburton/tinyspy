// cs-unmet

import { describe, expect, it } from 'vitest'
import { clampCell, stepCell, type BoardShape } from './stepCell'

// 3 × 3 with the last row short: 7 cells, psychicnum's shape for 7 words.
const shortRow: BoardShape = { cols: 3, rows: 3, exists: (x, y) => y * 3 + x < 7 }
// 5 × 5 with waffle's four holes.
const waffle: BoardShape = { cols: 5, rows: 5, exists: (x, y) => !(x % 2 === 1 && y % 2 === 1) }

describe('stepCell', () => {
  it('moves one cell in the arrow’s direction', () => {
    expect(stepCell({ x: 1, y: 1 }, 'ArrowRight', shortRow)).toEqual({ x: 2, y: 1 })
    expect(stepCell({ x: 1, y: 1 }, 'ArrowLeft', shortRow)).toEqual({ x: 0, y: 1 })
    expect(stepCell({ x: 1, y: 1 }, 'ArrowUp', shortRow)).toEqual({ x: 1, y: 0 })
    expect(stepCell({ x: 0, y: 1 }, 'ArrowDown', shortRow)).toEqual({ x: 0, y: 2 })
  })

  it('stays at the board’s edge', () => {
    expect(stepCell({ x: 0, y: 0 }, 'ArrowLeft', shortRow)).toEqual({ x: 0, y: 0 })
    expect(stepCell({ x: 2, y: 0 }, 'ArrowRight', shortRow)).toEqual({ x: 2, y: 0 })
  })

  it('stays where the last row is short, rather than wandering sideways', () => {
    expect(stepCell({ x: 2, y: 1 }, 'ArrowDown', shortRow)).toEqual({ x: 2, y: 1 })
    expect(stepCell({ x: 0, y: 2 }, 'ArrowRight', shortRow)).toEqual({ x: 0, y: 2 })
  })

  it('passes over a hole to the cell beyond it', () => {
    expect(stepCell({ x: 0, y: 1 }, 'ArrowRight', waffle)).toEqual({ x: 2, y: 1 })
    expect(stepCell({ x: 1, y: 0 }, 'ArrowDown', waffle)).toEqual({ x: 1, y: 2 })
  })
})

describe('clampCell', () => {
  // connections' loose tiles: four across, a row fewer for each solved band.
  const tiles = (rows: number): BoardShape => ({ cols: 4, rows, exists: () => true })

  it('leaves a cell the board still has where it is', () => {
    expect(clampCell({ x: 2, y: 1 }, tiles(4))).toEqual({ x: 2, y: 1 })
  })

  it('pulls a cell off a vanished row onto the last row, same column', () => {
    expect(clampCell({ x: 2, y: 3 }, tiles(2))).toEqual({ x: 2, y: 1 })
  })

  it('falls back along the rows past a cell that does not exist', () => {
    expect(clampCell({ x: 2, y: 2 }, shortRow)).toEqual({ x: 0, y: 2 })
  })

  it('is null on a board with no cells', () => {
    expect(clampCell({ x: 0, y: 0 }, tiles(0))).toBeNull()
  })
})
