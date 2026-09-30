// cs-blessed-chat

/**
 * Tests for useIsChatPanelOpen. The store is small but it is the only place
 * the panel's open state is shared between the header's `<ChatButton>`, the
 * `/` action and `<Chat>` itself — a regression in the notify path would
 * silently desync them.
 *
 * Out of scope: the module-load-time read of `isChatPanelOpen` from
 * localStorage. To test it cleanly we'd need to re-import the module per test
 * (or use vi.resetModules), which adds machinery that doesn't fit the rest of
 * the suite's shape.
 */

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeStorage, type InstalledStorage } from '../web-storage/storage.fake'
import {
  getIsChatPanelOpen,
  setIsChatPanelOpen,
  useIsChatPanelOpen,
} from './useIsChatPanelOpen'

let storage: InstalledStorage

beforeAll(() => {
  storage = installFakeStorage()
})

beforeEach(() => {
  // Reset the store to a known starting state. The module is loaded once
  // across the whole test file (module-level `let isChatPanelOpen`), so we
  // explicitly drive it false before each test rather than relying on test
  // order.
  setIsChatPanelOpen(false)
  storage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useIsChatPanelOpen — direct API', () => {
  it('getIsChatPanelOpen reflects setIsChatPanelOpen writes', () => {
    expect(getIsChatPanelOpen()).toBe(false)
    setIsChatPanelOpen(true)
    expect(getIsChatPanelOpen()).toBe(true)
    setIsChatPanelOpen(false)
    expect(getIsChatPanelOpen()).toBe(false)
  })

  it('mirrors changes to storage', () => {
    setIsChatPanelOpen(true)
    expect(storage.local.getItem('puzpuzpuz:chat:panel-open')).toBe('true')
    setIsChatPanelOpen(false)
    expect(storage.local.getItem('puzpuzpuz:chat:panel-open')).toBe('false')
  })

  it('setIsChatPanelOpen with the same value is a no-op (skips notify + write)', () => {
    setIsChatPanelOpen(true)
    const setItem = vi.spyOn(storage.local, 'setItem')
    setIsChatPanelOpen(true)
    expect(setItem).not.toHaveBeenCalled()
  })

  // The value flip and the subscriber notify still happen when persistence
  // fails — a chat-open desync within a session is worse than losing the
  // cross-page persistence. Both ways storage fails are here, because they
  // throw in different places (`storage.fake.ts` says why).
  it('survives the storage CALLS throwing — a full quota', () => {
    storage.failCalls()
    expect(() => setIsChatPanelOpen(true)).not.toThrow()
    expect(getIsChatPanelOpen()).toBe(true)
  })

  it('survives the storage ACCESS throwing — a browser blocking site data', () => {
    storage.blockAccess()
    expect(() => setIsChatPanelOpen(true)).not.toThrow()
    expect(getIsChatPanelOpen()).toBe(true)
  })
})

describe('useIsChatPanelOpen — the hook', () => {
  it('returns the current value on mount', () => {
    setIsChatPanelOpen(true)
    const { result } = renderHook(() => useIsChatPanelOpen())
    expect(result.current).toBe(true)
  })

  it('re-renders when setIsChatPanelOpen flips the value', () => {
    const { result } = renderHook(() => useIsChatPanelOpen())
    expect(result.current).toBe(false)
    act(() => setIsChatPanelOpen(true))
    expect(result.current).toBe(true)
    act(() => setIsChatPanelOpen(false))
    expect(result.current).toBe(false)
  })

  it('does NOT re-render when setIsChatPanelOpen writes the same value', () => {
    let renderCount = 0
    renderHook(() => {
      renderCount += 1
      return useIsChatPanelOpen()
    })
    const baseline = renderCount
    act(() => setIsChatPanelOpen(false)) // already false
    expect(renderCount).toBe(baseline)
  })

  it('two hooks see each other`s updates (shared store)', () => {
    const { result: a } = renderHook(() => useIsChatPanelOpen())
    const { result: b } = renderHook(() => useIsChatPanelOpen())
    expect(a.current).toBe(false)
    expect(b.current).toBe(false)

    act(() => setIsChatPanelOpen(true))
    expect(a.current).toBe(true)
    expect(b.current).toBe(true)
  })

  it('unsubscribes on unmount so a later write does not crash', () => {
    const { unmount } = renderHook(() => useIsChatPanelOpen())
    unmount()
    // No throw + no leaked subscriber that would touch a
    // disposed React tree.
    expect(() => setIsChatPanelOpen(true)).not.toThrow()
  })
})
