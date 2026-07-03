import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

/**
 * Tests for the shared local-feedback hook. It holds one `GenericFeedbackMsg |
 * null` and auto-clears `timed` messages, so the cases that matter are: a `timed`
 * message auto-clears after its duration, a `sticky` one does NOT, `clear()`
 * cancels early, a fresh `show()` re-arms the countdown, and the timer is torn
 * down on unmount. Fake timers drive the clock.
 */

import { useLocalFeedback, LOCAL_FEEDBACK_DISMISS_MS } from './useLocalFeedback'
import type { GenericFeedbackMsg } from '../lib/games'

const timed = (text: string, ms?: number): GenericFeedbackMsg => ({
  tone: 'success',
  text,
  dismiss: { kind: 'timed', ...(ms !== undefined ? { ms } : {}) },
})
const sticky = (text: string): GenericFeedbackMsg => ({
  tone: 'error',
  text,
  dismiss: { kind: 'sticky' },
})

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

  it('a timed message auto-clears after its duration', () => {
    const { result } = renderHook(() => useLocalFeedback())

    act(() => result.current.showLocalFeedback(timed('Correct!')))
    expect(result.current.localFeedback?.text).toBe('Correct!')

    // Just before the deadline it's still up…
    act(() => void vi.advanceTimersByTime(LOCAL_FEEDBACK_DISMISS_MS - 1))
    expect(result.current.localFeedback?.text).toBe('Correct!')

    // …and clears exactly at it.
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current.localFeedback).toBeNull()
  })

  it('a sticky message does NOT auto-clear', () => {
    const { result } = renderHook(() => useLocalFeedback())

    act(() => result.current.showLocalFeedback(sticky('Incorrect')))
    act(() => void vi.advanceTimersByTime(LOCAL_FEEDBACK_DISMISS_MS * 3))
    expect(result.current.localFeedback?.text).toBe('Incorrect')
  })

  it('clear() dismisses immediately and cancels a pending timer', () => {
    const { result } = renderHook(() => useLocalFeedback())

    act(() => result.current.showLocalFeedback(timed('bye')))
    act(() => result.current.clearLocalFeedback())
    expect(result.current.localFeedback).toBeNull()

    // The pending auto-clear must not fire later and resurrect/re-null anything.
    act(() => void vi.advanceTimersByTime(LOCAL_FEEDBACK_DISMISS_MS))
    expect(result.current.localFeedback).toBeNull()
  })

  it('re-arms the countdown on a fresh show()', () => {
    const { result } = renderHook(() => useLocalFeedback())

    act(() => result.current.showLocalFeedback(timed('first')))
    // Most of the way through the first message…
    act(() => void vi.advanceTimersByTime(LOCAL_FEEDBACK_DISMISS_MS - 10))
    // …a second result restarts the clock with the new text.
    act(() => result.current.showLocalFeedback(timed('second')))
    expect(result.current.localFeedback?.text).toBe('second')

    // The original deadline passes without clearing (timer was re-armed).
    act(() => void vi.advanceTimersByTime(10))
    expect(result.current.localFeedback?.text).toBe('second')

    // The new full duration clears it.
    act(() => void vi.advanceTimersByTime(LOCAL_FEEDBACK_DISMISS_MS - 10))
    expect(result.current.localFeedback).toBeNull()
  })

  it('honors a custom duration from the message', () => {
    const { result } = renderHook(() => useLocalFeedback())

    act(() => result.current.showLocalFeedback(timed('nope', 500)))
    act(() => void vi.advanceTimersByTime(499))
    expect(result.current.localFeedback).not.toBeNull()
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current.localFeedback).toBeNull()
  })

  it('clears the timer on unmount (no leak)', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { result, unmount } = renderHook(() => useLocalFeedback())

    act(() => result.current.showLocalFeedback(timed('bye')))
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  // Terminal local feedback is permanent: while `locked`, clear() refuses — no
  // key / click can wipe a verdict (the permanence lives in the hook, not the
  // caller).
  it('clearLocalFeedback is a no-op while locked (terminal)', () => {
    const { result } = renderHook(() => useLocalFeedback({ locked: true }))
    act(() => result.current.showLocalFeedback(sticky('You won!')))
    expect(result.current.localFeedback).not.toBeNull()
    act(() => result.current.clearLocalFeedback())
    expect(result.current.localFeedback).not.toBeNull() // still there — locked
  })

  it('locked can flip: clear works during play, then is refused at terminal', () => {
    const { result, rerender } = renderHook(({ locked }) => useLocalFeedback({ locked }), {
      initialProps: { locked: false },
    })
    // During play: clear works.
    act(() => result.current.showLocalFeedback(sticky('nope')))
    act(() => result.current.clearLocalFeedback())
    expect(result.current.localFeedback).toBeNull()
    // Game ends → show the verdict, then a stray clear can't remove it.
    rerender({ locked: true })
    act(() => result.current.showLocalFeedback(sticky('Game over')))
    act(() => result.current.clearLocalFeedback())
    expect(result.current.localFeedback).not.toBeNull()
  })
})
