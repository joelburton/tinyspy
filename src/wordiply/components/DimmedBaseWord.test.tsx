// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { DimmedBaseWord } from './DimmedBaseWord'

/** The dimmed base is the inner span (CSS-module class); its text is what's
 *  dimmed. Returns the dimmed text, or null when nothing is dimmed. */
function dimmed(word: string, base: string): string | null {
  const { container } = render(<DimmedBaseWord word={word} base={base} />)
  const spans = Array.from(container.querySelectorAll('span'))
  // The outer .word span wraps everything; a dimmed base is a NESTED span.
  const inner = spans.filter((s) => s.querySelector('span') === null && s.parentElement?.tagName === 'SPAN')
  const baseSpan = inner.find((s) => s !== container.firstChild)
  return baseSpan ? baseSpan.textContent : null
}

describe('DimmedBaseWord', () => {
  it('dims the base at its first occurrence (uppercased)', () => {
    expect(dimmed('party', 'part')).toBe('PART')
    expect(dimmed('depart', 'part')).toBe('PART')
  })

  it('dims ONLY the first occurrence when the base repeats', () => {
    // base 'ana' in 'banana' → B[ANA]NA — only the first ANA is dimmed.
    const { container } = render(<DimmedBaseWord word="banana" base="ana" />)
    const nested = Array.from(container.querySelectorAll('span span'))
    expect(nested).toHaveLength(1)
    expect(nested[0].textContent).toBe('ANA')
    // Whole word still reads correctly.
    expect(container.textContent).toBe('BANANA')
  })

  it('dims nothing when the base does not (yet) appear', () => {
    // Still typing the opening letters — 'pa' doesn't contain 'part'.
    expect(dimmed('pa', 'part')).toBeNull()
    const { container } = render(<DimmedBaseWord word="pa" base="part" />)
    expect(container.querySelectorAll('span span')).toHaveLength(0)
    expect(container.textContent).toBe('PA')
  })
})
