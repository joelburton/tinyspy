import { describe, expect, it } from 'vitest'
import { isPangram } from './pangram'

describe('isPangram', () => {
  it('rejects words with fewer than 7 distinct letters', () => {
    expect(isPangram('bead')).toBe(false)            // 4 distinct
    expect(isPangram('cabbage')).toBe(false)         // 5 distinct (c,a,b,g,e)
    expect(isPangram('banana')).toBe(false)          // 3 distinct
    expect(isPangram('')).toBe(false)
  })

  it('accepts a 7-letter word with 7 distinct letters', () => {
    // 7 distinct: a, b, c, d, e, f, g — the synthetic test pangram.
    expect(isPangram('abcdefg')).toBe(true)
    // Real Spelling-Bee-friendly word using all 7 distinct letters
    // {a, b, c, d, n, o, s} — except 's' is excluded from spellingbee
    // puzzles. Pick a no-s alternative: "outpace" uses {o,u,t,p,a,c,e}.
    expect(isPangram('outpace')).toBe(true)
  })

  it('accepts a long word that uses exactly 7 distinct letters', () => {
    // "abscond" has 7 distinct {a,b,c,d,n,o,s}; using 's' is fine
    // for the pure helper — the puzzle-letter constraint is
    // enforced elsewhere (submit_word). The helper just asks
    // "does this word use 7 distinct letters?"
    expect(isPangram('abscond')).toBe(true)
    // 8-letter word with only 7 distinct letters (one repeats):
    // "campaign" has {c,a,m,p,i,g,n} = 7 distinct. Repeated 'a'
    // doesn't add to the count. Pangram.
    expect(isPangram('campaign')).toBe(true)
  })

  it('rejects words with 8+ distinct letters (out of bounds for a spellingbee puzzle)', () => {
    // 8 distinct: a, b, c, d, e, f, g, h
    expect(isPangram('abcdefgh')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isPangram('ABCDEFG')).toBe(true)
    expect(isPangram('OutPace')).toBe(true)
  })
})
