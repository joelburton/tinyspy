// cs-blessed-scratchpad

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
import { ZTest_installFakeStorage, type ZTest_InstalledStorage } from '../web-storage/storage.fake'
import {
  getIsScratchpadOpen,
  setIsScratchpadOpen,
  useIsScratchpadOpen,
} from './scratchpadOpenStore'

let storage: ZTest_InstalledStorage

beforeAll(() => {
  storage = ZTest_installFakeStorage()
})

beforeEach(() => {
  // The module is loaded once across the file, so drive it to a known state
  // rather than relying on test order.
  setIsScratchpadOpen(false)
  storage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('scratchpadOpenStore — direct API', () => {
  it('getIsScratchpadOpen reflects setIsScratchpadOpen writes', () => {
    expect(getIsScratchpadOpen()).toBe(false)
    setIsScratchpadOpen(true)
    expect(getIsScratchpadOpen()).toBe(true)
    setIsScratchpadOpen(false)
    expect(getIsScratchpadOpen()).toBe(false)
  })

  it('mirrors changes to storage', () => {
    setIsScratchpadOpen(true)
    expect(storage.local.getItem('puzpuzpuz:scratchpad:open')).toBe('1')
    setIsScratchpadOpen(false)
    expect(storage.local.getItem('puzpuzpuz:scratchpad:open')).toBe('0')
  })

  it('setIsScratchpadOpen with the same value is a no-op (skips notify + write)', () => {
    setIsScratchpadOpen(true)
    const setItem = vi.spyOn(storage.local, 'setItem')
    setIsScratchpadOpen(true)
    expect(setItem).not.toHaveBeenCalled()
  })

  // The value flip and the subscriber notify still happen when persistence
  // fails — a desync within a session is worse than losing the cross-page
  // persistence. Both ways storage fails are here, because they throw in
  // different places (`storage.fake.ts` says why).
  it('survives the storage CALLS throwing — a full quota', () => {
    storage.failCalls()
    expect(() => setIsScratchpadOpen(true)).not.toThrow()
    expect(getIsScratchpadOpen()).toBe(true)
  })

  it('survives the storage ACCESS throwing — a browser blocking site data', () => {
    storage.blockAccess()
    expect(() => setIsScratchpadOpen(true)).not.toThrow()
    expect(getIsScratchpadOpen()).toBe(true)
  })
})

describe('scratchpadOpenStore — useIsScratchpadOpen hook', () => {
  it('returns the current value on mount', () => {
    setIsScratchpadOpen(true)
    const { result } = renderHook(() => useIsScratchpadOpen())
    expect(result.current).toBe(true)
  })

  it('re-renders when setIsScratchpadOpen flips the value', () => {
    const { result } = renderHook(() => useIsScratchpadOpen())
    expect(result.current).toBe(false)
    act(() => setIsScratchpadOpen(true))
    expect(result.current).toBe(true)
    act(() => setIsScratchpadOpen(false))
    expect(result.current).toBe(false)
  })

  it('does NOT re-render when setIsScratchpadOpen writes the same value', () => {
    let renderCount = 0
    renderHook(() => {
      renderCount += 1
      return useIsScratchpadOpen()
    })
    const baseline = renderCount
    act(() => setIsScratchpadOpen(false)) // already false
    expect(renderCount).toBe(baseline)
  })

  it('two hooks see each other`s updates (shared store)', () => {
    const { result: a } = renderHook(() => useIsScratchpadOpen())
    const { result: b } = renderHook(() => useIsScratchpadOpen())
    expect(a.current).toBe(false)
    expect(b.current).toBe(false)

    act(() => setIsScratchpadOpen(true))
    expect(a.current).toBe(true)
    expect(b.current).toBe(true)
  })

  it('unsubscribes on unmount so a later write does not crash', () => {
    const { unmount } = renderHook(() => useIsScratchpadOpen())
    unmount()
    expect(() => setIsScratchpadOpen(true)).not.toThrow()
  })
})
