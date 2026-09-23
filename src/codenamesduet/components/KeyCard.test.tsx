// cs-met-codenamesduet

/**
 * KeyCard: a player's dealt key as a 5×5 of key colors, in board order — one
 * cell per label, no words. The color itself is a class (a CSS-module proxy in
 * vitest, so not asserted); the LABEL each cell draws is, through its
 * `data-key-label`.
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { KeyLabel } from '../lib/labels'
import { KeyCard } from './KeyCard'

describe('KeyCard', () => {
  it('draws one cell per label, in board order, and no words', () => {
    const labels: KeyLabel[] = Array.from({ length: 25 }, (_, i) => (i === 0 ? 'A' : i < 10 ? 'G' : 'N'))
    const { container } = render(<KeyCard labels={labels} />)
    const cells = Array.from(container.querySelectorAll('[data-key-label]'))
    expect(cells).toHaveLength(25)
    expect(cells.map((c) => c.getAttribute('data-key-label'))).toEqual(labels)
    expect(container.textContent).toBe('')
  })
})
