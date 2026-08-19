import { describe, expect, it } from 'vitest'
import { colorRank } from './colors'

// `tileColor` is the shared mapper, tested in common/lib/color/tileColor.test.ts.
// This file covers only wordle's own color helpers.

describe('colorRank', () => {
  it('orders green > yellow > gray > blank (for the keyboard merge)', () => {
    expect(colorRank('wordleGreen')).toBeGreaterThan(colorRank('wordleYellow'))
    expect(colorRank('wordleYellow')).toBeGreaterThan(colorRank('wordleGray'))
    expect(colorRank('wordleGray')).toBeGreaterThan(colorRank('blank'))
  })
})
