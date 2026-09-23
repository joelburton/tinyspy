// cs-unmet

/**
 * The turn's arrival count — the one edge the yellow frame and the bell both
 * key on.
 */
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTurnArrival } from './useTurnArrival'

describe('useTurnArrival', () => {
  it('counts nothing on mount, whichever way the turn already sits', () => {
    expect(renderHook(() => useTurnArrival(true)).result.current).toBe(0)
    expect(renderHook(() => useTurnArrival(false)).result.current).toBe(0)
  })

  it('counts each time the turn becomes mine, and not when it leaves', () => {
    const { result, rerender } = renderHook(({ mine }) => useTurnArrival(mine), {
      initialProps: { mine: false },
    })
    rerender({ mine: true })
    expect(result.current).toBe(1)
    rerender({ mine: true }) // still mine: no new arrival
    expect(result.current).toBe(1)
    rerender({ mine: false }) // leaving is not an arrival
    expect(result.current).toBe(1)
    rerender({ mine: true })
    expect(result.current).toBe(2)
  })

  it('seeds from the first KNOWN value, so data landing on my turn is not an arrival', () => {
    // A game whose own rows load after mount: unknown, then already mine.
    const { result, rerender } = renderHook(({ mine }) => useTurnArrival(mine), {
      initialProps: { mine: null as boolean | null },
    })
    rerender({ mine: true })
    expect(result.current).toBe(0)
    rerender({ mine: false })
    rerender({ mine: true })
    expect(result.current).toBe(1)
  })

  it('never counts in a free-for-all, where the turn is permanently mine', () => {
    const { result, rerender } = renderHook(({ mine }) => useTurnArrival(mine), {
      initialProps: { mine: true },
    })
    rerender({ mine: true })
    rerender({ mine: true })
    expect(result.current).toBe(0)
  })
})
