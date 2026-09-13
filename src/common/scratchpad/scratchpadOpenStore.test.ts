// cs-audited-scratchpad

/**
 * Tests for scratchpadOpenStore. The store is small but it is the only place
 * the scratchpad-open state is shared between the header's
 * `<ScratchpadButton>` and `<GameScratchpadCompanion>` — a regression in the
 * notify path would silently desync them.
 *
 * Out of scope: the module-load-time `readInitial()` from localStorage, which
 * would need the module re-imported per test.
 */

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeStorage, type InstalledStorage } from '../web-storage/storage.fake'
import { getScratchpadOpen, setScratchpadOpen, useIsScratchpadOpen } from './scratchpadOpenStore'

let storage: InstalledStorage

beforeAll(() => {
  storage = installFakeStorage()
})

beforeEach(() => {
  // The module is loaded once across the file, so drive it to a known state
  // rather than relying on test order.
  setScratchpadOpen(false)
  storage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('scratchpadOpenStore — direct API', () => {
  it('getScratchpadOpen reflects setScratchpadOpen writes', () => {
    expect(getScratchpadOpen()).toBe(false)
    setScratchpadOpen(true)
    expect(getScratchpadOpen()).toBe(true)
    setScratchpadOpen(false)
    expect(getScratchpadOpen()).toBe(false)
  })

  it('mirrors changes to storage', () => {
    setScratchpadOpen(true)
    expect(storage.local.getItem('puzpuzpuz:scratchpad:open')).toBe('1')
    setScratchpadOpen(false)
    expect(storage.local.getItem('puzpuzpuz:scratchpad:open')).toBe('0')
  })

  it('setScratchpadOpen with the same value is a no-op (skips notify + write)', () => {
    setScratchpadOpen(true)
    const setItem = vi.spyOn(storage.local, 'setItem')
    setScratchpadOpen(true)
    expect(setItem).not.toHaveBeenCalled()
  })

  // The value flip and the subscriber notify still happen when persistence
  // fails — a desync within a session is worse than losing the cross-page
  // persistence. Both ways storage fails are here, because they throw in
  // different places (`storage.fake.ts` says why).
  it('survives the storage CALLS throwing — a full quota', () => {
    storage.failCalls()
    expect(() => setScratchpadOpen(true)).not.toThrow()
    expect(getScratchpadOpen()).toBe(true)
  })

  it('survives the storage ACCESS throwing — a browser blocking site data', () => {
    storage.blockAccess()
    expect(() => setScratchpadOpen(true)).not.toThrow()
    expect(getScratchpadOpen()).toBe(true)
  })
})

describe('scratchpadOpenStore — useIsScratchpadOpen hook', () => {
  it('returns the current value on mount', () => {
    setScratchpadOpen(true)
    const { result } = renderHook(() => useIsScratchpadOpen())
    expect(result.current).toBe(true)
  })

  it('re-renders when setScratchpadOpen flips the value', () => {
    const { result } = renderHook(() => useIsScratchpadOpen())
    expect(result.current).toBe(false)
    act(() => setScratchpadOpen(true))
    expect(result.current).toBe(true)
    act(() => setScratchpadOpen(false))
    expect(result.current).toBe(false)
  })

  it('does NOT re-render when setScratchpadOpen writes the same value', () => {
    let renderCount = 0
    renderHook(() => {
      renderCount += 1
      return useIsScratchpadOpen()
    })
    const baseline = renderCount
    act(() => setScratchpadOpen(false)) // already false
    expect(renderCount).toBe(baseline)
  })

  it('two hooks see each other`s updates (shared store)', () => {
    const { result: a } = renderHook(() => useIsScratchpadOpen())
    const { result: b } = renderHook(() => useIsScratchpadOpen())
    expect(a.current).toBe(false)
    expect(b.current).toBe(false)

    act(() => setScratchpadOpen(true))
    expect(a.current).toBe(true)
    expect(b.current).toBe(true)
  })

  it('unsubscribes on unmount so a later write does not crash', () => {
    const { unmount } = renderHook(() => useIsScratchpadOpen())
    unmount()
    expect(() => setScratchpadOpen(true)).not.toThrow()
  })
})
