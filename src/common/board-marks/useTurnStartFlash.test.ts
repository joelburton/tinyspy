// cs-audited-board-marks

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YOUR_TURN_FLASH_MS } from './feedbackTiming'
import { useTurnStartFlash } from './useTurnStartFlash'

describe('useTurnStartFlash', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('says nothing on mount, whichever way the turn already sits', () => {
    // Opening a game that is already yours is not the turn ARRIVING. This is the
    // rule a naive `myTurn && flash` gets wrong, and it is the one that matters:
    // every reload of an in-progress game would frame the board for no reason.
    expect(renderHook(() => useTurnStartFlash(true)).result.current).toBe(false)
    expect(renderHook(() => useTurnStartFlash(false)).result.current).toBe(false)
  })

  it('fires when the turn becomes mine, and clears itself', () => {
    const { result, rerender } = renderHook(({ mine }) => useTurnStartFlash(mine), {
      initialProps: { mine: false },
    })
    expect(result.current).toBe(false)

    rerender({ mine: true })
    expect(result.current).toBe(true)

    act(() => vi.advanceTimersByTime(YOUR_TURN_FLASH_MS - 1))
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
  })

  it('does not fire when the turn LEAVES', () => {
    // Losing the turn is announced by the board dimming, which is a state rather
    // than an event — rising edge only.
    const { result, rerender } = renderHook(({ mine }) => useTurnStartFlash(mine), {
      initialProps: { mine: false },
    })
    rerender({ mine: true })
    act(() => vi.advanceTimersByTime(YOUR_TURN_FLASH_MS))
    expect(result.current).toBe(false)

    rerender({ mine: false })
    expect(result.current).toBe(false)
  })

  it('fires again on the next turn', () => {
    const { result, rerender } = renderHook(({ mine }) => useTurnStartFlash(mine), {
      initialProps: { mine: false },
    })
    rerender({ mine: true })
    act(() => vi.advanceTimersByTime(YOUR_TURN_FLASH_MS))
    rerender({ mine: false })
    rerender({ mine: true })
    expect(result.current).toBe(true)
  })

  it('never fires in a free-for-all, where the turn is permanently mine', () => {
    // `myTurn` never transitions, so the hook needs no gate at the call site.
    const { result, rerender } = renderHook(({ mine }) => useTurnStartFlash(mine), {
      initialProps: { mine: true },
    })
    rerender({ mine: true })
    rerender({ mine: true })
    expect(result.current).toBe(false)
  })

  it('is cut short when the turn leaves, and re-announced when it comes back', () => {
    // The transition sets `flashing` to whichever way the turn just went, so a
    // turn LEAVING takes the frame off at once rather than letting it finish —
    // you acted, so the announcement is spent — and coming back is a fresh
    // arrival with a fresh clock.
    const { result, rerender } = renderHook(({ mine }) => useTurnStartFlash(mine), {
      initialProps: { mine: false },
    })
    rerender({ mine: true })
    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBe(true)

    rerender({ mine: false })
    expect(result.current).toBe(false) // cut short, not left to finish

    rerender({ mine: true })
    expect(result.current).toBe(true) // announced again
    act(() => vi.advanceTimersByTime(YOUR_TURN_FLASH_MS - 1))
    expect(result.current).toBe(true) // on a FULL clock, not the remaining 900ms
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
  })

  it('does not fire after unmount', () => {
    const { rerender, unmount } = renderHook(({ mine }) => useTurnStartFlash(mine), {
      initialProps: { mine: false },
    })
    rerender({ mine: true })
    unmount()
    expect(() => act(() => vi.advanceTimersByTime(YOUR_TURN_FLASH_MS))).not.toThrow()
  })
})
