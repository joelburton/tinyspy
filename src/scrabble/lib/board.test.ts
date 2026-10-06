// cs-unmet

import { describe, expect, it } from 'vitest'
import {
  BOARD_SIZE,
  CENTER,
  PREMIUMS,
  TILE_DISTRIBUTION,
  cellIndex,
  cellValue,
  decodeBoard,
  decodePlacement,
  fullBag,
  makeCellId,
  premiumAt,
  readCellXY,
} from './board'

describe('tile distribution', () => {
  it('is the standard 100-tile English set', () => {
    const total = Object.values(TILE_DISTRIBUTION).reduce((a, b) => a + b, 0)
    expect(total).toBe(100)
    expect(fullBag()).toHaveLength(100)
  })

  it('has 2 blanks', () => {
    expect(TILE_DISTRIBUTION['?']).toBe(2)
  })
})

describe('premium layout', () => {
  it('covers all 225 squares', () => {
    expect(PREMIUMS).toHaveLength(BOARD_SIZE * BOARD_SIZE)
  })

  it('has the standard premium counts', () => {
    const counts = PREMIUMS.reduce<Record<string, number>>((acc, p) => {
      acc[p] = (acc[p] ?? 0) + 1
      return acc
    }, {})
    expect(counts.TW).toBe(8)
    expect(counts.DW).toBe(17) // 16 + the center star
    expect(counts.TL).toBe(12)
    expect(counts.DL).toBe(24)
    expect(counts.none).toBe(225 - 8 - 17 - 12 - 24)
  })

  it('is symmetric under 180° rotation', () => {
    for (let i = 0; i < PREMIUMS.length; i++) {
      expect(PREMIUMS[i]).toBe(PREMIUMS[PREMIUMS.length - 1 - i])
    }
  })

  it('puts a double-word (star) at the center', () => {
    expect(premiumAt(7, 7)).toBe('DW')
    expect(CENTER).toBe(7 * BOARD_SIZE + 7)
  })

  it('puts triple-words in the corners', () => {
    expect(premiumAt(0, 0)).toBe('TW')
    expect(premiumAt(14, 0)).toBe('TW')
    expect(premiumAt(0, 14)).toBe('TW')
    expect(premiumAt(14, 14)).toBe('TW')
  })
})

describe('cellValue', () => {
  it('scores letters by face value', () => {
    expect(cellValue({ letter: 'a', blank: false })).toBe(1)
    expect(cellValue({ letter: 'q', blank: false })).toBe(10)
    expect(cellValue({ letter: 'd', blank: false })).toBe(2)
  })

  it('scores a blank as 0 even though it reads as a letter', () => {
    expect(cellValue({ letter: 'q', blank: true })).toBe(0)
  })
})

describe('the board string', () => {
  // "c" a C tile at (6,7), "A" a blank played as A at (7,7), "t" at (8,7).
  const letters = '.'.repeat(cellIndex(6, 7)) + 'cAt' + '.'.repeat(225 - cellIndex(9, 7))

  it('decodes to 225 cells, row by row, each id its place', () => {
    const cells = decodeBoard(letters)
    expect(cells).toHaveLength(225)
    expect(cells[cellIndex(3, 11)].id).toBe('3,11')
  })

  it('reads "." as an empty cell, lowercase as a tile, uppercase as a blank', () => {
    const cells = decodeBoard(letters)
    expect(cells[cellIndex(0, 0)]).toEqual({ id: '0,0', tile: null })
    expect(cells[cellIndex(6, 7)]).toEqual({ id: '6,7', tile: { id: '6,7', letter: 'c', blank: false } })
    expect(cells[cellIndex(7, 7)]).toEqual({ id: '7,7', tile: { id: '7,7', letter: 'a', blank: true } })
  })

  it('decodes a placement under the same case rule', () => {
    expect(decodePlacement('7,7:c')).toEqual({ id: '7,7', letter: 'c', blank: false })
    expect(decodePlacement('10,3:Q')).toEqual({ id: '10,3', letter: 'q', blank: true })
  })

  it('round-trips a cell between its id and its x and y', () => {
    expect(readCellXY(makeCellId(12, 4))).toEqual({ x: 12, y: 4 })
  })
})
