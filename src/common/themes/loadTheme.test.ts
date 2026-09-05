// cs-blessed-boot

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeStorage, type InstalledStorage } from '../web-storage/storage.fake'
import { loadTheme } from './loadTheme'

/**
 * What theme the app comes up in, and whether that choice sticks.
 *
 * `loadTheme()` is awaited before the first render, so everything it decides
 * is decided while there is nothing on screen — which is why the rules it
 * follows were carried in comments rather than anywhere a reader could run.
 * Each case here is one of those rules.
 *
 * The storage cases are the ones worth having. `loadTheme` runs before a
 * single stylesheet is requested, so a `localStorage` read that throws where a
 * browser blocks site data would take boot down with it and paint `panic.ts`'s
 * last-resort screen instead of a page.
 *
 * Two mechanics, both load-bearing. The URL is set with `history.replaceState`
 * rather than a `window.location` stub: jsdom derives `location.search` from
 * it, so nothing here has to swap the location object. And the storage fake is
 * not optional — `window.localStorage` reads as `undefined` under vitest (see
 * `storage.fake.ts`), so a test without it would fail on the property access
 * rather than test the fallback.
 */
describe('loadTheme', () => {
  const KEY = 'puzpuzpuz::theme'
  let storage: InstalledStorage

  beforeAll(() => {
    storage = installFakeStorage()
  })

  beforeEach(() => {
    storage.clear()
    history.replaceState({}, '', '/')
    delete document.documentElement.dataset.theme
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('takes midnight from the URL, and makes the choice stick', async () => {
    history.replaceState({}, '', '/?theme=midnight')
    expect(await loadTheme()).toBe('midnight')
    expect(storage.local.getItem(KEY)).toBe('midnight')
  })

  it('CLEARS a stored midnight on `?theme=daylight` rather than merely losing to it', async () => {
    // The only way back out of the spike without opening devtools: leaving the
    // stored value in place would put midnight back on the next navigation.
    storage.local.setItem(KEY, 'midnight')
    history.replaceState({}, '', '/?theme=daylight')
    expect(await loadTheme()).toBe('daylight')
    expect(storage.local.getItem(KEY)).toBeNull()
  })

  it('uses the stored choice when the URL says nothing', async () => {
    storage.local.setItem(KEY, 'midnight')
    expect(await loadTheme()).toBe('midnight')
  })

  it('is daylight with no URL and nothing stored', async () => {
    expect(await loadTheme()).toBe('daylight')
  })

  it('ignores a theme name we do not have, and falls back to the stored choice', async () => {
    storage.local.setItem(KEY, 'midnight')
    history.replaceState({}, '', '/?theme=twilight')
    expect(await loadTheme()).toBe('midnight')
  })

  it('falls back to daylight when the browser blocks site data', async () => {
    // Stored FIRST, so the case can only pass by the read actually throwing:
    // a browser that let the read through would answer midnight here.
    storage.local.setItem(KEY, 'midnight')
    storage.blockAccess()
    await expect(loadTheme()).resolves.toBe('daylight')
  })

  it('still honors the URL for THIS load when the choice cannot be stored', async () => {
    history.replaceState({}, '', '/?theme=midnight')
    storage.blockAccess()
    expect(await loadTheme()).toBe('midnight')
    // Nothing landed, so the next navigation is back to daylight. Read off the
    // fake itself, which is reachable even while `window.localStorage` is not.
    expect(storage.local.getItem(KEY)).toBeNull()
  })

  it('publishes the theme on <html>, where a game theme can read it', async () => {
    history.replaceState({}, '', '/?theme=midnight')
    await loadTheme()
    expect(document.documentElement.dataset.theme).toBe('midnight')
  })
})
