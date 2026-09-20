// cs-unmet

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeStorage, type InstalledStorage } from '../web-storage/storage.fake'
import { installFakeReload, type FakeReload } from './reload.fake'
import { consumeReloadForUpdate } from './reloadNotice'
import { BUILD_STAMP, reloadIfStaleBuild, watchForStaleBuild, type BuildStamp } from './reloadOnStaleBuild'

// Every other test sees a stub of this module (src/test-setup.ts); this one is
// about the real thing.
vi.unmock('./reloadOnStaleBuild')

/**
 * The stale-build contract: a deployed stamp that is not this tab's reloads the
 * page once and leaves the reload note; the same stamp never reloads twice; a
 * tab that cannot learn the stamp — dev's HTML, a failed request, storage that
 * cannot count — does nothing; and the return trigger asks at most once per
 * floor while the one-off triggers always ask.
 *
 * `fetch` is stubbed per case to answer with a stamp, and `location` is
 * stubbed throughout; see `reload.fake.ts`.
 */
describe('reloadOnStaleBuild', () => {
  let location: FakeReload
  let storage: InstalledStorage
  const OTHER: BuildStamp = { built: '2099-01-01T00:00:00.000Z', sha: 'abc1234' }

  beforeAll(() => {
    storage = installFakeStorage()
  })

  // Each case starts past the floor — the module's last-checked clock is per
  // tab, which in vitest is per file, and a case must not inherit the last one's.
  let clock = Date.now()

  beforeEach(() => {
    location = installFakeReload()
    storage.clear()
    vi.useFakeTimers()
    clock += 10 * 60_000
    vi.setSystemTime(clock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks() // undoes `blockAccess` and the listener spies
    location.restore()
  })

  /** Answer `/version.json` with `body`, as JSON, or with a failed request. */
  function serve(body: unknown, opts: { ok?: boolean; reject?: boolean } = {}) {
    const fetch = vi.fn(async () => {
      if (opts.reject) throw new TypeError('offline')
      return { ok: opts.ok ?? true, json: async () => body } as Response
    })
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  it('reloads once for a stamp that is not this build, and leaves the note', async () => {
    serve(OTHER)
    expect(await reloadIfStaleBuild('game-page')).toBe(true)
    expect(location.reload).toHaveBeenCalledTimes(1)
    expect(consumeReloadForUpdate()).toBe(true)
  })

  it('does nothing when the deployed stamp is this build', async () => {
    serve(BUILD_STAMP)
    expect(await reloadIfStaleBuild('game-page')).toBe(false)
    expect(location.reload).not.toHaveBeenCalled()
    expect(consumeReloadForUpdate()).toBe(false)
  })

  // A deploy settling across the CDN can answer the new stamp while a reload
  // still lands on the old build; the second sight of the same stamp must not
  // reload again, or the tab spins until the CDN catches up.
  it('never reloads twice for the same stamp', async () => {
    serve(OTHER)
    await reloadIfStaleBuild('game-page')
    expect(await reloadIfStaleBuild('game-page')).toBe(false)
    expect(location.reload).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the answer is not a stamp — the dev server, a 404, offline', async () => {
    serve('<!doctype html>')
    expect(await reloadIfStaleBuild('game-page')).toBe(false)
    serve(OTHER, { ok: false })
    expect(await reloadIfStaleBuild('game-page')).toBe(false)
    serve(OTHER, { reject: true })
    expect(await reloadIfStaleBuild('game-page')).toBe(false)
    expect(location.reload).not.toHaveBeenCalled()
  })

  // Fails closed, like the chunk guard: a browser that blocks site data cannot
  // count reloads, so it gets none rather than an uncounted one.
  it('does nothing where storage cannot be read', async () => {
    serve(OTHER)
    storage.blockAccess()
    expect(await reloadIfStaleBuild('game-page')).toBe(false)
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('asks at most once per floor on the return trigger, and always on the one-offs', async () => {
    const fetch = serve(BUILD_STAMP)
    await reloadIfStaleBuild('returned')
    await reloadIfStaleBuild('returned')
    expect(fetch).toHaveBeenCalledTimes(1)
    await reloadIfStaleBuild('unhandled-answer')
    await reloadIfStaleBuild('game-page')
    expect(fetch).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(5 * 60_000)
    await reloadIfStaleBuild('returned')
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('checks when the tab becomes visible, is focused, or comes back online', async () => {
    const fetch = serve(BUILD_STAMP)
    const dispose = new AbortController()
    const realAdd = window.addEventListener.bind(window)
    vi.spyOn(window, 'addEventListener').mockImplementation((type, cb, opts) =>
      realAdd(type, cb, { ...(typeof opts === 'object' ? opts : {}), signal: dispose.signal }),
    )
    const realDocAdd = document.addEventListener.bind(document)
    vi.spyOn(document, 'addEventListener').mockImplementation((type, cb, opts) =>
      realDocAdd(type, cb, { ...(typeof opts === 'object' ? opts : {}), signal: dispose.signal }),
    )
    watchForStaleBuild()
    window.dispatchEvent(new Event('focus'))
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5 * 60_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetch).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(5 * 60_000)
    window.dispatchEvent(new Event('online'))
    expect(fetch).toHaveBeenCalledTimes(3)
    dispose.abort()
  })
})
