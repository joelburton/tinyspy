import { describe, expect, it } from 'vitest'
import { isSubsetMask, letterMask, popcount26 } from './letterMask'

describe('letterMask', () => {
  it('returns 0 for an empty string', () => {
    expect(letterMask('')).toBe(0)
  })

  it("returns 1 for 'a' — bit 0 only", () => {
    expect(letterMask('a')).toBe(1)
  })

  it("returns (1 << 25) for 'z' — bit 25", () => {
    expect(letterMask('z')).toBe(1 << 25)
  })

  it('ORs bits for every letter — repeats collapse', () => {
    // bead = b(1), e(4), a(0), d(3) → mask = 0b11011 = 27
    expect(letterMask('bead')).toBe(0b11011)
    // banana repeats — final mask is still {a, b, n} = bits 0, 1, 13
    expect(letterMask('banana')).toBe((1 << 0) | (1 << 1) | (1 << 13))
  })

  it('is case-insensitive', () => {
    expect(letterMask('BEAD')).toBe(letterMask('bead'))
    expect(letterMask('Bead')).toBe(letterMask('bead'))
  })

  it('ignores non-letter characters', () => {
    expect(letterMask('a-b')).toBe(letterMask('ab'))
    expect(letterMask('!')).toBe(0)
    // Digits map to negative indices in the helper's check and
    // are dropped.
    expect(letterMask('a1b')).toBe(letterMask('ab'))
  })
})

describe('popcount26', () => {
  it('counts zero bits as 0', () => {
    expect(popcount26(0)).toBe(0)
  })

  it('counts single bits as 1', () => {
    for (let i = 0; i < 26; i++) {
      expect(popcount26(1 << i)).toBe(1)
    }
  })

  it('counts arbitrary bit patterns', () => {
    expect(popcount26(0b11011)).toBe(4)              // bead
    expect(popcount26((1 << 25) | (1 << 0))).toBe(2) // a + z
  })

  it('counts a 7-bit mask as 7 (the pangram case)', () => {
    // 7 distinct letters {a, b, c, d, e, f, g}
    const mask = letterMask('abcdefg')
    expect(popcount26(mask)).toBe(7)
  })
})

describe('isSubsetMask', () => {
  it('every word is a subset of itself', () => {
    const m = letterMask('cabbage')
    expect(isSubsetMask(m, m)).toBe(true)
  })

  it('empty word (mask 0) is a subset of anything, including itself', () => {
    expect(isSubsetMask(0, 0)).toBe(true)
    expect(isSubsetMask(0, letterMask('hello'))).toBe(true)
  })

  it('rejects a word using a letter outside the puzzle', () => {
    // puzzle = {a,b,c,d,e,f,g}; word "help" uses h, l, p
    const puzzle = letterMask('abcdefg')
    expect(isSubsetMask(letterMask('help'), puzzle)).toBe(false)
  })

  it('accepts a word using only puzzle letters (repeats OK)', () => {
    const puzzle = letterMask('abcdefg')
    expect(isSubsetMask(letterMask('cabbage'), puzzle)).toBe(true)
    expect(isSubsetMask(letterMask('beef'), puzzle)).toBe(true)
  })

  it('rejects a word using a letter just one bit off', () => {
    // puzzle missing 'h'; word uses 'h'
    const puzzle = letterMask('abcdefg')
    expect(isSubsetMask(letterMask('beach'), puzzle)).toBe(false)
  })
})
