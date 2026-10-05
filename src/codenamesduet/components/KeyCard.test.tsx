// cs-blessed-codenamesduet

/**
 * KeyCard: a player's dealt key as a 5×5 of key colors, in board order — one
 * cell per key, no words. The color itself is a class (a CSS-module proxy in
 * vitest, so not asserted); the KEY each cell draws is, through its
 * `data-key`.
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { GKey } from '../types'
import { KeyCard } from './KeyCard'

describe('KeyCard', () => {
  it('draws one cell per key, in board order, and no words', () => {
    const keys: GKey[] = Array.from({ length: 25 }, (_, i) => (i === 0 ? 'A' : i < 10 ? 'G' : 'N'))
    const { container } = render(<KeyCard keys={keys} />)
    const cells = Array.from(container.querySelectorAll('[data-key]'))
    expect(cells).toHaveLength(25)
    expect(cells.map((c) => c.getAttribute('data-key'))).toEqual(keys)
    expect(container.textContent).toBe('')
  })
})
