import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

/**
 * Tests for the shared local-feedback hook. It's a tiny re-armable timer over
 * a `{ tone, label } | null` state, so the cases that matter are the timing
 * ones: auto-clear after the duration, `clearLocalFeedback()` cancelling early,
 * a fresh `showLocalFeedback()` re-arming the countdown, and the timer being
 * torn down on unmount. Fake timers drive the clock.
 */

import { useLocalFeedback, LOCAL_FEEDBACK_DISMISS_MS } from './useLocalFeedback'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useLocalFeedback', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useLocalFeedback())
    expect(result.current.localFeedback).toBeNull()
  })

  it('shows a flash and auto-clears after the duration', () => {
    const { result } = renderHook(() => useLocalFeedback())

    act(() => result.current.showLocalFeedback('good', 'Correct!'))
    expect(result.current.localFeedback).toEqual({ tone: 'good', label: 'Correct!' })

    // Just before the deadline it's still up…
    act(() => void vi.advanceTimersByTime(LOCAL_FEEDBACK_DISMISS_MS - 1))
    expect(result.current.localFeedback).toEqual({ tone: 'good', label: 'Correct!' })

    // …and clears exactly at it.
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current.localFeedback).toBeNull()
  })

  it('clear() dismisses immediately and cancels the timer', () => {
    const { result } = renderHook(() => useLocalFeedback())

    act(() => result.current.showLocalFeedback('bad', 'Incorrect'))
    act(() => result.current.clearLocalFeedback())
    expect(result.current.localFeedback).toBeNull()

    // The pending auto-clear must not fire later and resurrect/re-null anything.
    act(() => void vi.advanceTimersByTime(LOCAL_FEEDBACK_DISMISS_MS))
    expect(result.current.localFeedback).toBeNull()
  })

  it('re-arms the countdown on a fresh show()', () => {
    const { result } = renderHook(() => useLocalFeedback())

    act(() => result.current.showLocalFeedback('good', 'first'))
    // Most of the way through the first flash…
    act(() => void vi.advanceTimersByTime(LOCAL_FEEDBACK_DISMISS_MS - 10))
    // …a second result restarts the clock with the new label.
    act(() => result.current.showLocalFeedback('near', 'second'))
    expect(result.current.localFeedback).toEqual({ tone: 'near', label: 'second' })

    // The original deadline passes without clearing (timer was re-armed).
    act(() => void vi.advanceTimersByTime(10))
    expect(result.current.localFeedback).toEqual({ tone: 'near', label: 'second' })

    // The new full duration clears it.
    act(() => void vi.advanceTimersByTime(LOCAL_FEEDBACK_DISMISS_MS - 10))
    expect(result.current.localFeedback).toBeNull()
  })

  it('honors a custom duration', () => {
    const { result } = renderHook(() => useLocalFeedback(500))

    act(() => result.current.showLocalFeedback('bad', 'nope'))
    act(() => void vi.advanceTimersByTime(499))
    expect(result.current.localFeedback).not.toBeNull()
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current.localFeedback).toBeNull()
  })

  it('clears the timer on unmount (no leak)', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { result, unmount } = renderHook(() => useLocalFeedback())

    act(() => result.current.showLocalFeedback('good', 'bye'))
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})
