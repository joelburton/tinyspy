import { describe, expect, it } from 'vitest'
import { DICE_BY_NAME, DICE_SETS, boardToDisplay, faceToDisplay } from './dice'

describe('boggle dice sets', () => {
  it('every set has n² dice of 6 valid faces each', () => {
    for (const set of DICE_SETS) {
      expect(set.dice.length, set.name).toBe(set.n * set.n)
      for (const die of set.dice) {
        expect(die.length, `${set.name} die "${die}"`).toBe(6)
        expect(die, `${set.name} die "${die}"`).toMatch(/^[A-Z0-6]{6}$/)
      }
    }
  })

  it('has the eight expected sets, looked up by name', () => {
    expect(DICE_SETS.map((s) => s.name)).toEqual([
      '4-classic', '4', '5-orig', '5-challenge', '5-big-deluxe', '5', '6-super', '6',
    ])
    expect(DICE_BY_NAME['4'].desc).toBe('4×4 Revised')
    expect(DICE_BY_NAME['6'].n).toBe(6)
  })

  it('maps faces to display text (multiface + blank)', () => {
    expect(faceToDisplay('A')).toBe('A')
    expect(faceToDisplay('1')).toBe('Qu')
    expect(faceToDisplay('6')).toBe('An')
    expect(faceToDisplay('0')).toBe('·')
  })

  it('renders a board into an n×n display grid', () => {
    const grid = boardToDisplay('AB1D', 2) // 2×2; cell 2 is a Qu tile
    expect(grid).toEqual([['A', 'B'], ['Qu', 'D']])
  })
})
