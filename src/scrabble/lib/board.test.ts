import { describe, expect, it } from 'vitest'
import {
  BOARD_SIZE,
  CENTER,
  PREMIUMS,
  TILE_DISTRIBUTION,
  cellValue,
  fullBag,
  premiumAt,
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
    expect(cellValue({ l: 'A', b: false })).toBe(1)
    expect(cellValue({ l: 'Q', b: false })).toBe(10)
    expect(cellValue({ l: 'D', b: false })).toBe(2)
  })

  it('scores a blank as 0 even though it reads as a letter', () => {
    expect(cellValue({ l: 'Q', b: true })).toBe(0)
  })
})
