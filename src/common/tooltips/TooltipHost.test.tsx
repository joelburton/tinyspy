// cs-blessed-common-hosts

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

  it('shows the bubble on a DISABLED control — that is where it says why', () => {
    // Every current engine dispatches mouseover on a disabled form control,
    // and the "say why" rule (docs/ui.md → "A disabled button still gets a
    // tooltip") depends on the host not filtering it out.
    render(
      <>
        <button disabled data-tooltip="Can't reveal until all end">x</button>
        <TooltipHost />
      </>,
    )
    fireEvent.mouseOver(screen.getByRole('button'))
    act(() => vi.advanceTimersByTime(450))
    expect(screen.getByText("Can't reveal until all end")).toBeInTheDocument()
  })

  it('hides when the pointer moves off the control', () => {
    setup()
    fireEvent.mouseOver(screen.getByRole('button'))
    act(() => vi.advanceTimersByTime(450))
    expect(screen.getByText('End the game')).toBeInTheDocument()

    fireEvent.mouseOver(document.body)
    expect(screen.queryByText('End the game')).not.toBeInTheDocument()
  })

  // A scroll hides the bubble because its measured position is now stale — but
  // the pointer has not moved, so the same control must be able to show it
  // again without the pointer leaving and coming back.
  it('hides on scroll, and the same control can show it again', () => {
    setup()
    const btn = screen.getByRole('button')
    fireEvent.mouseOver(btn)
    act(() => vi.advanceTimersByTime(450))
    expect(screen.getByText('End the game')).toBeInTheDocument()

    fireEvent.scroll(document)
    expect(screen.queryByText('End the game')).toBeNull()

    // Still inside the same button — moving onto its icon fires this in a real
    // browser.
    fireEvent.mouseOver(btn)
    act(() => vi.advanceTimersByTime(450))
    expect(screen.getByText('End the game'), 'the bubble must be reachable again').toBeInTheDocument()
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

      // The browser's synthesized click, after the finger lifts.
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

    let onOther = vi.fn()
    beforeEach(() => {
      onOther = vi.fn()
    })
    const pair = () => {
      render(
        <>
          <button data-tooltip="End the game">x</button>
          <button onClick={onOther}>other</button>
          <TooltipHost />
        </>,
      )
      return { held: screen.getAllByRole('button')[0]!, other: screen.getByText('other') }
    }

    // The two below guard the same thing from opposite ends. The suppression
    // is armed by the hold and disarmed by swallowing the click, so a press
    // that produces NO click — the system taking the gesture, or the held
    // element leaving the DOM before the lift — would leave it armed to eat an
    // unrelated tap, which reads as the app having dropped a press.
    it('a canceled press disarms at once — the next tap is not eaten', () => {
      const { held, other } = pair()
      fireEvent.touchStart(held, touch())
      act(() => void vi.advanceTimersByTime(500))
      fireEvent.touchCancel(held) // a call, a notification, the app switcher
      fireEvent.click(other)
      expect(onOther, 'an unrelated tap must survive a canceled press').toHaveBeenCalledTimes(1)
    })

    it('a lift whose click never arrives is disarmed by the next press', () => {
      const { held, other } = pair()
      fireEvent.touchStart(held, touch())
      act(() => void vi.advanceTimersByTime(500))
      // Lift, but no click follows — the held element went away under the finger.
      fireEvent.touchEnd(held)
      fireEvent.touchStart(other, touch())
      fireEvent.click(other)
      expect(onOther).toHaveBeenCalledTimes(1)
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
describe('a READOUT carrier — data-tooltip-on="readout"', () => {
  // Not a control: nobody crosses it on the way to pressing something, and it
  // has no action to protect. So every timing a button wants is the wrong one
  // here — see READOUT_SHOW_DELAY_MS.
  const readout = () =>
    render(
      <>
        <li data-tooltip="Genius · 76 pts" data-tooltip-on="readout">
          square
        </li>
        <TooltipHost />
      </>,
    )
  const touch = (x = 0, y = 0) => ({ touches: [{ clientX: x, clientY: y }] })

  it('shows at once on hover, with no beat to wait out', () => {
    const { container } = readout()
    fireEvent.mouseOver(container.querySelector('li')!)
    // Zero delay still defers a tick; what matters is that it is not the
    // control's 400ms.
    act(() => void vi.advanceTimersByTime(1))
    expect(screen.getByText('Genius · 76 pts')).toBeInTheDocument()
  })

  it('a TAP reveals it — a phone has no hover, and a hold would be a toll', () => {
    const { container } = readout()
    const li = container.querySelector('li')!
    fireEvent.touchStart(li, touch())
    // No timer advanced at all: the tap itself is the question.
    expect(screen.getByText('Genius · 76 pts')).toBeInTheDocument()
  })

  it('the next touch anywhere dismisses it', () => {
    const { container } = readout()
    const li = container.querySelector('li')!
    fireEvent.touchStart(li, touch())
    expect(screen.getByText('Genius · 76 pts')).toBeInTheDocument()
    fireEvent.touchStart(document.body, touch())
    expect(screen.queryByText('Genius · 76 pts')).not.toBeInTheDocument()
  })

  it('a press LEAVES it up, where a control\'s press dismisses', () => {
    const { container } = readout()
    const li = container.querySelector('li')!
    fireEvent.mouseOver(li)
    act(() => void vi.advanceTimersByTime(1))
    fireEvent.mouseDown(li)
    expect(
      screen.getByText('Genius · 76 pts'),
      'pressing the thing you are reading about must not take the reading away',
    ).toBeInTheDocument()
  })

  it('leaves the CONTROL contract alone — a button still waits out its beat', () => {
    // The same host, the same render: the attribute is what differs.
    render(
      <>
        <button data-tooltip="End the game">x</button>
        <TooltipHost />
      </>,
    )
    fireEvent.mouseOver(screen.getByRole('button'))
    act(() => void vi.advanceTimersByTime(1))
    expect(screen.queryByText('End the game')).not.toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(450))
    expect(screen.getByText('End the game')).toBeInTheDocument()
  })
})

describe('the iOS long-press callout is suppressed in CSS', () => {
  it('utilities.css turns the callout off on every [data-tooltip] target', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync('src/common/core-css/utilities.css', 'utf8')
    const rule = css.match(/\[data-tooltip\]\s*\{[^}]*\}/)?.[0] ?? ''
    expect(rule, 'no [data-tooltip] rule in utilities.css').not.toBe('')
    expect(rule).toContain('-webkit-touch-callout: none')
    // The callout is the text-selection UI wearing another hat, so the pair
    // travels together.
    expect(rule).toContain('user-select: none')
  })
})
