// cs-unmet

/**
 * Tests for useHistoryViewer — the cross-column coordination state every
 * turn-log game shares (scrabble, stackdown, waffle, connections, …). The
 * subtle, intrinsic-to-the-hook behavior is the document-level
 * click-anywhere-to-exit that EXCLUDES the turn-# handles (so you can switch
 * turns without leaving the viewer), plus the modifier-aware exitOnKey. Those
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
    expect(result.current.viewingId).toBeNull()
    expect(result.current.viewing).toBe(false)
  })

  it('select opens a turn; exitViewing returns to live', () => {
    const { result } = renderHook(() => useHistoryViewer())

    act(() => result.current.select(3))
    expect(result.current.viewingId).toBe(3)
    expect(result.current.viewing).toBe(true)

    act(() => result.current.exitViewing())
    expect(result.current.viewingId).toBeNull()
    expect(result.current.viewing).toBe(false)
  })

  it('keeps viewingIdRef in sync with viewingId', () => {
    const { result } = renderHook(() => useHistoryViewer())
    expect(result.current.viewingIdRef.current).toBeNull()

    act(() => result.current.select(5))
    expect(result.current.viewingIdRef.current).toBe(5)
  })

  it('a click anywhere returns to live while viewing', () => {
    const { result } = renderHook(() => useHistoryViewer())
    act(() => result.current.select(2))

    const elsewhere = document.createElement('div')
    document.body.appendChild(elsewhere)
    act(() => elsewhere.click())

    expect(result.current.viewingId).toBeNull()
  })

  it('a click on a turn-# handle does NOT exit (so you can switch turns)', () => {
    const { result } = renderHook(() => useHistoryViewer())
    act(() => result.current.select(2))

    // The shared <TurnLogNumber> marks its handles with data-turn-number.
    const handle = document.createElement('button')
    handle.setAttribute('data-turn-number', '4')
    const inner = document.createElement('span') // clicking a child still counts (closest)
    handle.appendChild(inner)
    document.body.appendChild(handle)
    act(() => inner.click())

    expect(result.current.viewingId).toBe(2)
  })

  it('does not arm the document listener when live (a stray click is a no-op)', () => {
    const { result } = renderHook(() => useHistoryViewer())
    const elsewhere = document.createElement('div')
    document.body.appendChild(elsewhere)
    act(() => elsewhere.click())
    expect(result.current.viewingId).toBeNull() // still live, no crash
  })

  it('exitOnKey: consumes an unmodified key while viewing and returns to live', () => {
    const { result } = renderHook(() => useHistoryViewer())
    act(() => result.current.select(1))

    let consumed = false
    act(() => {
      consumed = result.current.exitOnKey(new KeyboardEvent('keydown', { key: 'a' }))
    })
    expect(consumed).toBe(true)
    expect(result.current.viewingId).toBeNull()
  })

  it('exitOnKey: ignores a key when live', () => {
    const { result } = renderHook(() => useHistoryViewer())
    let consumed = true
    act(() => {
      consumed = result.current.exitOnKey(new KeyboardEvent('keydown', { key: 'a' }))
    })
    expect(consumed).toBe(false)
  })

  it('exitOnKey: leaves a modified key (e.g. Cmd+key) for the game to handle', () => {
    const { result } = renderHook(() => useHistoryViewer())
    act(() => result.current.select(1))

    let consumed = true
    act(() => {
      consumed = result.current.exitOnKey(new KeyboardEvent('keydown', { key: 'z', metaKey: true }))
    })
    expect(consumed).toBe(false)
    expect(result.current.viewingId).toBe(1) // still viewing — Cmd+Z is the game's
  })
})

/** The same "any key returns to live", reached the way a converted game reaches
 *  it: a real window keydown, the app-root dispatcher, `act-exit-viewer`. A game
 *  on bound actions wires nothing, so this path is the only thing holding the
 *  behavior up for it. */
describe('useHistoryViewer — act-exit-viewer', () => {
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
    act(() => result.current.select(1))

    await press()
    expect(result.current.viewingId).toBeNull()
  })

  it('is hidden when live, so a key is left for the board', () => {
    const { result } = renderHook(() => {
      useActionDispatcher()
      return useHistoryViewer()
    })

    const exit = () => liveBindings().find((b) => b.id === 'act-exit-viewer')
    expect(exit()?.describe().state).toBe('hidden')

    act(() => result.current.select(1))
    expect(exit()?.describe().state).toBe('active')
  })
})
