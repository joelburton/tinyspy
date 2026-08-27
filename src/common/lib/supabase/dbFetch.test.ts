// cs-unmet

/**
 * dbFetch — the wrapper every Supabase request goes through.
 *
 * Two contracts. The first is that it does NOT touch the error: the frontend
 * owns every player-facing string, so a wrapper that edited the message here
 * would be a second author of player copy in the layer furthest from the
 * player. Pinned because "helpfully" rewording a failure is exactly the change
 * someone will be tempted to make right here.
 *
 * The second is the `[db]` console trail, which exists because the 47 sites
 * that render an error just render and return: before this, a transport
 * failure left no record anywhere, so a phone report had nothing to read back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dbFetch } from './dbFetch'
import { clearFaultsForTest, peekFaultsForTest } from '../fault/faultStore'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

/** Stand in for the global fetch, since dbFetch delegates to it. */
function stubFetch(impl: () => Promise<Response>) {
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch
}

describe('dbFetch — a request that never reached the server', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('re-throws the error EXACTLY as it came — identity, not just shape', async () => {
    // Identity, because a re-thrown copy would be indistinguishable in a shape
    // assertion while still being a rewrite.
    const original = new TypeError('Load failed')
    stubFetch(() => Promise.reject(original))
    const err = await dbFetch('https://x.supabase.co/rest/v1/rpc/submit_word').catch((e: unknown) => e)
    expect(err).toBe(original)
    expect((err as Error).message).toBe('Load failed')
  })

  it('re-throws an ABORT untouched too', async () => {
    // Aborts arrive as a DOMException, which does not reliably satisfy
    // `instanceof Error` — the reason this reads name/message off the thrown
    // value rather than narrowing to Error first.
    const abort = new DOMException('The operation was aborted.', 'AbortError')
    stubFetch(() => Promise.reject(abort))
    const err = await dbFetch('https://x.supabase.co/rest/v1/rpc/submit_word').catch((e: unknown) => e)
    expect(err).toBe(abort)
  })

  it('logs the failure under [db] with the facts the message lacks', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(() => Promise.reject(new TypeError('Load failed')))
    await dbFetch('https://x.supabase.co/rest/v1/rpc/submit_word', { method: 'POST' }).catch(() => {})
    const line = spy.mock.calls[0][0] as string
    expect(line).toContain('[db]')
    expect(line).toContain('POST /rest/v1/rpc/submit_word')
    expect(line).toContain('FAILED: TypeError: Load failed')
    expect(line).toMatch(/\d+ms online=/)
  })

  it('never puts credentials in the log — path only, never the query string', async () => {
    // A Supabase URL carries the apikey (and often a JWT) in its query string,
    // and console output gets screenshotted into chat.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(() => Promise.reject(new TypeError('Load failed')))
    await dbFetch('https://x.supabase.co/rest/v1/games?apikey=SECRETKEY&id=eq.1').catch(() => {})
    expect(spy.mock.calls[0][0]).not.toContain('SECRETKEY')
  })
})

describe('dbFetch — requests that DID reach the server', () => {
  it('passes a success straight through, silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubFetch(() => Promise.resolve(new Response('{}', { status: 200 })))
    const res = await dbFetch('https://x.supabase.co/rest/v1/games')
    expect(res.status).toBe(200)
    expect(warn).not.toHaveBeenCalled()
  })

  it('narrates a failing STATUS too — "said no" and "never arrived" are one investigation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubFetch(() => Promise.resolve(new Response('{}', { status: 400 })))
    await dbFetch('https://x.supabase.co/rest/v1/rpc/submit_word', { method: 'POST' })
    expect(warn.mock.calls[0][0]).toContain('→ 400')
  })

  it('does NOT append advice to a server rejection — the move was really refused', async () => {
    // The pill for a 400 shows the plpgsql message postgrest-js parses out of
    // the body; nothing here touches it. Pinned by the absence of a throw.
    stubFetch(() => Promise.resolve(new Response(
      JSON.stringify({ message: 'BITCH cannot be played on this board', code: 'P0001' }),
      { status: 400 },
    )))
    const res = await dbFetch('https://x.supabase.co/rest/v1/rpc/submit_word', { method: 'POST' })
    expect((await res.json()).message).toBe('BITCH cannot be played on this board')
  })
})

/**
 * The FAULT SEAM (plans/error-system.md → "Faults and environmental failures
 * are presented centrally").
 *
 * These pin the rule that makes every converted call site simpler: a call site
 * never has to ask "did we hear back at all?", never words a network problem,
 * and never calls presentFault. If this seam stops presenting, nothing else in
 * the app notices — the failure would be silent, which is why it is tested here
 * rather than left to a call site's own test.
 */
describe('dbFetch — the fault seam', () => {
  beforeEach(() => {
    clearFaultsForTest()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  it('presents an environmental fault when the request never completed', async () => {
    stubFetch(() => Promise.reject(new TypeError('Load failed')))
    await expect(dbFetch('https://x.test/rest/v1/clubs')).rejects.toThrow()
    const [fault] = peekFaultsForTest()
    expect(fault.text).toMatch(/refresh and try again/i)
    expect(fault.diagnostics).toContain('/rest/v1/clubs')
  })

  // An abort is US cancelling our own request — a component unmounting, a
  // superseded fetch. Nobody is owed a modal for that, and one would appear on
  // ordinary navigation.
  it('says nothing when WE aborted the request', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError')
    stubFetch(() => Promise.reject(abort))
    await expect(dbFetch('https://x.test/rest/v1/clubs')).rejects.toThrow()
    expect(peekFaultsForTest()).toHaveLength(0)
  })

  // Auth is deliberately outside the seam: a 400 from /auth/v1/ is usually a
  // user-facing condition the sign-in screen already handles (expired link, bad
  // OTP), and a blocking modal would be wrong.
  it('leaves auth alone', async () => {
    stubFetch(() => Promise.reject(new TypeError('Load failed')))
    await expect(dbFetch('https://x.test/auth/v1/token')).rejects.toThrow()
    expect(peekFaultsForTest()).toHaveLength(0)
  })

  it('presents a raw fault for a Postgres error nobody authored', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ code: '23514', message: 'violates check constraint "guesses_check"' }),
          { status: 400 },
        ),
      ),
    )
    await dbFetch('https://x.test/rest/v1/rpc/submit_guess', { method: 'POST' })
    const [fault] = peekFaultsForTest()
    expect(fault.text).toContain('guesses_check')
    expect(fault.diagnostics).toContain('dbcode=23514')
  })

  // Reading the body must not consume it — every caller downstream still needs
  // the stream. This is the whole reason for `clone()`.
  it('leaves the response body readable by the caller', async () => {
    stubFetch(() =>
      Promise.resolve(new Response(JSON.stringify({ code: '23514', message: 'boom' }), { status: 400 })),
    )
    const res = await dbFetch('https://x.test/rest/v1/rpc/submit_guess', { method: 'POST' })
    await expect(res.json()).resolves.toEqual({ code: '23514', message: 'boom' })
  })

  it('stays quiet on success', async () => {
    stubFetch(() => Promise.resolve(new Response('[]', { status: 200 })))
    await dbFetch('https://x.test/rest/v1/clubs')
    expect(peekFaultsForTest()).toHaveLength(0)
  })
})
