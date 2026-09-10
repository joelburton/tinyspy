// cs-blessed-supabase

/**
 * edgeFnTransport — the one place a functions-js failure becomes a classifiable
 * `DbError` for `runEdgeFn`. The cases these pin:
 *
 *   - a response body with our `{ error, code? }` shape → `answered: true` and
 *     the relayed SQLSTATE, so `runEdgeFn` treats it like a direct RPC
 *     failure (and prose can never misfile as transport);
 *   - a response that ISN'T our function speaking (gateway HTML, platform
 *     JSON) → our function did not answer, but SOMETHING did, so the real
 *     status rides along;
 *   - no response at all → `status: 0`, the signal `nothingAnswered` reads.
 *
 * That last distinction is load-bearing and used not to exist. A gateway 502 IS
 * a reply and a dead socket is not, and collapsing them made an offline phone
 * and a broken deploy tell the player the same thing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { edgeFnTransport } from './edgeFnTransport'
import { supabase } from './supabase'

vi.mock('./supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))
const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>

/** What functions-js hands back when the REQUEST never went out — the network
 *  is off, DNS fails. `FunctionsFetchError.context` is the original fetch error,
 *  NOT a Response, which is the whole point of the test below. */
function fetchError() {
  return {
    message: 'Failed to send a request to the Edge Function',
    context: new TypeError('Failed to fetch'),
  }
}

/** A functions-js-shaped error: generic message + the read-once context. */
function fnError(body: string | null, contentType = 'application/json') {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: body === null ? undefined : new Response(body, { headers: { 'Content-Type': contentType } }),
  }
}

afterEach(() => vi.restoreAllMocks())

describe('edgeFnTransport', () => {
  it('passes a 2xx payload through untouched', async () => {
    invoke.mockResolvedValue({ data: { id: 'g1' }, error: null })
    expect(await edgeFnTransport('x-build-board', {})).toEqual({ data: { id: 'g1' }, error: null })
  })

  it('recovers { error, code } from the body and marks it ANSWERED', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: fnError(JSON.stringify({ error: 'no-required-words|', code: 'P0001' })),
    })
    const res = await edgeFnTransport('x-build-board', {})
    // status 200 is the fixture Response's default; real failures carry 4xx/5xx.
    expect(res.error).toEqual({ message: 'no-required-words|', code: 'P0001', status: 200, answered: true })
  })

  // A function of OURS refusing without a code is a bug of its own: one that ran
  // answers 200 with an envelope, and one relaying a raise sends the SQLSTATE
  // beside the message. It gets `PN489` here so nothing downstream has to
  // recognize a failure by the absence of a code.
  it('names a codeless refusal PN489, and still marks it answered', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: fnError(JSON.stringify({ error: 'no candidate words for band 3' })),
    })
    const res = await edgeFnTransport('x-build-board', {})
    expect(res.error).toEqual({
      message: 'no candidate words for band 3', code: 'PN489', status: 200, answered: true,
    })
  })

  // A body that will not parse means the RUNTIME answered, not the function —
  // `Function not found` in text/plain, or a container that will not boot.
  // Ours, so it carries a `BUG:` and a code of its own. Decided here because
  // here is where the Response is: functions-js hands over the whole object,
  // so the parse attempt and the content-type are both in reach.
  it('blames our own deploy when the body will not parse', async () => {
    invoke.mockResolvedValue({ data: null, error: fnError('<html>502</html>', 'text/html') })
    const res = await edgeFnTransport('x-build-board', {})
    expect(res.error).toMatchObject({
      code: 'PN310',
      status: 200,
      answered: true,
    })
    expect(res.error?.message).toContain('BUG:')
    expect(res.error?.details).toContain('text/html')
  })

  // JSON that is not our `{ error }` shape means something REPLIED and it was
  // not our function — a gateway, a relay. `FE003` is what the database path
  // calls that, so an outage reads the same on either transport instead of as
  // our bug. No `answered`: our function never spoke.
  it('calls a reply that was not ours FE003', async () => {
    invoke.mockResolvedValue({ data: null, error: fnError(JSON.stringify({ msg: 'not ours' })) })
    const res = await edgeFnTransport('x-build-board', {})
    expect(res.error).toEqual({
      message: 'Edge Function returned a non-2xx status code', code: 'FE003', status: 200,
    })
  })

  // NOTHING answered — `status: 0`, the same signal postgrest-js sets for a
  // rejected fetch, so one predicate covers both transports.
  // No code here, deliberately: `FE001` vs `FE002` turns on `navigator.onLine`,
  // which `nothingReachedUs` asks at the moment it builds the envelope. This
  // layer knows only that nothing replied.
  it('reports status 0 when there was no response at all', async () => {
    invoke.mockResolvedValue({ data: null, error: fnError(null) })
    const res = await edgeFnTransport('x-build-board', {})
    expect(res.error).toEqual({
      message: 'Edge Function returned a non-2xx status code', status: 0,
    })
  })
})

/**
 * OFFLINE. Reported by Joel 2026-09-10: with the network off, waffle's New game
 * showed no modal and no pill, while Restart — the same failure over the
 * DATABASE transport — showed the offline modal.
 *
 * The cause was here. Every failure functions-js reports carries a `context`,
 * and this read it as the read-once `Response` that a non-2xx carries. A
 * `FunctionsFetchError`'s context is the original fetch error instead, so
 * `ctx.json()` threw, the catch below it reached for `ctx.headers`, and THAT
 * threw out of this function — past `runEdgeFn`, which never got to report a
 * fault, and into the caller's single-flight catch, where it became a console
 * line nobody was looking at.
 */
describe('edgeFnTransport — nothing went out', () => {
  it('reports a dead connection instead of throwing', async () => {
    invoke.mockResolvedValue({ data: null, error: fetchError() })
    const { data, error } = await edgeFnTransport('waffle-build-board', {})
    expect(data).toBeNull()
    // `status: 0` is the no-reply signal `nothingAnswered` reads, so runEdgeFn
    // words it as the offline sentence and raises the modal.
    expect(error?.status).toBe(0)
    expect(error?.answered).toBeUndefined()
  })
})
