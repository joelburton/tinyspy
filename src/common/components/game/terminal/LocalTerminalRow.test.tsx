import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LocalTerminalRow } from './LocalTerminalRow'

/**
 * The locally-terminal action row is a thin markup component (the neutral-toned twin
 * of <TerminalActionRow>); these lock the contract every InfoCol relies on when it
 * swaps its hand-rolled `<div><span/>{button}</div>` for this: the neutral status
 * label renders, and the trailing action is optional (waffle's "watching" state).
 */
describe('LocalTerminalRow', () => {
  it('renders the status label', () => {
    render(<LocalTerminalRow label="You conceded" />)
    expect(screen.getByText('You conceded')).toBeInTheDocument()
  })

  it('renders a trailing action when given one', () => {
    render(
      <LocalTerminalRow label="Waiting for others">
        <button type="button">Concede</button>
      </LocalTerminalRow>,
    )
    expect(screen.getByText('Waiting for others')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Concede' })).toBeInTheDocument()
  })

  it('renders a bare status line with no trailing action', () => {
    const { container } = render(<LocalTerminalRow label="Watching — not in this game" />)
    expect(screen.getByText('Watching — not in this game')).toBeInTheDocument()
    // No button in the "watching" state — just the status span.
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})
