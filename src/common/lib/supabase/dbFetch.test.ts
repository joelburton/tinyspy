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
    // An AUTH path, because that is one nothing downstream speaks for. A
    // failure on our own endpoints is the wrapper's to log now.
    await dbFetch('https://x.supabase.co/auth/v1/token', { method: 'POST' }).catch(() => {})
    const line = spy.mock.calls[0][0] as string
    expect(line).toContain('[db]')
    expect(line).toContain('POST /auth/v1/token')
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
    await dbFetch('https://x.supabase.co/auth/v1/token?apikey=SECRETKEY&id=eq.1').catch(() => {})
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
  // A body that will not parse used to be the quietest failure here, printing
  // `dbcode=` and `detail=` blank. It is now the loudest thing this layer says:
  // a verdict in `statusText` that the wrapper turns into a real sentence.
  it('marks an unparseable body with a verdict, and keeps the body readable', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )
    const res = await dbFetch('https://x.supabase.co/rest/v1/clubs')
    expect(res.statusText).toBe('FE004')
    expect(await res.text()).toContain('502 Bad Gateway')
  })

  it('passes a failing status through untouched for the wrapper to read', async () => {
    stubFetch(() => Promise.resolve(new Response('{}', { status: 400 })))
    const res = await dbFetch('https://x.supabase.co/rest/v1/rpc/submit_word', { method: 'POST' })
    expect(res.status).toBe(400)
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
 * (docs/envelopes.md → Presenting a fault).
 *
 * The classification still matters and still lives here: this is the only place
 * Kong's JSON can be told from a captive portal's HTML, since postgrest-js
 * flattens both into `{ message: string }` before a wrapper sees them.
 */
/**
 * **dbFetch classifies; the wrapper logs and presents.** Its verdict rides in
 * `statusText`, the one field that survives postgrest-js untouched — so these
 * assertions read the RESPONSE, not the console.
 *
 * Why the classification lives here at all: this is the only layer that can see
 * whether the body parsed. By the time a wrapper receives the failure,
 * postgrest-js has flattened Kong's JSON and a captive portal's HTML into the
 * same `{ message: string }`.
 */
describe('dbFetch — classifying faults', () => {
  beforeEach(() => {
    clearFaultsForTest()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  // An abort is US canceling our own request — a component unmounting, a
  // superseded fetch. It still gets a line, because no wrapper will speak for
  // a request that was never meant to finish.
  it('logs an abort, which no wrapper will speak for', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const abort = new DOMException('The operation was aborted.', 'AbortError')
    stubFetch(() => Promise.reject(abort))
    await expect(dbFetch('https://x.test/rest/v1/clubs')).rejects.toThrow()
    expect(String(err.mock.calls[0]?.[0] ?? '')).toContain('/rest/v1/clubs')
  })

  // Auth is outside the seam and has no wrapper, so this line is its whole
  // record.
  it('logs auth, which has no wrapper either', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(() => Promise.reject(new TypeError('Load failed')))
    await expect(dbFetch('https://x.test/auth/v1/token')).rejects.toThrow()
    expect(String(err.mock.calls[0]?.[0] ?? '')).toContain('/auth/v1/token')
  })

  // But a failure on OUR endpoints does NOT get a line here: the wrapper writes
  // a better one, knowing the severity, the code and the outcome.
  it('stays quiet for a call a wrapper will speak for', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(() => Promise.reject(new TypeError('Load failed')))
    await expect(dbFetch('https://x.test/rest/v1/clubs')).rejects.toThrow()
    expect(err).not.toHaveBeenCalled()
  })

  // ── The verdict, in statusText ───────────────────────────────

  // HTML on `/rest/v1/` — PostgREST always speaks JSON, so something that is
  // not PostgREST answered: a captive portal, a proxy, an ISP page.
  it('names a foreign responder when the body will not parse', async () => {
    stubFetch(() => Promise.resolve(new Response('<html>502</html>', { status: 502 })))
    const res = await dbFetch('https://x.test/rest/v1/rpc/submit_guess', { method: 'POST' })
    expect(res.statusText).toBe('FE004')
    expect(res.status).toBe(502)
    // And the body still reads — the caller has not lost it.
    expect(await res.text()).toBe('<html>502</html>')
  })

  // It PARSED but carried no SQLSTATE — Kong's own `{"message":"no Route
  // matched…"}`. Our gateway is up and the thing behind it is not.
  it('names our own upstream when the gateway answers without a SQLSTATE', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'no Route matched with those values' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const res = await dbFetch('https://x.test/rest/v1/rpc/submit_guess', { method: 'POST' })
    expect(res.statusText).toBe('FE003')
  })

  // Postgres naming itself needs no help: the wrapper reads the SQLSTATE off
  // the error, so this layer leaves the statusText alone.
  it('adds no verdict when Postgres named itself', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'permission denied', code: '42501' }), {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const res = await dbFetch('https://x.test/rest/v1/rpc/submit_guess', { method: 'POST' })
    expect(res.statusText).toBe('Forbidden')
  })

  // Nothing here is ever presented — that moved to the wrappers entirely.
  it('presents nothing, whatever happened', async () => {
    stubFetch(() => Promise.resolve(new Response('<html>502</html>', { status: 502 })))
    await dbFetch('https://x.test/rest/v1/rpc/submit_guess', { method: 'POST' })
    expect(peekFaultsForTest()).toHaveLength(0)
  })
})
