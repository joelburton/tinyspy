// cs-blessed-board-marks

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMark } from './useMark'

type Answer = { word: string; outcome: string }

describe('useMark', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts with nothing up', () => {
    const { result } = renderHook(() => useMark<Answer>(1000))
    expect(result.current[0]).toBeNull()
  })

  it('shows a mark and takes it down after the duration', () => {
    const { result } = renderHook(() => useMark<Answer>(1000))
    act(() => result.current[1]({ word: 'CAT', outcome: 'lost' }))
    expect(result.current[0]).toEqual({ word: 'CAT', outcome: 'lost' })

    act(() => vi.advanceTimersByTime(999))
    expect(result.current[0]).not.toBeNull() // not yet
    act(() => vi.advanceTimersByTime(1))
    expect(result.current[0]).toBeNull()
  })

  it('restarts the countdown when shown again', () => {
    // A second refusal replaces the first and gets its own full beat, rather
    // than inheriting what was left of the last one.
    const { result } = renderHook(() => useMark<Answer>(1000))
    act(() => result.current[1]({ word: 'CAT', outcome: 'lost' }))
    act(() => vi.advanceTimersByTime(800))
    act(() => result.current[1]({ word: 'DOG', outcome: 'warning' }))
    expect(result.current[0]).toEqual({ word: 'DOG', outcome: 'warning' })

    act(() => vi.advanceTimersByTime(800)) // 1600ms since the first, 800 since this one
    expect(result.current[0]).not.toBeNull()
    act(() => vi.advanceTimersByTime(200))
    expect(result.current[0]).toBeNull()
  })

  it('clears on demand, without waiting for the duration', () => {
    const { result } = renderHook(() => useMark<Answer>(1000))
    act(() => result.current[1]({ word: 'CAT', outcome: 'lost' }))
    act(() => result.current[2]())
    expect(result.current[0]).toBeNull()
    // The pending timer is left alone deliberately; it nulls an already-null
    // mark, and a `show` in the meantime cancels it before starting its own.
    act(() => result.current[1]({ word: 'DOG', outcome: 'won' }))
    act(() => vi.advanceTimersByTime(999))
    expect(result.current[0]).toEqual({ word: 'DOG', outcome: 'won' })
  })

  it('does not fire after unmount', () => {
    const { result, unmount } = renderHook(() => useMark<Answer>(1000))
    act(() => result.current[1]({ word: 'CAT', outcome: 'lost' }))
    unmount()
    // No "setState on an unmounted component" — the cleanup took the timer.
    expect(() => act(() => vi.advanceTimersByTime(1000))).not.toThrow()
  })
})
