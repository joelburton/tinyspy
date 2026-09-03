// cs-unmet

import { describe, expect, it } from 'vitest'
import { mulberry32 } from './mulberry32'

/**
 * The shared PRNG had no test of its own until `utils` was audited: the only
 * assertions about a mulberry32 lived in `src/boggle/lib/generate.test.ts` and
 * covered boggle's private copy, which this module has since absorbed. So the
 * function three kinds of caller depend on was the untested one, and the
 * property that makes it worth sharing — same seed, same sequence — was pinned
 * only on the copy we deleted.
 *
 * What's asserted here is exactly what the docstring promises a caller, since
 * that is the whole contract: determinism, independence across seeds, and the
 * `Math.random` range. Statistical quality is deliberately NOT tested — it is
 * not why we use this (see the module docstring), so a distribution assertion
 * would pin a property no caller relies on.
 */

describe('mulberry32', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    // Relocated from boggle's generate.test.ts, which owned it before the
    // duplicate was removed.
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
    // Callers derive seeds by arithmetic that overflows int32 on purpose —
    // scrabble's AI seeds with `(version * 31 + seat) ^ 0x9e3779b9`, and the
    // self-play loop with `bagSeed + turns * 0x85ebca6b`. Every one of these
    // must give a usable stream rather than NaN.
    for (const seed of [0, -1, -42, 2 ** 31, 2 ** 32, 2 ** 32 + 7, 12345.7]) {
      const v = mulberry32(seed)()
      expect(Number.isFinite(v), `seed ${seed}`).toBe(true)
      expect(v >= 0 && v < 1, `seed ${seed}`).toBe(true)
    }
  })

  it('treats seeds that differ only above bit 32 as the same seed', () => {
    // A 32-bit generator, so `>>> 0` is the seed. Worth pinning because it is
    // the difference between the two spellings this module absorbed — the
    // stackdown script normalized with `|= 0` inside the closure instead — and
    // the migration was only safe because the two agree.
    expect(Array.from({ length: 3 }, mulberry32(7))).toEqual(
      Array.from({ length: 3 }, mulberry32(7 + 2 ** 32)),
    )
  })
})
