/**
 * TooltipHost — the delegated `data-tooltip` renderer. Pins the interaction
 * contract: nothing until the show beat elapses, bubble text from the
 * attribute, hidden again when the pointer moves off / a press lands — and, on
 * touch, the LONG-PRESS path that gives icon-only buttons a name where there is
 * no hover to ask with.
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

  /**
   * Long-press: the touch answer to "what does this glyph mean?".
   *
   * The click-suppression case is the one that matters. Lifting after a long
   * press still fires a click, so without swallowing it, holding a button to
   * learn that it says "End the game" would END THE GAME. That makes the
   * feature worse than not having it, which is why it's asserted first.
   */
  describe('long-press (touch)', () => {
    const touch = (x = 0, y = 0) => ({ touches: [{ clientX: x, clientY: y }] })

    it('does not let the press through as a click', () => {
      const onClick = vi.fn()
      render(
        <>
          <button data-tooltip="End the game" onClick={onClick}>x</button>
          <TooltipHost />
        </>,
      )
      const btn = screen.getByRole('button')
      fireEvent.touchStart(btn, touch())
      act(() => void vi.advanceTimersByTime(500))
      expect(screen.getByText('End the game')).toBeInTheDocument()

      // The browser's synthesised click, after the finger lifts.
      fireEvent.touchEnd(btn)
      fireEvent.click(btn)
      expect(onClick, 'the held button must not fire').not.toHaveBeenCalled()

      // …and only THAT click is swallowed — the next real tap works.
      fireEvent.click(btn)
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('shows the label after the hold, not on a quick tap', () => {
      setup()
      const btn = screen.getByRole('button')
      fireEvent.touchStart(btn, touch())
      act(() => void vi.advanceTimersByTime(200))
      expect(screen.queryByText('End the game')).toBeNull()
      fireEvent.touchEnd(btn) // a tap: released before the hold completes
      act(() => void vi.advanceTimersByTime(500))
      expect(screen.queryByText('End the game'), 'a tap is not a hold').toBeNull()
    })

    it('treats a drag as a scroll and cancels', () => {
      setup()
      const btn = screen.getByRole('button')
      fireEvent.touchStart(btn, touch(0, 0))
      fireEvent.touchMove(btn, touch(0, 40))
      act(() => void vi.advanceTimersByTime(500))
      expect(screen.queryByText('End the game')).toBeNull()
    })

    it('the next touch dismisses the bubble', () => {
      setup()
      const btn = screen.getByRole('button')
      fireEvent.touchStart(btn, touch())
      act(() => void vi.advanceTimersByTime(500))
      expect(screen.getByText('End the game')).toBeInTheDocument()
      fireEvent.touchEnd(btn)
      fireEvent.touchStart(btn, touch())
      expect(screen.queryByText('End the game'), 'no stuck bubble').toBeNull()
    })
  })
})

/**
 * The half of the long-press contract that lives in CSS, guarded by reading the
 * stylesheet — jsdom applies no global sheet, and no desktop browser (headless
 * or not) reproduces the behavior this prevents.
 *
 * iOS Safari answers a long press with its OWN callout — Copy / Look Up /
 * Share — which opened right over our bubble. It is NOT the `contextmenu` event
 * the host suppresses for Android (Safari doesn't fire that on a long press),
 * so the only lever is declarative. Delete this rule and every icon-only button
 * on an iPhone goes back to being unlearnable: the label appears under a system
 * menu covering it.
 */
describe('the iOS long-press callout is suppressed in CSS', () => {
  it('theme.css turns the callout off on every [data-tooltip] target', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync('src/common/theme.css', 'utf8')
    const rule = css.match(/\[data-tooltip\]\s*\{[^}]*\}/)?.[0] ?? ''
    expect(rule, 'no [data-tooltip] rule in theme.css').not.toBe('')
    expect(rule).toContain('-webkit-touch-callout: none')
    // The callout is the text-selection UI wearing another hat, so the pair
    // travels together.
    expect(rule).toContain('user-select: none')
  })
})
