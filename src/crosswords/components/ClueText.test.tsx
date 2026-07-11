import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClueText } from './ClueText'

describe('ClueText', () => {
  it('renders _emphasis_ markers as real <em> italics', () => {
    const { container } = render(<ClueText text="Jaunty singer of _Heigh-Ho_? (5)" />)
    const em = container.querySelector('em')
    expect(em?.textContent).toBe('Heigh-Ho')
    // The surrounding text stays plain, and no literal underscores leak through.
    expect(container.textContent).toBe('Jaunty singer of Heigh-Ho? (5)')
  })

  it('handles multiple emphasis runs', () => {
    const { container } = render(<ClueText text="_A_ and _B_ meet" />)
    expect([...container.querySelectorAll('em')].map((e) => e.textContent)).toEqual(['A', 'B'])
    expect(container.textContent).toBe('A and B meet')
  })

  it('leaves plain text (and a lone underscore) untouched', () => {
    const { container } = render(<ClueText text="Plain clue (4)" />)
    expect(container.textContent).toBe('Plain clue (4)')
    expect(container.querySelector('em')).toBeNull()
    const lone = render(<ClueText text="a _ b" />)
    expect(lone.container.textContent).toBe('a _ b') // unpaired → literal
    expect(lone.container.querySelector('em')).toBeNull()
  })
})
