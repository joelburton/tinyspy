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
