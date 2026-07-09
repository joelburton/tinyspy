import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CelebrationDialog } from './CelebrationDialog'

/**
 * The dialog is mostly presentational + an Esc handler. We keep sound off in
 * tests (jsdom has no media playback); these lock the contract a future
 * consumer relies on: default/overridden copy renders, Esc and the close
 * button dismiss, and the optional primary action fires.
 */
describe('CelebrationDialog', () => {
  it('renders default copy', () => {
    render(<CelebrationDialog onClose={() => {}} playSound={false} />)
    expect(screen.getByText('Congratulations!')).toBeInTheDocument()
    expect(screen.getByText('You solved the puzzle.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nice!' })).toBeInTheDocument()
  })

  it('renders overridden title/body', () => {
    render(
      <CelebrationDialog title="You won the race!" body="First to finish." onClose={() => {}} playSound={false} />,
    )
    expect(screen.getByText('You won the race!')).toBeInTheDocument()
    expect(screen.getByText('First to finish.')).toBeInTheDocument()
  })

  it('closes on Escape and on the close button', () => {
    const onClose = vi.fn()
    render(<CelebrationDialog onClose={onClose} playSound={false} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Nice!' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('renders and fires the optional primary action', () => {
    const onPrimary = vi.fn()
    render(
      <CelebrationDialog
        onClose={() => {}}
        primary={{ label: 'Play again', onClick: onPrimary }}
        playSound={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(onPrimary).toHaveBeenCalledTimes(1)
  })
})
