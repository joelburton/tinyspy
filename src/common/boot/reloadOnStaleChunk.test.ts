// cs-audited-boot

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeStorage, type InstalledStorage } from '../web-storage/storage.fake'
import { reloadOnStaleChunk } from './reloadOnStaleChunk'

/**
 * The stale-deploy recovery contract: the first `vite:preloadError` reloads
 * (and swallows the import error), but a second failure inside the guard
 * window does NOT — it must fall through and throw, so a genuine outage lands
 * in PlayAreaErrorBoundary's card instead of a reload loop.
 *
 * jsdom's `location.reload` is non-configurable, so the whole `location` is
 * swapped for a stub for the duration.
 */
describe('reloadOnStaleChunk', () => {
  const realLocation = window.location
  let reload: ReturnType<typeof vi.fn>
  let dispose: AbortController
  let storage: InstalledStorage

  beforeAll(() => {
    storage = installFakeStorage()
  })

  beforeEach(() => {
    reload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...realLocation, reload },
      writable: true,
      configurable: true,
    })
    storage.clear()
    // Isolate each test's listener — reloadOnStaleChunk registers on window
    // for the page's lifetime, which in vitest is the whole file's lifetime.
    dispose = new AbortController()
    const realAdd = window.addEventListener.bind(window)
    vi.spyOn(window, 'addEventListener').mockImplementation((type, cb, opts) =>
      realAdd(type, cb, { ...(typeof opts === 'object' ? opts : {}), signal: dispose.signal }),
    )
  })

  afterEach(() => {
    dispose.abort()
    vi.restoreAllMocks()
    Object.defineProperty(window, 'location', {
      value: realLocation,
      writable: true,
      configurable: true,
    })
  })

  function firePreloadError() {
    const event = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(event)
    return event
  }

  it('reloads on the first chunk failure and swallows the error', () => {
    reloadOnStaleChunk()
    const event = firePreloadError()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('does NOT reload again inside the guard window — the error propagates', () => {
    reloadOnStaleChunk()
    firePreloadError()
    const second = firePreloadError()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(second.defaultPrevented).toBe(false)
  })

  it('does NOT reload when the browser blocks site data — it fails closed', () => {
    // The counter cannot count, so the recovery is given up rather than run
    // uncounted: an uncounted reload is a reload loop on a real outage, which
    // is the exact thing the counter is here to prevent.
    //
    // `blockAccess` throws from the PROPERTY, which is what a browser blocking
    // site data does and what `storage.ts` names its storages for; the spy is
    // undone by the `restoreAllMocks` below.
    storage.blockAccess()
    reloadOnStaleChunk()
    const event = firePreloadError()
    expect(reload).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('reloads again once the guard window has passed', () => {
    vi.useFakeTimers()
    try {
      reloadOnStaleChunk()
      firePreloadError()
      vi.setSystemTime(Date.now() + 61_000)
      firePreloadError()
      expect(reload).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
