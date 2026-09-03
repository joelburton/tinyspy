// cs-audited-utils

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readStored, removeStored, writeStored } from './storage'
import { installFakeStorage, type InstalledStorage } from './storage.fake'

/**
 * The wrapper's whole job is the failing case, so that is most of what is here:
 * a browser blocking site data throws instead of returning `null`, and these
 * three functions are the only place in `src/` allowed to catch it
 * (`src/guards/rawStorage.test.ts`).
 *
 * The distinction every case circles is **absent vs unavailable**. They are
 * different events with different right answers, and collapsing them is the
 * specific mistake `whenUnavailable` exists to prevent: `reloadOnStaleChunk`
 * reads an absent key as "reloaded long ago" and unavailable storage as
 * "reloaded just now" — opposite conclusions, and a wrapper that returned the
 * same `null` for both would have turned its reload counter into a reload loop.
 *
 * Assertions go through the fake's handles rather than `window.localStorage`,
 * so this file needs no exemption from the guard it is testing.
 */

const KEY = 'test:storage'

let storage: InstalledStorage

beforeAll(() => {
  storage = installFakeStorage()
})

beforeEach(() => storage.clear())
afterEach(() => vi.restoreAllMocks())

describe('readStored', () => {
  it('returns the stored string', () => {
    storage.local.setItem(KEY, 'hello')
    expect(readStored('local', KEY, null)).toBe('hello')
  })

  it('returns null for an absent key, NOT whenUnavailable', () => {
    // The load-bearing case. Storage works fine here and the key simply is not
    // there, so a caller that distinguishes the two has to see `null`.
    expect(readStored('local', KEY, 'STAND-IN')).toBeNull()
  })

  it('returns whenUnavailable when storage throws', () => {
    storage.block()
    expect(readStored('local', KEY, 'STAND-IN')).toBe('STAND-IN')
    expect(readStored('local', KEY, null)).toBeNull()
  })

  it('reads session storage separately from local', () => {
    storage.session.setItem(KEY, 'in-session')
    expect(readStored('session', KEY, null)).toBe('in-session')
    expect(readStored('local', KEY, null)).toBeNull()
  })
})

describe('writeStored', () => {
  it('stores the value', () => {
    writeStored('local', KEY, 'written')
    expect(storage.local.getItem(KEY)).toBe('written')
  })

  it('does not throw when storage does', () => {
    // A write can fail where reads succeed — a full quota — and a throw would
    // escape into whatever the caller was midway through. reloadOnStaleChunk is
    // the case that made it matter: a throw there would skip the
    // `preventDefault` after it, leaving the page neither reloaded nor showing
    // the error it had swallowed.
    storage.block()
    expect(() => writeStored('local', KEY, 'x')).not.toThrow()
  })

  it('writes session storage separately from local', () => {
    writeStored('session', KEY, 'in-session')
    expect(storage.session.getItem(KEY)).toBe('in-session')
    expect(storage.local.getItem(KEY)).toBeNull()
  })
})

describe('removeStored', () => {
  it('forgets the key', () => {
    storage.local.setItem(KEY, 'doomed')
    removeStored('local', KEY)
    expect(storage.local.getItem(KEY)).toBeNull()
  })

  it('does not throw when storage does', () => {
    storage.block()
    expect(() => removeStored('local', KEY)).not.toThrow()
  })
})
