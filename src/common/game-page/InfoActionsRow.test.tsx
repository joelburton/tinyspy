// cs-unmet

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InfoActionsRow } from './InfoActionsRow'

/**
 * The action row is thin markup, and these lock the contract every InfoCol
 * relies on when it writes one element for all three of its states: the line is
 * optional, its outcome picks the ink, and the buttons are optional too
 * (waffle's "watching" state is a bare line).
 */
describe('InfoActionsRow', () => {
  it('draws the buttons alone when there is no message', () => {
    const { container } = render(
      <InfoActionsRow>
        <button type="button">Concede</button>
      </InfoActionsRow>,
    )
    expect(screen.getByRole('button', { name: 'Concede' })).toBeInTheDocument()
    expect(container.querySelectorAll('span')).toHaveLength(0)
  })

  it('draws the message beside the buttons when given one', () => {
    render(
      <InfoActionsRow message={{ text: 'Waiting for others', outcome: 'neutral' }}>
        <button type="button">Concede</button>
      </InfoActionsRow>,
    )
    expect(screen.getByText('Waiting for others')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Concede' })).toBeInTheDocument()
  })

  it('draws a bare message with no buttons', () => {
    const { container } = render(
      <InfoActionsRow message={{ text: 'Watching — not in this game', outcome: 'neutral' }} />,
    )
    expect(screen.getByText('Watching — not in this game')).toBeInTheDocument()
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('takes its ink from the outcome, for every member the type admits', () => {
    // The class is indexed into, so a member with no rule would render unstyled
    // rather than fail — which is why each is asserted rather than sampled.
    for (const outcome of ['won', 'lost', 'near', 'warning', 'neutral', 'noted'] as const) {
      const { container, unmount } = render(
        <InfoActionsRow message={{ text: outcome, outcome }} />,
      )
      expect(container.querySelector('span')!.className).toContain(`outcome_${outcome}`)
      unmount()
    }
  })
})
