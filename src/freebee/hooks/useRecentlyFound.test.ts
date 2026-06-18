import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useRecentlyFound } from './useRecentlyFound'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('useRecentlyFound', () => {
  it('returns an empty set on initial render even when `found` is populated', () => {
    // Bootstrapping from the initial argument is the "don't
    // flash existing words on mount / reconnect" property.
    const { result } = renderHook(() =>
      useRecentlyFound(['bead', 'beef', 'cafe']),
    )
    expect(Array.from(result.current)).toEqual([])
  })

  it('marks freshly-arrived words as recent', () => {
    const { result, rerender } = renderHook(({ found }) => useRecentlyFound(found), {
      initialProps: { found: ['bead'] as string[] },
    })
    expect(Array.from(result.current)).toEqual([])

    act(() => {
      rerender({ found: ['bead', 'beef'] })
    })
    expect(Array.from(result.current)).toEqual(['beef'])

    // Another arrival doesn't drop the previous recent.
    act(() => {
      rerender({ found: ['bead', 'beef', 'cafe'] })
    })
    expect(Array.from(result.current).sort()).toEqual(['beef', 'cafe'])
  })

  it('drops a word from `recent` after the 5s timeout expires', () => {
    const { result, rerender } = renderHook(({ found }) => useRecentlyFound(found), {
      initialProps: { found: [] as string[] },
    })

    act(() => {
      rerender({ found: ['bead'] })
    })
    expect(result.current.has('bead')).toBe(true)

    // 4999ms — still recent.
    advance(4999)
    expect(result.current.has('bead')).toBe(true)

    // …+ 1ms = 5000ms — timer fires.
    advance(1)
    expect(result.current.has('bead')).toBe(false)
  })

  it('staggers expiry: each fresh word has its own timer', () => {
    const { result, rerender } = renderHook(({ found }) => useRecentlyFound(found), {
      initialProps: { found: [] as string[] },
    })

    act(() => {
      rerender({ found: ['bead'] })
    })
    advance(3000)
    act(() => {
      rerender({ found: ['bead', 'beef'] })
    })

    // 'bead' arrived at t=0; 'beef' at t=3000.
    advance(2000)   // t = 5000 — bead expires; beef still has 3s left.
    expect(result.current.has('bead')).toBe(false)
    expect(result.current.has('beef')).toBe(true)

    advance(3000)   // t = 8000 — beef expires.
    expect(result.current.has('beef')).toBe(false)
  })

  it('idempotent on the same `found` reference — no flicker on a no-op rerender', () => {
    const found = ['bead']
    const { result, rerender } = renderHook(({ f }) => useRecentlyFound(f), {
      initialProps: { f: [] as string[] },
    })

    act(() => {
      rerender({ f: found })
    })
    expect(result.current.has('bead')).toBe(true)

    // Same array — nothing fresh. The set must NOT mutate.
    const before = result.current
    act(() => {
      rerender({ f: found })
    })
    expect(result.current).toBe(before)
  })
})
