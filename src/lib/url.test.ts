/**
 * Tests for the URL-hash helpers used to mirror the current game's
 * join code into and out of `#game=ABCDEF`.
 *
 * jsdom (configured globally in vite.config.ts) provides a mutable
 * `window.location` and a stub `history.replaceState`, so we can drive
 * `readHashCode` by writing `window.location.hash` directly and spy
 * on `history.replaceState` to verify what `writeHashCode` did.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readHashCode, writeHashCode } from './url'

afterEach(() => {
  // Reset the hash between tests so one test's side effect doesn't
  // bleed into the next.
  window.location.hash = ''
  vi.restoreAllMocks()
})

describe('readHashCode', () => {
  it('returns the code when the hash matches `#game=…`', () => {
    window.location.hash = '#game=ABC123'
    expect(readHashCode()).toBe('ABC123')
  })

  it('upper-cases the code (matching how generate_join_code emits them)', () => {
    window.location.hash = '#game=abc123'
    expect(readHashCode()).toBe('ABC123')
  })

  it('returns null when the hash is empty', () => {
    window.location.hash = ''
    expect(readHashCode()).toBeNull()
  })

  it('returns null when the hash does not match the pattern', () => {
    window.location.hash = '#something-else'
    expect(readHashCode()).toBeNull()
  })

  it('returns null when the hash includes non-alphanumeric characters', () => {
    // The regex is intentionally strict — a "code" with punctuation is
    // almost certainly a leftover URL fragment from somewhere else.
    window.location.hash = '#game=ABC/123'
    expect(readHashCode()).toBeNull()
  })
})

describe('writeHashCode', () => {
  it('writes #game=<code> via replaceState (not pushState)', () => {
    const spy = vi.spyOn(window.history, 'replaceState')
    writeHashCode('ABC123')
    expect(spy).toHaveBeenCalledWith(null, '', '#game=ABC123')
  })

  it('clears the hash entirely when passed null', () => {
    const spy = vi.spyOn(window.history, 'replaceState')
    writeHashCode(null)
    // The cleared form is path+search; in jsdom the default path is "/"
    // and there's no search string.
    expect(spy).toHaveBeenCalledWith(null, '', '/')
  })

  it('uses replaceState so back-button history does not accumulate', () => {
    // Important guarantee: every game-state transition would otherwise
    // pile up an entry in the user's history. Verify by ensuring
    // pushState is never called.
    const pushSpy = vi.spyOn(window.history, 'pushState')
    writeHashCode('XYZ')
    writeHashCode(null)
    writeHashCode('QWE')
    expect(pushSpy).not.toHaveBeenCalled()
  })
})
