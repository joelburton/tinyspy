// cs-unmet

/**
 * `allGreen` is all that is left of this file's frontend coloring, and the only
 * color string waffle still works out for itself.
 *
 * What used to be here — a TypeScript port of `common.wordle_colors` plus
 * waffle's board merge, pinned against the pgTAP oracle by hand-copied vectors
 * — is gone, because `waffle.events` now stores each swap's colors and the
 * history viewer reads them. The vectors stay where they were always the
 * authority: `supabase/tests/waffle/colors_test.sql` and
 * `supabase/tests/wordle/colors_test.sql`.
 */
import { describe, it, expect } from 'vitest'
import { allGreen } from './colors'

// The 21-distinct-letter reference board the SQL tests use, holes at 6/8/16/18.
const SOLUTION = 'abcdef.g.hijklmn.o.pqrstu'

describe('allGreen', () => {
  it('greens every filled cell and leaves the holes alone', () => {
    expect(allGreen(SOLUTION)).toBe(
      Array.from({ length: 25 }, (_, i) => ([6, 8, 16, 18].includes(i) ? '.' : 'g')).join(''),
    )
  })

  it('takes the holes from the board it is given, not from the grid', () => {
    // Not waffle's layout — the point is that nothing here knows the layout.
    expect(allGreen('..abc')).toBe('..ggg')
  })

  it('is the same length as what it colors', () => {
    expect(allGreen(SOLUTION)).toHaveLength(SOLUTION.length)
  })
})
