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
    expect(line).toContain('FAULT')
    // The thrown error is the DETAIL: nothing answered, so there is no
    // server-supplied one to compete with it.
    expect(line).toContain('detail="TypeError: Load failed online=')
    expect(line).toMatch(/ms=\d+/)
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
  // The fault queue is a module singleton, so it carries across tests in this
  // file — and the poll assertions below COUNT modals.
  beforeEach(() => clearFaultsForTest())

  it('passes a success straight through, silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubFetch(() => Promise.resolve(new Response('{}', { status: 200 })))
    const res = await dbFetch('https://x.supabase.co/rest/v1/games')
    expect(res.status).toBe(200)
    expect(warn).not.toHaveBeenCalled()
  })

  // ── Who speaks for a success ─────────────────────────────────
  // A 2xx says the request arrived and nothing about what came back. Every call
  // to OUR endpoints has a wrapper that reads the answer and logs what it MEANT
  // — runRpc, runEdgeFn, readRows — so a line here as well would put a bare OK
  // above one that may contradict it. What is left for this layer is Supabase's
  // own endpoints, which no wrapper ever sees.
  it('says nothing about an RPC that returned 200', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    stubFetch(() => Promise.resolve(new Response('{}', { status: 200 })))
    await dbFetch('https://x.supabase.co/rest/v1/rpc/delete_game', { method: 'POST' })
    expect(debug).not.toHaveBeenCalled()
  })

  it('says nothing about a read either — readRows knows the row count', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    stubFetch(() => Promise.resolve(new Response('[]', { status: 200 })))
    await dbFetch('https://x.supabase.co/rest/v1/clubs')
    expect(debug).not.toHaveBeenCalled()
  })

  // An edge function used to get TWO OK lines: one here and one from runEdgeFn.
  it('says nothing about an edge function either — runEdgeFn does', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    stubFetch(() => Promise.resolve(new Response('{}', { status: 200 })))
    await dbFetch('https://x.supabase.co/functions/v1/boggle-build-board', { method: 'POST' })
    expect(debug).not.toHaveBeenCalled()
  })

  // Auth is the one success nothing downstream will ever speak for, so this
  // line is its only record.
  it('narrates a successful auth call, which no wrapper sees', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    stubFetch(() => Promise.resolve(new Response('{}', { status: 200 })))
    await dbFetch('https://x.supabase.co/auth/v1/token', { method: 'POST' })
    expect(debug.mock.calls[0][0]).toContain('| OK | POST /auth/v1/token')
  })

  // A body that isn't JSON is the failure most worth showing — a Kong 502 on a
  // PostgREST call means the stack is broken — and it used to be the quietest,
  // arriving with `dbcode=` and `detail=` both blank.
  it('says WHY there is no dbcode when the body would not parse', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(() =>
      Promise.resolve(
        new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )
    await dbFetch('https://x.supabase.co/rest/v1/clubs')
    expect(err.mock.calls[0][0]).toContain('body was not JSON')
    expect(err.mock.calls[0][0]).toContain('text/html')
  })

  // `isPolled` used to live here — a path test that silenced `tick_timer`'s
  // failures. It is gone: this layer presents nothing at all now, so there is
  // nothing to exempt, and the timer opts out at its own call instead
  // (plans/fault-presentation.md).
  it('presents nothing, whoever called', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    await expect(
      dbFetch('https://x.supabase.co/rest/v1/rpc/submit_guess', { method: 'POST' }),
    ).rejects.toThrow()
    expect(peekFaultsForTest()).toHaveLength(0)
  })

  it('narrates a failing STATUS too — "said no" and "never arrived" are one investigation', async () => {
    // On a seam path the status rides in the FAULT line the seam writes, at
    // `error`: one line per failed call, not a warn and then an error.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(() => Promise.resolve(new Response('{}', { status: 400 })))
    await dbFetch('https://x.supabase.co/rest/v1/rpc/submit_word', { method: 'POST' })
    expect(err.mock.calls[0][0]).toContain('status=400')
    expect(err.mock.calls[0][0]).toContain('POST /rest/v1/rpc/submit_word')
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
 * PRESENTING FAULTS (plans/error-system.md → "Faults and environmental failures
 * are presented centrally").
 *
 * These pin the rule that makes every converted call site simpler: a call site
 * never has to ask "did we hear back at all?", never words a network problem,
 * and never calls showFaultModal. If `dbFetch` stops presenting, nothing else in
 * the app notices — the failure would be silent, which is why it is tested here
 * rather than left to a call site's own test.
 */
/**
 * **dbFetch classifies; it no longer presents.** Every assertion here reads the
 * `[db]` LINE, because that is now the whole of this layer's output — the
 * wrapper decides whether anyone is shown anything
 * (plans/fault-presentation.md).
 *
 * The classification still matters and still lives here: this is the only place
 * Kong's JSON can be told from a captive portal's HTML, since postgrest-js
 * flattens both into `{ message: string }` before a wrapper sees them.
 */
describe('dbFetch — classifying faults', () => {
  /** The `[db]` line this call wrote, at whichever console level. */
  const line = (spy: ReturnType<typeof vi.spyOn>) => String(spy.mock.calls[0]?.[0] ?? '')

  beforeEach(() => {
    clearFaultsForTest()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  it('writes a line when the request never completed, and shows nothing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(() => Promise.reject(new TypeError('Load failed')))
    await expect(dbFetch('https://x.test/rest/v1/clubs')).rejects.toThrow()
    expect(line(err)).toContain('/rest/v1/clubs')
    expect(peekFaultsForTest()).toHaveLength(0)
  })

  // An abort is US canceling our own request — a component unmounting, a
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

  it('classifies a Postgres error nobody authored', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ code: '23514', message: 'violates check constraint "guesses_check"' }),
          { status: 400 },
        ),
      ),
    )
    await dbFetch('https://x.test/rest/v1/rpc/submit_guess', { method: 'POST' })
    expect(line(err)).toContain('guesses_check')
    expect(line(err)).toContain('dbcode=23514')
    expect(peekFaultsForTest()).toHaveLength(0)
  })

  // ── WHO answered, and therefore what it says ─────────────────
  // Three different things to go fix, and this is the only layer that can tell
  // them apart: a call site sees the envelope, never the response.

  // HTML on `/rest/v1/` — PostgREST always speaks JSON, so something that is
  // not PostgREST answered. A captive portal, a proxy, an ISP page. It used to
  // say "The server refused the request", which claims we answered and said no.
  it('names a foreign responder when the body is not JSON, on a rest path', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(() =>
      Promise.resolve(new Response('<html>502 Bad Gateway</html>', { status: 502 })),
    )
    await dbFetch('https://x.test/rest/v1/rpc/submit_guess', { method: 'POST' })
    expect(line(err)).toContain('a server other than ours')
    expect(line(err)).toContain('dbcode=FE004')
    expect(line(err)).toContain('status=502')
  })

  // The edge RUNTIME answering instead of the function — `Function not found`
  // in text/plain. Ours: a deploy failure, not the player's network.
  it('blames our own deploy when the runtime answers on a functions path', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(() =>
      Promise.resolve(new Response('Function not found', { status: 404 })),
    )
    await dbFetch('https://x.test/functions/v1/boggle-build-board', { method: 'POST' })
    expect(line(err)).toContain('BUG:')
    expect(line(err)).toContain('dbcode=PN310')
  })

  // It PARSED but carried no SQLSTATE — Kong's own `{"message":"no Route
  // matched…"}`. Our gateway is up and the thing behind it is not, which the
  // player does not need spelled out; they need "our server is down".
  it('says our server is down when our gateway answers without a SQLSTATE', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'no Route matched with those values' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    await dbFetch('https://x.test/rest/v1/rpc/submit_guess', { method: 'POST' })
    expect(line(err)).toContain('Our server appears to be down')
    expect(line(err)).toContain('dbcode=FE003')
    // The gateway's own words survive where whoever debugs will read them.
    expect(line(err)).toContain('no Route matched')
  })

  // And Postgres naming itself still wins: its SQLSTATE is the more specific
  // answer, so none of the three above applies.
  it('leaves a real Postgres error alone', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'permission denied', code: '42501' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    await dbFetch('https://x.test/rest/v1/rpc/submit_guess', { method: 'POST' })
    expect(line(err)).toContain('permission denied')
    expect(line(err)).toContain('dbcode=42501')
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
