// cs-fixed-deep

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  beforeEach(() => {
    reload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...realLocation, reload },
      writable: true,
      configurable: true,
    })
    sessionStorage.clear()
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

  it('does NOT reload when sessionStorage is unavailable — it fails closed', () => {
    // A browser blocking site data throws on the read. The counter cannot
    // count, so the recovery is given up rather than run uncounted: an
    // uncounted reload is a reload loop on a real outage, which is the exact
    // thing the counter is here to prevent.
    //
    // The whole accessor is swapped, not spied: jsdom implements `Storage` as
    // a proxy, so `vi.spyOn(sessionStorage, 'getItem')` defines a property the
    // proxy does not serve and the real method still runs.
    const real = window.sessionStorage
    const blocked = () => {
      throw new Error('site data blocked')
    }
    Object.defineProperty(window, 'sessionStorage', {
      value: { getItem: blocked, setItem: blocked },
      configurable: true,
    })
    try {
      reloadOnStaleChunk()
      const event = firePreloadError()
      expect(reload).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
    } finally {
      Object.defineProperty(window, 'sessionStorage', { value: real, configurable: true })
    }
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
