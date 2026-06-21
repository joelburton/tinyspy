import { describe, expect, it } from 'vitest'
import { boardWords, isValidBoard } from './waffle'
import { assembleSolution, maxLetterFrequency, minSwaps } from './puzzle'

describe('assembleSolution', () => {
  it('places the 6 words into a valid board and round-trips', () => {
    // A consistent waffle (distinct letters a..u), same as the
    // colors_test reference solution.
    const words = ['abcde', 'ijklm', 'qrstu', 'afinq', 'cgkos', 'ehmpu']
    const solution = assembleSolution(words)
    expect(solution).toBe('abcdef.g.hijklmn.o.pqrstu')
    expect(isValidBoard(solution)).toBe(true)
    expect(boardWords(solution)).toEqual(words)
  })
})

describe('minSwaps (par)', () => {
  it('is 0 for an already-solved board', () => {
    const s = 'abcdef.g.hijklmn.o.pqrstu'
    expect(minSwaps(s, s)).toBe(0)
  })

  it('counts a single transposition', () => {
    expect(minSwaps('ba', 'ab')).toBe(1)
  })

  it('solves a 3-cycle in 2 swaps', () => {
    expect(minSwaps('bca', 'abc')).toBe(2)
  })

  it('handles duplicate letters optimally', () => {
    expect(minSwaps('aabb', 'bbaa')).toBe(2)
    expect(minSwaps('aab', 'aba')).toBe(1)
  })

  it('ignores holes (they match) on a full 25-char board', () => {
    const sol = 'abcdef.g.hijklmn.o.pqrstu'
    // swap cells 0 and 1 — one transposition, holes untouched.
    const scr = 'bacdef.g.hijklmn.o.pqrstu'
    expect(minSwaps(scr, sol)).toBe(1)
  })
})

describe('maxLetterFrequency', () => {
  it('counts the most-repeated letter across filled cells only', () => {
    // all distinct → 1
    expect(maxLetterFrequency('abcdef.g.hijklmn.o.pqrstu')).toBe(1)
    // make three cells 'a' (positions 1, 2 in addition to 0)
    expect(maxLetterFrequency('aaadef.g.hijklmn.o.pqrstu')).toBe(3)
  })
})
