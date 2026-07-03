/**
 * The TS color port pinned against the SQL oracle. Every case here is copied
 * verbatim from the pgTAP `supabase/tests/waffle/colors_test.sql` — same inputs,
 * same expected outputs — so the two implementations can't silently drift. If you
 * change one, change (and re-sync) the other.
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

describe('wordleColors — one word, Wordle-style', () => {
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
