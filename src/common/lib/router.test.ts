/**
 * Tests for the hand-rolled router. Verifies the contract callers
 * depend on:
 *
 *   1. `usePath()` returns `window.location.pathname` at mount.
 *   2. `usePath()` re-renders when `navigate()` is called (i.e. the
 *      synthetic popstate dispatch reaches subscribers).
 *   3. `usePath()` re-renders on a real `popstate` event (back/forward
 *      buttons in the wild).
 *   4. `navigate(to)` updates the URL via pushState; `navigate(to, true)`
 *      via replaceState.
 *
 * Strategy: jsdom (set in vite.config.ts) gives us a working
 * `window.location`, `window.history`, and `window.dispatchEvent`.
 * We reset the URL between tests via `replaceState` to avoid
 * cross-test pollution.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navigate, usePath } from './router'

// Restore the URL bar to `/` between tests so each one starts from a
// known state. `replaceState` (not `pushState`) avoids polluting the
// history stack.
beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('usePath', () => {
  it('returns the current pathname at mount', () => {
    window.history.replaceState(null, '', '/c/joel-leah')
    const { result } = renderHook(() => usePath())
    expect(result.current).toBe('/c/joel-leah')
  })

  it('updates when navigate() is called (synthetic popstate)', () => {
    const { result } = renderHook(() => usePath())
    expect(result.current).toBe('/')

    act(() => {
      navigate('/g/abc-123')
    })

    expect(result.current).toBe('/g/abc-123')
  })

  it('updates on a native popstate event (back/forward button)', () => {
    const { result } = renderHook(() => usePath())

    // Simulate the browser firing popstate (as it does on
    // back/forward) — we pushState manually first so the URL
    // matches what the browser would have restored.
    act(() => {
      window.history.pushState(null, '', '/c/some-club')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(result.current).toBe('/c/some-club')
  })
})

describe('navigate', () => {
  it('pushes a new history entry by default', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')
    navigate('/g/some-id')
    expect(pushSpy).toHaveBeenCalledWith(null, '', '/g/some-id')
    expect(window.location.pathname).toBe('/g/some-id')
  })

  it('replaces the current entry when replace=true', () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    const pushSpy = vi.spyOn(window.history, 'pushState')
    navigate('/g/some-id', true)
    expect(replaceSpy).toHaveBeenCalledWith(null, '', '/g/some-id')
    expect(pushSpy).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/g/some-id')
  })

  it('dispatches a popstate so usePath subscribers re-render', () => {
    const popstateListener = vi.fn()
    window.addEventListener('popstate', popstateListener)
    navigate('/c/jacobs')
    expect(popstateListener).toHaveBeenCalledTimes(1)
    window.removeEventListener('popstate', popstateListener)
  })
})
