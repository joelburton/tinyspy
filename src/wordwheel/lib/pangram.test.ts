import { describe, expect, it } from 'vitest'
import { isPangram } from './pangram'

describe('isPangram', () => {
  it('rejects words with fewer than 9 distinct letters', () => {
    expect(isPangram('bead')).toBe(false) // 4 distinct
    expect(isPangram('cabbage')).toBe(false) // 5 distinct (c,a,b,g,e)
    expect(isPangram('banana')).toBe(false) // 3 distinct
    expect(isPangram('')).toBe(false)
  })

  it('accepts a 9-letter word with 9 distinct letters', () => {
    // 9 distinct: a..i — the synthetic test pangram.
    expect(isPangram('abcdefghi')).toBe(true)
    // Real 9-letter isograms using all nine letters exactly once.
    expect(isPangram('duplicate')).toBe(true) // d,u,p,l,i,c,a,t,e
    expect(isPangram('chalkdust')).toBe(true) // c,h,a,l,k,d,u,s,t (note: 's' is fine)
  })

  it('accepts a longer word that uses exactly 9 distinct letters', () => {
    // The helper only asks "does this word use 9 distinct letters?" — a repeat
    // doesn't add to the count. (The each-tile-once rule is enforced elsewhere,
    // by the shipped-list membership check; this helper is a pure UI cue.)
    // "chatterbox" = {c,h,a,t,e,r,b,o,x} = 9 distinct, with a repeated 't'.
    expect(isPangram('chatterbox')).toBe(true)
  })

  it('rejects words with 10+ distinct letters (out of bounds for a wordwheel puzzle)', () => {
    // "background" = {b,a,c,k,g,r,o,u,n,d} = 10 distinct.
    expect(isPangram('background')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isPangram('ABCDEFGHI')).toBe(true)
    expect(isPangram('DupliCate')).toBe(true)
  })
})
