// cs-audited-definitions

/**
 * Tests for the click-to-define word. What's pinned here is the contract every
 * surface now inherits by using it: the shared class, the `data-word` handle,
 * the native title, pointer-only (no role, no tab stop), and that a click puts
 * the word in the store the root's `<DefinitionHost>` reads.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { DefinableWord } from './DefinableWord'
import { closeDefinition } from './definitionStore'
import { DefinitionHost } from './DefinitionHost'

afterEach(() => closeDefinition())

describe('DefinableWord', () => {
  it('shows the word in caps and looks it up in lowercase', () => {
    render(<DefinableWord word="Acre" />)
    const el = screen.getByText('ACRE')
    expect(el).toHaveAttribute('data-word', 'acre')
  })

  it('wears the shared class, and composes the surface’s own', () => {
    // Any real class will do — a surface passes its own module's.
    render(<DefinableWord word="acre" className="muted" />)
    expect(screen.getByText('ACRE')).toHaveClass('definable', 'muted')
  })

  it('carries the native title, the same words everywhere', () => {
    render(<DefinableWord word="acre" />)
    expect(screen.getByText('ACRE')).toHaveAttribute('title', 'Click to define')
  })

  it('is pointer-only: a span, with no role and no tab stop', () => {
    render(<DefinableWord word="acre" />)
    const el = screen.getByText('ACRE')
    expect(el.tagName).toBe('SPAN')
    expect(el).not.toHaveAttribute('role')
    expect(el).not.toHaveAttribute('tabindex')
  })

  it('renders children instead of the word when given them', () => {
    // wordle's guess is five colored squares, not text.
    render(
      <DefinableWord word="acres">
        <b>squares</b>
      </DefinableWord>,
    )
    expect(screen.getByText('squares')).toBeInTheDocument()
    expect(screen.queryByText('ACRES')).not.toBeInTheDocument()
  })

  it('opens the root host’s card on click — nothing wired at the surface', async () => {
    const user = userEvent.setup()
    // The word and the host are siblings, as they are in the app: the surface
    // renders no popover of its own.
    render(
      <>
        <DefinableWord word="acre" />
        <DefinitionHost />
      </>,
    )
    expect(screen.queryByRole('dialog', { name: 'Definition' })).toBeNull()
    await user.click(screen.getByText('ACRE'))
    expect(screen.getByRole('dialog', { name: 'Definition' })).toBeInTheDocument()
  })
})
