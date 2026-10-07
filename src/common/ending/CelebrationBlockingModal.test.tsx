// cs-blessed-terminal

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CelebrationBlockingModal } from './CelebrationBlockingModal'

/**
 * The dialog is presentational, and the Esc that dismisses it belongs to the
 * shared panel registry rather than to this component — which is why the test
 * presses the key for real instead of asserting a handler. Sound stays off
 * (jsdom has no media playback). These lock what a game relies on: the title and
 * body render, a game that gives no body gets no sub-line, and Esc and the
 * close button dismiss.
 */
describe('CelebrationBlockingModal', () => {
  it('renders the title alone when no body is given', () => {
    const { container } = render(<CelebrationBlockingModal title="You win! 🎉" onClose={() => {}} playSound={false} />)
    expect(screen.getByText('You win! 🎉')).toBeInTheDocument()
    // Not an empty sub-line: the <p> isn't rendered at all, so the card is the
    // title and the buttons — the shape a game takes when its title says it all.
    expect(container.querySelector('p')).toBeNull()
    expect(screen.getByRole('button', { name: 'Nice!' })).toBeInTheDocument()
  })

  it('renders the title and body it is given', () => {
    render(
      <CelebrationBlockingModal title="You won the race!" body="First to finish." onClose={() => {}} playSound={false} />,
    )
    expect(screen.getByText('You won the race!')).toBeInTheDocument()
    expect(screen.getByText('First to finish.')).toBeInTheDocument()
  })

  it('closes on Escape and on the close button', () => {
    const onClose = vi.fn()
    render(<CelebrationBlockingModal title="You win! 🎉" onClose={onClose} playSound={false} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Nice!' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
