// cs-blessed-mobile

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useVisualViewport } from './useVisualViewport'

/**
 * jsdom has no `visualViewport`, so the fake below is what the hook reads. It
 * keeps its listeners, because two of the cases here are about a notification
 * arriving, and it lets the metrics be changed the way a keyboard opening or an
 * iOS focus-scroll changes them.
 *
 * The cases pin the branches — the two events, which mean different things, and
 * the fallback every jsdom render takes — plus one property that is not a
 * branch at all: "hands back the same object", which is what keeps the hook
 * from looping.
 */

type Listener = () => void

function installVisualViewport(height: number, offsetTop = 0) {
  const listeners = new Map<string, Set<Listener>>()
  const vv = {
    height,
    offsetTop,
    addEventListener: (type: string, fn: Listener) => {
      const set = listeners.get(type) ?? new Set<Listener>()
      set.add(fn)
      listeners.set(type, set)
    },
    removeEventListener: (type: string, fn: Listener) => listeners.get(type)?.delete(fn),
  }
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    writable: true,
    value: vv,
  })
  return {
    /** Change the metrics and fire one event, as the browser would. */
    emit(type: 'resize' | 'scroll', next: { height?: number; offsetTop?: number }) {
      if (next.height !== undefined) vv.height = next.height
      if (next.offsetTop !== undefined) vv.offsetTop = next.offsetTop
      for (const fn of listeners.get(type) ?? []) fn()
    },
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
  }
}

function uninstallVisualViewport() {
  delete (window as { visualViewport?: unknown }).visualViewport
}

afterEach(uninstallVisualViewport)

describe('useVisualViewport', () => {
  it('reports the visible region, not the layout viewport', () => {
    installVisualViewport(500, 40)
    expect(renderHook(() => useVisualViewport()).result.current).toEqual({
      height: 500,
      offsetTop: 40,
    })
  })

  it('hands back the SAME object while nothing has changed', () => {
    installVisualViewport(500)
    const { result, rerender } = renderHook(() => useVisualViewport())
    const first = result.current

    rerender()

    // Not a value check — an IDENTITY check. `useSyncExternalStore` compares
    // snapshots with `Object.is`, so a `getSnapshot` building a fresh object
    // each call reports a new store value on every render and never settles;
    // the module-level cache in the hook is what prevents that, and reads as a
    // mere optimization if you don't know this.
    //
    // React catches that break itself — every case in this file then dies with
    // "Maximum update depth exceeded" (checked by planting it). This case is
    // what turns that pile-up into a sentence: the object identity changed.
    expect(result.current).toBe(first)
  })

  it('updates when the keyboard opens (resize)', () => {
    const vv = installVisualViewport(800)
    const { result } = renderHook(() => useVisualViewport())

    act(() => vv.emit('resize', { height: 420 }))
    expect(result.current.height).toBe(420)
  })

  it('updates when iOS shifts the visible region (scroll)', () => {
    const vv = installVisualViewport(800)
    const { result } = renderHook(() => useVisualViewport())

    // Same height, different origin: the page scrolled under the viewport to
    // keep a focused field visible. A hook listening only for `resize` reports a
    // sheet position that drifts off the top of the screen.
    act(() => vv.emit('scroll', { offsetTop: 120 }))
    expect(result.current).toEqual({ height: 800, offsetTop: 120 })
  })

  it('falls back to the layout viewport where visualViewport is missing', () => {
    // The branch every jsdom render in the repo takes, and every browser too old
    // to have the API. There is no keyboard to account for in either.
    expect(renderHook(() => useVisualViewport()).result.current).toEqual({
      height: window.innerHeight,
      offsetTop: 0,
    })
  })
})
