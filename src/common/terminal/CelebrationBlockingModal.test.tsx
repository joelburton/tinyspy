// cs-blessed-terminal

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CelebrationBlockingModal } from './CelebrationBlockingModal'

/**
 * The dialog is presentational, and the Esc that dismisses it belongs to the
 * shared panel registry rather than to this component — which is why the test
 * presses the key for real instead of asserting a handler. Sound stays off
 * (jsdom has no media playback). These lock what a game relies on: the title and
 * body render, a game that gives no body gets no sub-line, Esc and the close
 * button dismiss, and the optional primary action fires.
 */
describe('CelebrationBlockingModal', () => {
  it('renders the title alone when no body is given', () => {
    const { container } = render(<CelebrationBlockingModal onClose={() => {}} playSound={false} />)
    expect(screen.getByText('Congratulations!')).toBeInTheDocument()
    // Not an empty sub-line: the <p> isn't rendered at all, so the card is the
    // title and the buttons. Four games take this shape.
    expect(container.querySelector('p')).toBeNull()
    expect(screen.getByRole('button', { name: 'Nice!' })).toBeInTheDocument()
  })

  it('renders overridden title/body', () => {
    render(
      <CelebrationBlockingModal title="You won the race!" body="First to finish." onClose={() => {}} playSound={false} />,
    )
    expect(screen.getByText('You won the race!')).toBeInTheDocument()
    expect(screen.getByText('First to finish.')).toBeInTheDocument()
  })

  it('closes on Escape and on the close button', () => {
    const onClose = vi.fn()
    render(<CelebrationBlockingModal onClose={onClose} playSound={false} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Nice!' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('renders and fires the optional primary action', () => {
    const onPrimary = vi.fn()
    render(
      <CelebrationBlockingModal
        onClose={() => {}}
        primary={{ label: 'Play again', onClick: onPrimary }}
        playSound={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(onPrimary).toHaveBeenCalledTimes(1)
  })
})
