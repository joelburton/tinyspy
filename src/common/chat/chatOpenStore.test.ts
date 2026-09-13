// cs-audited-chat

/**
 * Tests for chatOpenStore. The store is small but it is the only place the
 * chat-open state is shared between the header's `<ChatButton>`, the `/`
 * action and `<Chat>` itself — a regression in the notify path would silently
 * desync them.
 *
 * Out of scope: the module-load-time `readInitial()` from localStorage. To
 * test it cleanly we'd need to re-import the module per test (or use
 * vi.resetModules), which adds machinery that doesn't fit the rest of the
 * suite's shape.
 */

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeStorage, type InstalledStorage } from '../web-storage/storage.fake'
import {
  getChatOpen,
  registerChatMounted,
  setChatOpen,
  useChatMounted,
  useChatOpen,
} from './chatOpenStore'

let storage: InstalledStorage

beforeAll(() => {
  storage = installFakeStorage()
})

beforeEach(() => {
  // Reset the store to a known starting state. The module is loaded once
  // across the whole test file (module-level `let value`), so we explicitly
  // drive it false before each test rather than relying on test order.
  setChatOpen(false)
  storage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('chatOpenStore — direct API', () => {
  it('getChatOpen reflects setChatOpen writes', () => {
    expect(getChatOpen()).toBe(false)
    setChatOpen(true)
    expect(getChatOpen()).toBe(true)
    setChatOpen(false)
    expect(getChatOpen()).toBe(false)
  })

  it('mirrors changes to storage', () => {
    setChatOpen(true)
    expect(storage.local.getItem('puzpuzpuz:chat:open')).toBe('true')
    setChatOpen(false)
    expect(storage.local.getItem('puzpuzpuz:chat:open')).toBe('false')
  })

  it('setChatOpen with the same value is a no-op (skips notify + write)', () => {
    setChatOpen(true)
    const setItem = vi.spyOn(storage.local, 'setItem')
    setChatOpen(true)
    expect(setItem).not.toHaveBeenCalled()
  })

  // The value flip and the subscriber notify still happen when persistence
  // fails — a chat-open desync within a session is worse than losing the
  // cross-page persistence. Both ways storage fails are here, because they
  // throw in different places (`storage.fake.ts` says why).
  it('survives the storage CALLS throwing — a full quota', () => {
    storage.failCalls()
    expect(() => setChatOpen(true)).not.toThrow()
    expect(getChatOpen()).toBe(true)
  })

  it('survives the storage ACCESS throwing — a browser blocking site data', () => {
    storage.blockAccess()
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

describe('chatOpenStore — is a chat panel mounted', () => {
  it("follows a chat panel's lifetime, and re-renders a reader either way", () => {
    const { result } = renderHook(() => useChatMounted())
    expect(result.current).toBe(false)
    let release = () => {}
    act(() => {
      release = registerChatMounted()
    })
    expect(result.current).toBe(true)
    act(() => release())
    expect(result.current).toBe(false)
  })

  it('counts panels, so the next page mounting before the last releases stays mounted', () => {
    const { result } = renderHook(() => useChatMounted())
    let releaseFirst = () => {}
    let releaseSecond = () => {}
    act(() => {
      releaseFirst = registerChatMounted()
      releaseSecond = registerChatMounted()
    })
    act(() => releaseFirst())
    expect(result.current).toBe(true)
    act(() => releaseSecond())
    expect(result.current).toBe(false)
  })
})
