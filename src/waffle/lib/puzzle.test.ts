import { describe, expect, it } from 'vitest'
import { boardWords, coord, isValidBoard } from './waffle'
import { assembleSolution, maxLetterFrequency, minSwaps } from './puzzle'

describe('coord', () => {
  it('maps positions to spreadsheet-style A1..E5 coordinates', () => {
    expect(coord(0)).toBe('A1') // top-left corner
    expect(coord(4)).toBe('E1') // top-right corner
    expect(coord(12)).toBe('C3') // center
    expect(coord(20)).toBe('A5') // bottom-left corner
    expect(coord(24)).toBe('E5') // bottom-right corner
    expect(coord(7)).toBe('C2') // col 2, row 1
  })
})

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

  it('maximises cycles instead of greedily merging them', () => {
    // 'cab' → 'abc' is one 3-cycle (2 swaps). But duplicate letters let
    // the same edges split into two independent 2-cycles, which a
    // left-to-right greedy misses. Two disjoint transpositions:
    expect(minSwaps('badc', 'abcd')).toBe(2)
    // Real regression: the SyrupSwap board Joel solved in ~6 swaps was
    // mislabelled par 10 by the old greedy. True minimum is 6.
    const scramble = 'rpekse.v.ciruyse.n.esassr'
    const solution = 'reekse.v.icressu.n.sraspy'
    expect(minSwaps(scramble, solution)).toBe(6)
  })

  it('never exceeds an explicit swap sequence (upper bound)', () => {
    // Apply 5 random-ish transpositions to a board; the true minimum
    // can only be ≤ the number of swaps that produced it.
    const sol = 'abcdef.g.hijklmn.o.pqrstu'
    const swaps: [number, number][] = [
      [0, 2],
      [1, 9],
      [3, 14],
      [0, 19],
      [5, 22],
    ]
    const arr = sol.split('')
    for (const [i, j] of swaps) [arr[i], arr[j]] = [arr[j], arr[i]]
    expect(minSwaps(arr.join(''), sol)).toBeLessThanOrEqual(swaps.length)
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
