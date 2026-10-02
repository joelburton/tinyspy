// cs-blessed-wordle

import { describe, expect, it } from 'vitest'
import { colorRank, makeKeyColors } from './colors'

// `getTileColor` is the shared mapper, tested in
// shared/wordle-style/tileColor.test.ts. This file covers only wordle's own
// color helpers.

describe('colorRank', () => {
  it('orders green > yellow > gray > blank (for the keyboard merge)', () => {
    expect(colorRank('wordleGreen')).toBeGreaterThan(colorRank('wordleYellow'))
    expect(colorRank('wordleYellow')).toBeGreaterThan(colorRank('wordleGray'))
    expect(colorRank('wordleGray')).toBeGreaterThan(colorRank('blank'))
  })
})

describe('makeKeyColors', () => {
  it('gives each letter the strongest color it has earned across the rows', () => {
    const keyColors = makeKeyColors([
      { word: 'slate', colors: 'xyxxx' }, // l yellow
      { word: 'blink', colors: 'xgxxx' }, // l green: beats the yellow
      { word: 'lucky', colors: 'xxxxx' }, // l gray: does not undo the green
    ])
    expect(keyColors.get('l')).toBe('wordleGreen')
    expect(keyColors.get('s')).toBe('wordleGray')
  })

  it('leaves a letter never guessed out, so its key stays neutral', () => {
    expect(makeKeyColors([{ word: 'slate', colors: 'xxxxx' }]).has('q')).toBe(false)
    expect(makeKeyColors([]).size).toBe(0)
  })
})
