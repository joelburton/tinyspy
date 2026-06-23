import { describe, expect, it } from 'vitest'
import { colorRank } from './colors'

// `tileColor` is the shared mapper, tested in common/lib/tileColor.test.ts.
// This file covers only wordle's own color helpers.

describe('colorRank', () => {
  it('orders green > yellow > gray > blank (for the keyboard merge)', () => {
    expect(colorRank('green')).toBeGreaterThan(colorRank('yellow'))
    expect(colorRank('yellow')).toBeGreaterThan(colorRank('gray'))
    expect(colorRank('gray')).toBeGreaterThan(colorRank('blank'))
  })
})
