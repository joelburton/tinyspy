/**
 * Tests for channelDedupSuffix.
 *
 * The function's whole point is "produce a unique-enough string
 * for a Realtime channel name, whether or not crypto.randomUUID
 * is available." The fallback path matters because it covers
 * insecure dev origins (LAN IP `http://10.0.0.89:5173`), older
 * browsers, and embedded WebViews — the real-world environments
 * where crypto.randomUUID is undefined.
 *
 * What's covered:
 *   - Happy path: when crypto.randomUUID is available, the
 *     function returns its result verbatim.
 *   - Fallback path (no randomUUID method): returns a non-empty
 *     string and successive calls don't collide.
 *   - Fallback path (no crypto global): same — doesn't throw.
 *   - Fallback shape sanity: looks like the documented
 *     "timestamp-counter-randomwords" recipe.
 *
 * Out of scope: the cryptographic quality of the output. The
 * function explicitly disclaims it; the doc warns callers not
 * to repurpose it for nonces. The test pins behavior, not
 * security.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function loadFresh(): Promise<
  typeof import('./channelDedup')
> {
  // The fallback uses a module-level counter — re-import per test
  // so each test starts from counter=0 and assertions on counter
  // increments are reliable.
  vi.resetModules()
  return await import('./channelDedup')
}

describe('channelDedupSuffix — crypto.randomUUID available', () => {
  it('returns crypto.randomUUID() directly', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    })
    const { channelDedupSuffix } = await loadFresh()
    expect(channelDedupSuffix()).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  })

  it('returns a fresh value on each call (delegating to the platform)', async () => {
    let i = 0
    vi.stubGlobal('crypto', {
      randomUUID: () => `uuid-${++i}`,
    })
    const { channelDedupSuffix } = await loadFresh()
    expect(channelDedupSuffix()).toBe('uuid-1')
    expect(channelDedupSuffix()).toBe('uuid-2')
    expect(channelDedupSuffix()).toBe('uuid-3')
  })
})

describe('channelDedupSuffix — fallback paths', () => {
  it('uses the fallback when crypto exists but lacks randomUUID', async () => {
    // crypto without randomUUID — older browsers; current spec
    // restricts randomUUID to secure contexts.
    vi.stubGlobal('crypto', { getRandomValues: () => new Uint8Array(0) })
    const { channelDedupSuffix } = await loadFresh()
    const s = channelDedupSuffix()
    expect(typeof s).toBe('string')
    expect(s.length).toBeGreaterThan(0)
    // Documented shape: "{base36-ts}-{base36-counter}-{rand}{rand}".
    // Two dashes from the joins; both flanking segments non-empty.
    expect(s.split('-').length).toBeGreaterThanOrEqual(3)
  })

  it('uses the fallback when crypto is undefined entirely', async () => {
    vi.stubGlobal('crypto', undefined)
    const { channelDedupSuffix } = await loadFresh()
    expect(() => channelDedupSuffix()).not.toThrow()
    const s = channelDedupSuffix()
    expect(typeof s).toBe('string')
    expect(s.length).toBeGreaterThan(0)
  })

  it('successive fallback calls produce different strings (counter increments)', async () => {
    vi.stubGlobal('crypto', undefined)
    const { channelDedupSuffix } = await loadFresh()
    const values = new Set<string>()
    for (let i = 0; i < 20; i++) values.add(channelDedupSuffix())
    expect(values.size).toBe(20)
  })

  it('counter segment monotonically increases across calls in the fallback path', async () => {
    vi.stubGlobal('crypto', undefined)
    const { channelDedupSuffix } = await loadFresh()
    // Shape: "{ts}-{counter}-{rand}". Pull the middle segment.
    function counterOf(s: string): number {
      return parseInt(s.split('-')[1], 36)
    }
    const a = counterOf(channelDedupSuffix())
    const b = counterOf(channelDedupSuffix())
    const c = counterOf(channelDedupSuffix())
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })
})
