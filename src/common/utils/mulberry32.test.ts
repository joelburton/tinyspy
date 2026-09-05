// cs-met-utils

import { describe, expect, it } from 'vitest'
import { mulberry32 } from './mulberry32'

/**
 * Everything a caller of `mulberry32` is promised, asserted: the same seed
 * gives the same sequence, different seeds give different ones, and every draw
 * is a float in `[0, 1)`.
 *
 * That is the whole contract rather than a sample of it — reproducibility is
 * the only reason to reach for this over `Math.random()` (see the module's
 * docstring). Statistical quality is deliberately NOT asserted: nothing here
 * relies on it, so a distribution test would pin a property no caller reads.
 */

describe('mulberry32', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    // `Array.from` calls the generator once per slot, so each of these is five
    // successive draws from one stream rather than five fresh ones.
    const a = Array.from({ length: 5 }, mulberry32(1))
    const b = Array.from({ length: 5 }, mulberry32(1))
    const c = Array.from({ length: 5 }, mulberry32(2))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(a.every((x) => x >= 0 && x < 1)).toBe(true)
  })

  it('reproduces a long sequence, not just its first few draws', () => {
    // Five draws can agree by luck; a board roll or a self-played game pulls
    // thousands, and it is the whole run that has to repeat.
    const a = Array.from({ length: 2000 }, mulberry32(20260811))
    const b = Array.from({ length: 2000 }, mulberry32(20260811))
    expect(a).toEqual(b)
  })

  it('stays in [0, 1) across a long run', () => {
    const rand = mulberry32(42)
    let min = 1
    let max = 0
    for (let i = 0; i < 100_000; i++) {
      const v = rand()
      if (v < min) min = v
      if (v > max) max = v
    }
    expect(min).toBeGreaterThanOrEqual(0)
    expect(max).toBeLessThan(1)
  })

  it('normalizes any seed a caller can produce', () => {
    // Callers derive seeds by arithmetic, and not all of it stays inside int32:
    // scrabble's self-play loop seeds each turn with
    // `(bagSeed ^ 0x9e3779b9) + turns * 0x85ebca6b` (policy.ts), which for any
    // real turn count is a double well past 2³². (The scrabble AI edge function
    // normalizes its own seed with `>>> 0` before calling; this test is for the
    // callers that don't.) Every one of these must give a usable stream rather
    // than NaN.
    for (const seed of [0, -1, -42, 2 ** 31, 2 ** 32, 2 ** 32 + 7, 12345.7]) {
      const v = mulberry32(seed)()
      expect(Number.isFinite(v), `seed ${seed}`).toBe(true)
      expect(v >= 0 && v < 1, `seed ${seed}`).toBe(true)
    }
  })

  it('treats seeds that differ only above bit 32 as the same seed', () => {
    // A 32-bit generator: the seed is `seed >>> 0`, so bits above 32 are
    // discarded and two seeds differing only up there are ONE seed. Pinned
    // because callers derive seeds by arithmetic that overflows int32 (above),
    // which makes "who survives the truncation" part of the contract.
    expect(Array.from({ length: 3 }, mulberry32(7))).toEqual(
      Array.from({ length: 3 }, mulberry32(7 + 2 ** 32)),
    )
  })
})
