/**
 * Tests for useSingleFlight — the "one run at a time" wrapper around an async
 * action (New game's guard; see the hook's docstring for why the guard sits on
 * the handler rather than on the button).
 *
 * The behaviours worth pinning are the ones a careless rewrite would break:
 * the drop while in flight, the clear on the FAILURE path (a guard that wedges
 * the control is worse than the bug it fixes), and that the gate closes
 * synchronously — before any await — since two clicks can land in one tick.
 */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSingleFlight } from './useSingleFlight'

/** An action that stays pending until the test releases it. */
function deferred() {
  let release!: () => void
  let fail!: (e: Error) => void
  const action = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        release = resolve
        fail = reject
      }),
  )
  return { action, release: () => release(), fail: (e: Error) => fail(e) }
}

describe('useSingleFlight', () => {
  it('runs the action and reports pending until it settles', async () => {
    const { action, release } = deferred()
    const { result } = renderHook(() => useSingleFlight(action))

    expect(result.current[1]).toBe(false)
    act(() => result.current[0]())
    expect(action).toHaveBeenCalledTimes(1)
    expect(result.current[1]).toBe(true)

    await act(async () => release())
    expect(result.current[1]).toBe(false)
  })

  it('drops calls that arrive while the first is in flight', async () => {
    const { action, release } = deferred()
    const { result } = renderHook(() => useSingleFlight(action))

    act(() => {
      // Both in ONE act — the same tick, which is the case a `setState` gate
      // would miss (it hasn't committed yet when the second call reads it).
      result.current[0]()
      result.current[0]()
    })
    expect(action).toHaveBeenCalledTimes(1)

    await act(async () => release())
    // …and it's usable again once the first finishes.
    act(() => result.current[0]())
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('clears the gate when the action REJECTS, so it stays retryable', async () => {
    const { action, fail } = deferred()
    // The hook logs an unexpected throw rather than letting it become an
    // unhandled rejection; silence that here so the assertion is the signal.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useSingleFlight(action))

    act(() => result.current[0]())
    await act(async () => {
      fail(new Error('network gone'))
      // Let the rejection propagate through the hook's finally.
      await Promise.resolve()
    })

    expect(result.current[1]).toBe(false)
    act(() => result.current[0]())
    expect(action).toHaveBeenCalledTimes(2)
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })

  it('forwards arguments to the wrapped action', async () => {
    const action = vi.fn(async (a: string, b: number) => void [a, b])
    const { result } = renderHook(() => useSingleFlight(action))
    await act(async () => result.current[0]('x', 7))
    expect(action).toHaveBeenCalledWith('x', 7)
  })

  it('accepts a synchronous action too (no promise to await)', async () => {
    const action = vi.fn(() => {})
    const { result } = renderHook(() => useSingleFlight(action))
    await act(async () => result.current[0]())
    expect(action).toHaveBeenCalledTimes(1)
    expect(result.current[1]).toBe(false)
  })
})
