// cs-met-turn-log

/**
 * Tests for useHistoryViewer — the cross-column coordination state every
 * turn-log game shares (scrabble, stackdown, waffle, connections, …). The
 * subtle, intrinsic-to-the-hook behavior is the document-level
 * click-anywhere-to-exit that EXCLUDES the turn-# handles (so you can switch
 * turns without leaving the viewer), plus the any-key `act-exit-history`. Those
 * are wired once here, so a regression hits every consumer at once.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useHistoryViewer } from './useHistoryViewer'
import { useActionDispatcher } from '../actions/dispatcher'
import { liveBindings } from '../actions/useBoundAction'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useHistoryViewer', () => {
  it('starts live (nothing being viewed)', () => {
    const { result } = renderHook(() => useHistoryViewer())
    expect(result.current.historyId).toBeNull()
    expect(result.current.isViewingHistory).toBe(false)
  })

  it('select opens a turn; exitHistory returns to live', () => {
    const { result } = renderHook(() => useHistoryViewer())

    act(() => result.current.showHistory(3))
    expect(result.current.historyId).toBe(3)
    expect(result.current.isViewingHistory).toBe(true)

    act(() => result.current.exitHistory())
    expect(result.current.historyId).toBeNull()
    expect(result.current.isViewingHistory).toBe(false)
  })

  it('keeps historyIdRef in sync with historyId', () => {
    const { result } = renderHook(() => useHistoryViewer())
    expect(result.current.historyIdRef.current).toBeNull()

    act(() => result.current.showHistory(5))
    expect(result.current.historyIdRef.current).toBe(5)
  })

  it('a click anywhere returns to live while viewing', () => {
    const { result } = renderHook(() => useHistoryViewer())
    act(() => result.current.showHistory(2))

    const elsewhere = document.createElement('div')
    document.body.appendChild(elsewhere)
    act(() => elsewhere.click())

    expect(result.current.historyId).toBeNull()
  })

  it('a click on a turn-# handle does NOT exit (so you can switch turns)', () => {
    const { result } = renderHook(() => useHistoryViewer())
    act(() => result.current.showHistory(2))

    // The shared <TurnLogNumber> marks its handles with data-turn-number.
    const handle = document.createElement('button')
    handle.setAttribute('data-turn-number', '4')
    const inner = document.createElement('span') // clicking a child still counts (closest)
    handle.appendChild(inner)
    document.body.appendChild(handle)
    act(() => inner.click())

    expect(result.current.historyId).toBe(2)
  })

  it('does not arm the document listener when live (a stray click is a no-op)', () => {
    const { result } = renderHook(() => useHistoryViewer())
    const elsewhere = document.createElement('div')
    document.body.appendChild(elsewhere)
    act(() => elsewhere.click())
    expect(result.current.historyId).toBeNull() // still live, no crash
  })
})

/** "Any key returns to live", reached the way a game reaches it: a real window
 *  keydown, the app-root dispatcher, `act-exit-history`. A game wires nothing,
 *  so this path is the only thing holding the behavior up. */
describe('useHistoryViewer — act-exit-history', () => {
  /** Awaited: an action's run settles a microtask after the key. */
  async function press(init: KeyboardEventInit = {}) {
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, ...init }))
    })
  }

  it('a bare key returns to live', async () => {
    const { result } = renderHook(() => {
      useActionDispatcher()
      return useHistoryViewer()
    })
    act(() => result.current.showHistory(1))

    await press()
    expect(result.current.historyId).toBeNull()
  })

  it('is hidden when live, so a key is left for the board', () => {
    const { result } = renderHook(() => {
      useActionDispatcher()
      return useHistoryViewer()
    })

    const exit = () => liveBindings().find((b) => b.id === 'act-exit-history')
    expect(exit()?.describe('button').state).toBe('hidden')

    act(() => result.current.showHistory(1))
    expect(exit()?.describe('button').state).toBe('active')
  })
})
