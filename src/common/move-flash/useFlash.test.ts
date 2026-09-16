// cs-audited-move-flash

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFlash } from './useFlash'

describe('useFlash', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts empty', () => {
    const { result } = renderHook(() => useFlash(1000))
    expect([...result.current[0]]).toEqual([])
  })

  it('flashes a set and clears it after the duration', () => {
    const { result } = renderHook(() => useFlash(1000))
    act(() => result.current[1]([1, 2, 3]))
    expect([...result.current[0]].sort()).toEqual([1, 2, 3])

    act(() => vi.advanceTimersByTime(999))
    expect(result.current[0].has(1)).toBe(true) // not yet cleared
    act(() => vi.advanceTimersByTime(1))
    expect([...result.current[0]]).toEqual([]) // cleared at the duration
  })

  it('restarts the countdown when flashed again', () => {
    const { result } = renderHook(() => useFlash(1000))
    act(() => result.current[1]([1]))
    act(() => vi.advanceTimersByTime(800))
    act(() => result.current[1]([2])) // re-flash resets the clock + swaps contents
    expect([...result.current[0]]).toEqual([2])
    act(() => vi.advanceTimersByTime(800)) // 1600ms since first flash, 800 since second
    expect(result.current[0].has(2)).toBe(true) // still hot — timer restarted
    act(() => vi.advanceTimersByTime(200))
    expect([...result.current[0]]).toEqual([])
  })

  it('clears on demand, without waiting for the duration', () => {
    const { result } = renderHook(() => useFlash(1000))
    act(() => result.current[1]([1, 2]))
    act(() => result.current[2]())
    expect([...result.current[0]]).toEqual([])
    // The pending timer is left alone deliberately; it empties an already-empty
    // set, and a flash in the meantime cancels it before starting its own.
    act(() => result.current[1]([3]))
    act(() => vi.advanceTimersByTime(999))
    expect(result.current[0].has(3)).toBe(true)
  })

  it('accepts a custom duration', () => {
    const { result } = renderHook(() => useFlash(500))
    act(() => result.current[1]([9]))
    act(() => vi.advanceTimersByTime(499))
    expect(result.current[0].has(9)).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect([...result.current[0]]).toEqual([])
  })
})
