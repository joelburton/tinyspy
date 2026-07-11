/**
 * TooltipHost — the delegated `data-tooltip` renderer. Pins the interaction
 * contract: nothing until the show beat elapses, bubble text from the
 * attribute, hidden again when the pointer moves off / a press lands.
 * (Placement math is geometry jsdom can't measure — the viewport-clamp and
 * the below-flip are eyeballed in a real browser instead.)
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipHost } from './TooltipHost'

// (No matchMedia stub needed: jsdom has none, and the host treats a missing
// matchMedia as hover-capable — the useIsMobile convention.)
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const setup = () =>
  render(
    <>
      <button data-tooltip="End the game">x</button>
      <TooltipHost />
    </>,
  )

describe('TooltipHost', () => {
  it('shows the bubble after the beat, not before', () => {
    setup()
    fireEvent.mouseOver(screen.getByRole('button'))
    expect(screen.queryByText('End the game')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(450))
    expect(screen.getByText('End the game')).toBeInTheDocument()
  })

  it('hides when the pointer moves off the control', () => {
    setup()
    fireEvent.mouseOver(screen.getByRole('button'))
    act(() => vi.advanceTimersByTime(450))
    expect(screen.getByText('End the game')).toBeInTheDocument()

    fireEvent.mouseOver(document.body)
    expect(screen.queryByText('End the game')).not.toBeInTheDocument()
  })

  it('hides on a press (the user is acting; state may change under the text)', () => {
    setup()
    fireEvent.mouseOver(screen.getByRole('button'))
    act(() => vi.advanceTimersByTime(450))
    fireEvent.mouseDown(screen.getByRole('button'))
    expect(screen.queryByText('End the game')).not.toBeInTheDocument()
  })
})
