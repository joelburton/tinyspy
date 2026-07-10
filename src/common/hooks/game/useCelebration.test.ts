/**
 * Tests for useCelebration — the one-shot "celebrate at the moment of the win"
 * state machine (waffle's coop win is the first consumer). Its contract is the
 * deliberate inverse of useTerminalModal's on mount, and both halves are
 * load-bearing:
 *
 *   1. NEVER open on mount — opening an already-won game (deep link / refresh)
 *      is reviewing history, not winning;
 *   2. pop once when `won` flips true mid-session (the winning move arriving
 *      via the realtime refetch);
 *   3. stay dismissed after close across re-renders while still won;
 *   4. re-arm when `won` flips back false (replay-board un-terminals the
 *      game), so win → restart → win celebrates again.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useCelebration } from './useCelebration'

describe('useCelebration', () => {
  it('stays closed when the game is already won on mount', () => {
    const { result } = renderHook(() => useCelebration(true))
    expect(result.current.show).toBe(false)
  })

  it('stays closed while the game is in progress', () => {
    const { result } = renderHook(() => useCelebration(false))
    expect(result.current.show).toBe(false)
  })

  it('pops when won flips true mid-session', () => {
    const { result, rerender } = renderHook(({ won }: { won: boolean }) => useCelebration(won), {
      initialProps: { won: false },
    })
    expect(result.current.show).toBe(false)

    rerender({ won: true })
    expect(result.current.show).toBe(true)
  })

  it('stays dismissed after close across later re-renders while still won', () => {
    const { result, rerender } = renderHook(({ won }: { won: boolean }) => useCelebration(won), {
      initialProps: { won: false },
    })

    rerender({ won: true })
    act(() => result.current.close())
    expect(result.current.show).toBe(false)

    rerender({ won: true })
    expect(result.current.show).toBe(false)
  })

  it('re-arms after won flips back false (restart), celebrating a second win', () => {
    const { result, rerender } = renderHook(({ won }: { won: boolean }) => useCelebration(won), {
      initialProps: { won: false },
    })

    rerender({ won: true })
    act(() => result.current.close())

    // Replay-board un-terminals the game…
    rerender({ won: false })
    expect(result.current.show).toBe(false)

    // …and the second solve celebrates again.
    rerender({ won: true })
    expect(result.current.show).toBe(true)
  })
})
