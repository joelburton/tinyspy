// cs-unmet

/**
 * One count, two marks: the sound plays on each rise and the flag is up for
 * the beat from the same rise. `playSound` is mocked: whether a ring is
 * AUDIBLE is its business.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YOUR_TURN_FLASH_MS } from './feedbackTiming'

const { mockPlay } = vi.hoisted(() => ({ mockPlay: vi.fn(() => () => {}) }))
vi.mock('../sounds/playSound', () => ({ playSound: mockPlay, preloadSound: vi.fn() }))

import { useMarkBeat } from './useMarkBeat'

describe('useMarkBeat', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockPlay.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('marks nothing at a count of zero, mount included', () => {
    const { result } = renderHook(() => useMarkBeat(0, 'bell'))
    expect(result.current).toBe(false)
    expect(mockPlay).not.toHaveBeenCalled()
  })

  it('plays the sound and raises the flag on a rise, and lowers the flag after the beat', () => {
    const { result, rerender } = renderHook(({ count }) => useMarkBeat(count, 'timer'), {
      initialProps: { count: 0 },
    })
    rerender({ count: 1 })
    expect(result.current).toBe(true)
    expect(mockPlay).toHaveBeenCalledTimes(1)
    expect(mockPlay).toHaveBeenCalledWith('timer')

    act(() => vi.advanceTimersByTime(YOUR_TURN_FLASH_MS - 1))
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
  })

  it('a second rise is a fresh beat on a full clock', () => {
    const { result, rerender } = renderHook(({ count }) => useMarkBeat(count, 'bell'), {
      initialProps: { count: 0 },
    })
    rerender({ count: 1 })
    act(() => vi.advanceTimersByTime(YOUR_TURN_FLASH_MS))
    rerender({ count: 2 })
    expect(result.current).toBe(true)
    expect(mockPlay).toHaveBeenCalledTimes(2)
    act(() => vi.advanceTimersByTime(YOUR_TURN_FLASH_MS - 1))
    expect(result.current).toBe(true)
  })

  it('a count that holds still re-marks nothing', () => {
    const { rerender } = renderHook(({ count }) => useMarkBeat(count, 'bell'), {
      initialProps: { count: 0 },
    })
    rerender({ count: 1 })
    rerender({ count: 1 })
    rerender({ count: 1 })
    expect(mockPlay).toHaveBeenCalledTimes(1)
  })
})
