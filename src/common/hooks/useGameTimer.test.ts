import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGameTimer, formatTimerSeconds } from './useGameTimer'

/**
 * Tests for the per-game timer hook. Drives the hook with
 * Vitest's fake timers + a fixed Date.now() so the assertions
 * pin specific second-by-second behavior.
 *
 * What we cover:
 *   - mode='none' is inert
 *   - mode='countup' ticks up from 0
 *   - mode='countdown' ticks down and flips `expired` at 0
 *   - pause freezes the display, unpause resumes from where
 *     it left off (accumulated pause is subtracted from
 *     elapsed)
 *   - the format helper for the MM:SS display
 *
 * What we don't cover here:
 *   - StrictMode double-mounting (covered by the general
 *     React Testing Library setup)
 *   - cross-client drift behavior (it's "compute from
 *     Date.now() each tick" — nothing to test in isolation)
 */

const START = '2026-06-14T12:00:00.000Z'
const START_MS = new Date(START).getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START_MS)
})

afterEach(() => {
  vi.useRealTimers()
})

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('useGameTimer', () => {
  it('returns 0 / not-expired in "none" mode and never ticks', () => {
    const { result } = renderHook(() =>
      useGameTimer({ startedAt: START, paused: false, mode: { kind: 'none' } }),
    )
    expect(result.current.displaySeconds).toBe(0)
    expect(result.current.expired).toBe(false)

    advance(10_000)
    expect(result.current.displaySeconds).toBe(0)
    expect(result.current.expired).toBe(false)
  })

  it('counts up from 0 in "countup" mode', () => {
    const { result } = renderHook(() =>
      useGameTimer({
        startedAt: START,
        paused: false,
        mode: { kind: 'countup' },
      }),
    )
    // Initial snapshot at exactly the start: 0 elapsed.
    expect(result.current.displaySeconds).toBe(0)

    advance(3_000)
    expect(result.current.displaySeconds).toBe(3)
  })

  it('counts down from `seconds` in "countdown" mode', () => {
    const { result } = renderHook(() =>
      useGameTimer({
        startedAt: START,
        paused: false,
        mode: { kind: 'countdown', seconds: 10 },
      }),
    )
    expect(result.current.displaySeconds).toBe(10)

    advance(4_000)
    expect(result.current.displaySeconds).toBe(6)
  })

  it('flips `expired` true when a countdown hits 0', () => {
    const { result } = renderHook(() =>
      useGameTimer({
        startedAt: START,
        paused: false,
        mode: { kind: 'countdown', seconds: 3 },
      }),
    )
    expect(result.current.expired).toBe(false)

    advance(3_000)
    expect(result.current.displaySeconds).toBe(0)
    expect(result.current.expired).toBe(true)

    // Continues to report 0 / expired past the deadline; doesn't
    // go negative.
    advance(5_000)
    expect(result.current.displaySeconds).toBe(0)
    expect(result.current.expired).toBe(true)
  })

  it('freezes the display while paused', () => {
    const { result, rerender } = renderHook(
      ({ paused }: { paused: boolean }) =>
        useGameTimer({
          startedAt: START,
          paused,
          mode: { kind: 'countup' },
        }),
      { initialProps: { paused: false } },
    )
    advance(2_000)
    expect(result.current.displaySeconds).toBe(2)

    // Pause at t=2s. Advance wall clock another 5s. Display
    // should stay at 2.
    rerender({ paused: true })
    advance(5_000)
    expect(result.current.displaySeconds).toBe(2)
  })

  it('resumes from where it left off after a pause', () => {
    const { result, rerender } = renderHook(
      ({ paused }: { paused: boolean }) =>
        useGameTimer({
          startedAt: START,
          paused,
          mode: { kind: 'countup' },
        }),
      { initialProps: { paused: false } },
    )
    advance(2_000)
    rerender({ paused: true })
    advance(5_000) // wall clock advances but display stays
    rerender({ paused: false })
    expect(result.current.displaySeconds).toBe(2) // resumed at 2s
    advance(3_000)
    expect(result.current.displaySeconds).toBe(5) // 2 + 3 wall-clock seconds post-resume
  })

  it('respects pause through countdown — does not expire while paused', () => {
    const { result, rerender } = renderHook(
      ({ paused }: { paused: boolean }) =>
        useGameTimer({
          startedAt: START,
          paused,
          mode: { kind: 'countdown', seconds: 5 },
        }),
      { initialProps: { paused: false } },
    )
    advance(3_000)
    expect(result.current.displaySeconds).toBe(2)

    rerender({ paused: true })
    advance(10_000) // would have expired several seconds ago if not paused
    expect(result.current.displaySeconds).toBe(2)
    expect(result.current.expired).toBe(false)

    rerender({ paused: false })
    advance(2_000)
    expect(result.current.displaySeconds).toBe(0)
    expect(result.current.expired).toBe(true)
  })
})

describe('formatTimerSeconds', () => {
  it('formats as M:SS with zero-padded seconds', () => {
    expect(formatTimerSeconds(0)).toBe('0:00')
    expect(formatTimerSeconds(9)).toBe('0:09')
    expect(formatTimerSeconds(60)).toBe('1:00')
    expect(formatTimerSeconds(125)).toBe('2:05')
    expect(formatTimerSeconds(600)).toBe('10:00')
  })
})
