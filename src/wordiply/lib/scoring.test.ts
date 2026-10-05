// cs-unmet

import { describe, expect, it } from 'vitest'
import { computeLengthScore } from './scoring'

describe('computeLengthScore', () => {
  it('is round(100 * longest / maxLen)', () => {
    expect(computeLengthScore(7, 9)).toBe(78) // 77.78 → 78
    expect(computeLengthScore(6, 9)).toBe(67)
  })
  it('is 100 at (or above) the max, clamped', () => {
    expect(computeLengthScore(9, 9)).toBe(100)
    expect(computeLengthScore(12, 10)).toBe(100) // clamp — a longer-than-possible guess
  })
  it('is 0 when there are no guesses or a degenerate board', () => {
    expect(computeLengthScore(0, 9)).toBe(0)
    expect(computeLengthScore(5, 0)).toBe(0)
  })
})
