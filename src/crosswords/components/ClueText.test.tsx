import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClueText } from './ClueText'

describe('ClueText', () => {
  it('renders <em>…</em> spans as real <em> italics', () => {
    const { container } = render(<ClueText text="Jaunty singer of <em>Heigh-Ho</em>? (5)" />)
    const em = container.querySelector('em')
    expect(em?.textContent).toBe('Heigh-Ho')
    // The surrounding text stays plain, and no literal tags leak through.
    expect(container.textContent).toBe('Jaunty singer of Heigh-Ho? (5)')
  })

  it('handles multiple emphasis runs', () => {
    const { container } = render(<ClueText text="<em>A</em> and <em>B</em> meet" />)
    expect([...container.querySelectorAll('em')].map((e) => e.textContent)).toEqual(['A', 'B'])
    expect(container.textContent).toBe('A and B meet')
  })

  it('leaves plain text and literal underscores (NYT fill-in blanks) untouched', () => {
    const { container } = render(<ClueText text="Plain clue (4)" />)
    expect(container.textContent).toBe('Plain clue (4)')
    expect(container.querySelector('em')).toBeNull()
    // THE FIX: an NYT fill-in like "A_P_E" renders literally, NOT italicized.
    const fill = render(<ClueText text="A_P_E, e.g. (4)" />)
    expect(fill.container.textContent).toBe('A_P_E, e.g. (4)')
    expect(fill.container.querySelector('em')).toBeNull()
  })
})
