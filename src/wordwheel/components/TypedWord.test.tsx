// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { TypedWord } from './TypedWord'

/** The 9 wheel letters for these cases (center + 8 outer), lower-cased. */
const allowed = new Set(['e', 'a', 'b', 'c', 'd', 'f', 'g', 'h', 'i'])

/** A span is "dimmed" (illegal) iff it carries a (hashed) CSS-module class; a
 *  legal character renders with an empty className. */
function dimFlags(word: string): boolean[] {
  const { container } = render(<TypedWord word={word} allowedLetters={allowed} />)
  return Array.from(container.querySelectorAll('span')).map((s) => s.className !== '')
}

describe('TypedWord dimming', () => {
  it('dims a letter that is not on the wheel', () => {
    // 't' is off the wheel → dimmed; the rest are legal.
    expect(dimFlags('BEAT')).toEqual([false, false, false, true])
  })

  it('dims a REPEATED letter from its second use on (used-once rule)', () => {
    // 'BEE': first E legal, second E dimmed (each tile used once).
    expect(dimFlags('BEE')).toEqual([false, false, true])
    // 'ABIDE' — all distinct, all on the wheel → none dimmed.
    expect(dimFlags('ABIDE')).toEqual([false, false, false, false, false])
  })

  it('dims the third occurrence too, and treats off-wheel + repeat the same', () => {
    // 'BEEF': B ok, E ok, E repeat (dim), F ok.
    expect(dimFlags('BEEF')).toEqual([false, false, true, false])
    // 'EEE': first ok, next two are repeats.
    expect(dimFlags('EEE')).toEqual([false, true, true])
  })
})
