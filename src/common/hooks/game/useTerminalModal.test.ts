/**
 * Tests for useTerminalModal — the terminal-`<GameOverModal>` state machine
 * shared by every game's PlayArea (codenamesduet / connections / psychicnum /
 * waffle today). The hook is tiny but its three documented behaviors are
 * load-bearing and were previously UNTESTED:
 *
 *   1. open immediately if the game is ALREADY terminal on mount (deep link /
 *      refresh into a finished game);
 *   2. pop once when `isTerminal` flips true mid-game (the winning move / the
 *      out-of-time tick);
 *   3. stay dismissed after the user closes it — re-renders while the game is
 *      still terminal must NOT re-pop it.
 *
 * These pin the contract before the lint-driven refactor away from a
 * set-state-in-effect to the render-time previous-value pattern, so the
 * behavior is provably preserved.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useTerminalModal } from './useTerminalModal'

describe('useTerminalModal', () => {
  it('opens immediately when the game is already terminal on mount', () => {
    const { result } = renderHook(() => useTerminalModal(true))
    expect(result.current.showModal).toBe(true)
  })

  it('stays closed while the game is in progress', () => {
    const { result } = renderHook(() => useTerminalModal(false))
    expect(result.current.showModal).toBe(false)
  })

  it('pops the modal when isTerminal flips true mid-game', () => {
    const { result, rerender } = renderHook(
      ({ isTerminal }: { isTerminal: boolean }) => useTerminalModal(isTerminal),
      { initialProps: { isTerminal: false } },
    )
    expect(result.current.showModal).toBe(false)

    rerender({ isTerminal: true })
    expect(result.current.showModal).toBe(true)
  })

  it('stays dismissed after closeModal across later re-renders while still terminal', () => {
    const { result, rerender } = renderHook(
      ({ isTerminal }: { isTerminal: boolean }) => useTerminalModal(isTerminal),
      { initialProps: { isTerminal: false } },
    )

    rerender({ isTerminal: true })
    expect(result.current.showModal).toBe(true)

    act(() => result.current.closeModal())
    expect(result.current.showModal).toBe(false)

    // A re-render while the game is STILL terminal must not re-pop the modal —
    // the action-slot indicator carries the lasting cue from here on.
    rerender({ isTerminal: true })
    expect(result.current.showModal).toBe(false)
  })

  it('closeModal closes an open modal', () => {
    const { result } = renderHook(() => useTerminalModal(true))
    expect(result.current.showModal).toBe(true)

    act(() => result.current.closeModal())
    expect(result.current.showModal).toBe(false)
  })
})
