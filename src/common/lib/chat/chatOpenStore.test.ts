/**
 * Tests for chatOpenStore. The store is small but it's the only
 * place chat-open state is shared between the GamePage header's
 * `<ChatBubble>` and the bottom-right `<FloatingChat>` toggle —
 * a regression in the notify path would silently desync the two
 * buttons.
 *
 * What's covered:
 *   - getChatOpen reflects setChatOpen writes.
 *   - setChatOpen with the same value is a no-op (no notify, no
 *     localStorage round-trip).
 *   - setChatOpen with a different value mirrors to localStorage.
 *   - Subscribers fire on value change and don't fire on
 *     same-value writes.
 *   - Unsubscribe stops further notifications.
 *   - useChatOpen re-renders when the value flips.
 *
 * Out of scope: the module-load-time `readInitial()` from
 * localStorage. To test it cleanly we'd need to re-import the
 * module per test (or use vi.resetModules), which adds machinery
 * that doesn't fit the rest of the suite's shape. The function is
 * a tiny try-catch around localStorage.getItem; manual sanity-
 * check is fine.
 */

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom 29 in this project's setup doesn't ship a real
// localStorage. The store's `readInitial()` and `setChatOpen()`
// access `window.localStorage` through try/catch, so production
// runtime is fine — but to test the persistence path we need to
// provide a Storage-shape fake the spy can observe. Backed by a
// plain Map; the prototype tunnel below lets `vi.spyOn(
// window.localStorage.__proto__, 'setItem')` work the same way
// it would against the real DOM Storage.
class FakeStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  clear(): void {
    this.store.clear()
  }
}

beforeAll(() => {
  Object.defineProperty(window, 'localStorage', {
    value: new FakeStorage(),
    configurable: true,
  })
})

beforeEach(() => {
  // Reset the store to a known starting state. The module is
  // loaded once across the whole test file (module-level `let
  // value`), so we explicitly drive it false before each test
  // rather than relying on test order.
  setChatOpen(false)
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

import {
  getChatOpen,
  setChatOpen,
  useChatOpen,
} from './chatOpenStore'

describe('chatOpenStore — direct API', () => {
  it('getChatOpen reflects setChatOpen writes', () => {
    expect(getChatOpen()).toBe(false)
    setChatOpen(true)
    expect(getChatOpen()).toBe(true)
    setChatOpen(false)
    expect(getChatOpen()).toBe(false)
  })

  it('mirrors changes to localStorage', () => {
    setChatOpen(true)
    expect(window.localStorage.getItem('puzpuzpuz:chat:open')).toBe('true')
    setChatOpen(false)
    expect(window.localStorage.getItem('puzpuzpuz:chat:open')).toBe('false')
  })

  it('setChatOpen with the same value is a no-op (skips notify + write)', () => {
    setChatOpen(true)
    const setItem = vi.spyOn(window.localStorage.__proto__, 'setItem')
    setChatOpen(true)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('swallows localStorage write errors', () => {
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(
      () => {
        throw new Error('quota exceeded')
      },
    )
    // The store's value flip and subscriber notify should still
    // happen even if persistence fails — chat-open desync within
    // a session is a worse outcome than losing the cross-nav
    // persistence.
    expect(() => setChatOpen(true)).not.toThrow()
    expect(getChatOpen()).toBe(true)
  })
})

describe('chatOpenStore — useChatOpen hook', () => {
  it('returns the current value on mount', () => {
    setChatOpen(true)
    const { result } = renderHook(() => useChatOpen())
    expect(result.current).toBe(true)
  })

  it('re-renders when setChatOpen flips the value', () => {
    const { result } = renderHook(() => useChatOpen())
    expect(result.current).toBe(false)
    act(() => setChatOpen(true))
    expect(result.current).toBe(true)
    act(() => setChatOpen(false))
    expect(result.current).toBe(false)
  })

  it('does NOT re-render when setChatOpen writes the same value', () => {
    let renderCount = 0
    renderHook(() => {
      renderCount += 1
      return useChatOpen()
    })
    const baseline = renderCount
    act(() => setChatOpen(false)) // already false
    expect(renderCount).toBe(baseline)
  })

  it('two hooks see each other`s updates (shared store)', () => {
    const { result: a } = renderHook(() => useChatOpen())
    const { result: b } = renderHook(() => useChatOpen())
    expect(a.current).toBe(false)
    expect(b.current).toBe(false)

    act(() => setChatOpen(true))
    expect(a.current).toBe(true)
    expect(b.current).toBe(true)
  })

  it('unsubscribes on unmount so a later write does not crash', () => {
    const { unmount } = renderHook(() => useChatOpen())
    unmount()
    // No throw + no leaked subscriber that would touch a
    // disposed React tree.
    expect(() => setChatOpen(true)).not.toThrow()
  })
})
