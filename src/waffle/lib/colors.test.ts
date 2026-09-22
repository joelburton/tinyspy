// cs-unmet

/**
 * The TS color port pinned against the SQL oracle. Every case here is copied
 * verbatim from pgTAP — same inputs, same expected outputs — so the two
 * implementations can't silently drift. If you change one, change (and re-sync)
 * the other.
 *
 * **The oracle is TWO files**, because `common.wordle_colors` is shared and
 * each caller pins it: `supabase/tests/waffle/colors_test.sql` and
 * `supabase/tests/wordle/colors_test.sql`. Both are copied below, under
 * headings that say which. For a while only waffle's were, and the cases the
 * wordle file holds alone went unpinned here — including the one covering this
 * port's `toLowerCase`, which could be deleted with every test still passing.
 *
 * The reference solution has 21 distinct letters (a..u), holes at 0-based 6,8,16,18:
 *   row0 abcde  row1 f.g.h  row2 ijklm  row3 n.o.p  row4 qrstu
 *   solution = 'abcdef.g.hijklmn.o.pqrstu'
 */
import { describe, it, expect } from 'vitest'
import { wordleColors, computeColors } from './colors'

const SOLUTION = 'abcdef.g.hijklmn.o.pqrstu'
const HOLES = [6, 8, 16, 18]

/** Build the expected 25-char color string: holes '.', listed cells overridden. */
function expected(overrides: Record<number, string>, fill = 'g'): string {
  return Array.from({ length: 25 }, (_, i) =>
    HOLES.includes(i) ? '.' : overrides[i] ?? fill,
  ).join('')
}

describe('wordleColors — the waffle oracle', () => {
  it('all correct → all green', () => {
    expect(wordleColors('abcde', 'abcde')).toBe('ggggg')
  })
  it('no shared letters → all gray', () => {
    expect(wordleColors('fghij', 'abcde')).toBe('xxxxx')
  })
  it('two adjacent letters swapped → two yellows, rest green', () => {
    expect(wordleColors('bacde', 'abcde')).toBe('yyggg')
  })
  it('fully reversed (one fixed point) → green middle, yellows around', () => {
    expect(wordleColors('edcba', 'abcde')).toBe('yygyy')
  })
  it('duplicate guess letters only claim as many yellows as the answer has', () => {
    expect(wordleColors('aabbb', 'abxyz')).toBe('gxyxx')
  })
})

/**
 * The same function's other caller pins it with its own words, on inputs that
 * share nothing with the five above. Copied verbatim from
 * `supabase/tests/wordle/colors_test.sql`, labels included, so a reader can put
 * the two files side by side.
 */
describe('wordleColors — the wordle oracle', () => {
  it('exact match → all green', () => {
    expect(wordleColors('crate', 'crate')).toBe('ggggg')
  })
  it('one wrong letter → gray in place', () => {
    expect(wordleColors('crane', 'crate')).toBe('gggxg')
  })
  it('yellows pulled from the leftover pool, gray where absent', () => {
    expect(wordleColors('speed', 'erase')).toBe('yxyyx')
  })
  it('duplicate letters: only as many yellows as the answer has copies', () => {
    expect(wordleColors('allee', 'apple')).toBe('gyxxg')
  })
  it('no shared letters → all gray', () => {
    expect(wordleColors('zzzzz', 'crate')).toBe('xxxxx')
  })
  it('greens consume their answer letter first', () => {
    expect(wordleColors('eerie', 'three')).toBe('yxgxg')
  })
  it('wordle_colors lowercases its inputs', () => {
    // The case that went unpinned here. waffle cannot reach it today — boards
    // and solutions come out of the database lowercase — but it is a line of
    // this port, and the SQL it mirrors is asserted on it.
    expect(wordleColors('CRATE', 'crate')).toBe('ggggg')
  })
})

describe('computeColors — whole board with the intersection merge', () => {
  it('solved board → all filled cells green, holes preserved', () => {
    expect(computeColors(SOLUTION, SOLUTION)).toBe(expected({}))
  })

  it('one-word swap → swapped cells yellow (intersection keeps the stronger color)', () => {
    // Cells 0,1 swapped: yellow in a0; cell 0 is also in d0 where 'b' is gray →
    // yellow wins (stronger). Everything else green.
    expect(computeColors('bacdef.g.hijklmn.o.pqrstu', SOLUTION)).toBe(
      expected({ 0: 'y', 1: 'y' }),
    )
  })

  it('a letter in neither of an intersection’s words → gray in the merge', () => {
    // 'z' at center cell 12 (in a2 and d2): gray + gray → gray.
    expect(computeColors('abcdef.g.hijzlmn.o.pqrstu', SOLUTION)[12]).toBe('x')
  })

  it('hole cells are never colored', () => {
    const colors = computeColors('bacdef.g.hijklmn.o.pqrstu', SOLUTION)
    expect(HOLES.map((p) => colors[p]).join('')).toBe('....')
  })

  it('returns a 25-char string', () => {
    expect(computeColors('bacdef.g.hijklmn.o.pqrstu', SOLUTION)).toHaveLength(25)
  })
})
