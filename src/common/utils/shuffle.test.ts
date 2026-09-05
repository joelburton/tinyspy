// cs-met-utils

import { describe, expect, it } from 'vitest'
import { mulberry32 } from './mulberry32'
import { shuffle } from './shuffle'

/**
 * The three things a caller of `shuffle` is promised: the result is a
 * permutation of the input, the input itself is untouched, and a seeded `rng`
 * makes the order repeat.
 *
 * Which order a given seed produces is NOT asserted — that would pin
 * `mulberry32`'s stream and the loop's draw order together, so improving
 * either would break a test nothing reads. Distribution is not asserted
 * either: no caller relies on a shuffle being uniform to more than the eye,
 * and the argument for the loop shape lives in the module's docstring.
 */

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

describe('shuffle', () => {
  it('returns a permutation and leaves the input alone', () => {
    const input = [...LETTERS]
    const out = shuffle(input)
    expect([...out].sort()).toEqual([...LETTERS].sort())
    expect(input).toEqual(LETTERS)
    expect(out).not.toBe(input)
  })

  it('repeats the order for a seeded rng, and varies across seeds', () => {
    const a = shuffle(LETTERS, mulberry32(7))
    const b = shuffle(LETTERS, mulberry32(7))
    const c = shuffle(LETTERS, mulberry32(8))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('does move things, given the default rng', () => {
    // Not a distribution test — just that the loop runs. Across 20 shuffles of
    // eight items, every one landing back in its original order would be a
    // 1-in-40320^20 coincidence, so a failure here means the swap is dead.
    const shuffles = Array.from({ length: 20 }, () => shuffle(LETTERS))
    expect(shuffles.some((out) => !out.every((x, i) => x === LETTERS[i]))).toBe(
      true,
    )
  })

  it('handles the arrays too short to shuffle', () => {
    // The loop body never runs for these, so the copy is the whole behavior.
    expect(shuffle([])).toEqual([])
    expect(shuffle(['only'])).toEqual(['only'])
  })
})
