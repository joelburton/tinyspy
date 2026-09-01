// cs-unmet

/**
 * callEdgeFn — the one place a functions-js failure becomes a classifiable
 * CallError. The cells these pin (the edge-fn column of the behavior matrix):
 *
 *   - a response body with our `{ error, code? }` shape → `answered: true` and
 *     the relayed SQLSTATE, so classifyFailure treats it like a direct RPC
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
import { callEdgeFn } from './callEdgeFn'
import { supabase } from './supabase'

vi.mock('./supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))
const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>

/** A functions-js-shaped error: generic message + the read-once context. */
function fnError(body: string | null, contentType = 'application/json') {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: body === null ? undefined : new Response(body, { headers: { 'Content-Type': contentType } }),
  }
}

afterEach(() => vi.restoreAllMocks())

describe('callEdgeFn', () => {
  it('passes a 2xx payload through untouched', async () => {
    invoke.mockResolvedValue({ data: { id: 'g1' }, error: null })
    expect(await callEdgeFn('x-build-board', {})).toEqual({ data: { id: 'g1' }, error: null })
  })

  it('recovers { error, code } from the body and marks it ANSWERED', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: fnError(JSON.stringify({ error: 'no-required-words|', code: 'P0001' })),
    })
    const res = await callEdgeFn('x-build-board', {})
    // status 200 is the fixture Response's default; real failures carry 4xx/5xx.
    expect(res.error).toEqual({ message: 'no-required-words|', code: 'P0001', status: 200, answered: true })
  })

  it('recovers a codeless body and still marks it answered — prose is a FAULT, not transport', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: fnError(JSON.stringify({ error: 'no candidate words for band 3' })),
    })
    const res = await callEdgeFn('x-build-board', {})
    expect(res.error).toEqual({ message: 'no candidate words for band 3', status: 200, answered: true })
  })

  // A body that will not parse means the RUNTIME answered, not the function —
  // `Function not found` in text/plain, or a container that will not boot.
  // Ours, so it carries a `BUG:` and a code of its own. Decided here because
  // here is where the Response is: functions-js hands over the whole object,
  // so the parse attempt and the content-type are both in reach.
  it('blames our own deploy when the body will not parse', async () => {
    invoke.mockResolvedValue({ data: null, error: fnError('<html>502</html>', 'text/html') })
    const res = await callEdgeFn('x-build-board', {})
    expect(res.error).toMatchObject({
      code: 'PN310',
      status: 200,
      answered: true,
    })
    expect(res.error?.message).toContain('BUG:')
    expect(res.error?.details).toContain('text/html')
  })

  it('keeps it for JSON that is not our { error } shape either', async () => {
    invoke.mockResolvedValue({ data: null, error: fnError(JSON.stringify({ msg: 'not ours' })) })
    const res = await callEdgeFn('x-build-board', {})
    expect(res.error).toEqual({
      message: 'Edge Function returned a non-2xx status code', code: '', status: 200,
    })
  })

  // NOTHING answered — `status: 0`, the same signal postgrest-js sets for a
  // rejected fetch, so one predicate covers both transports.
  it('reports status 0 when there was no response at all', async () => {
    invoke.mockResolvedValue({ data: null, error: fnError(null) })
    const res = await callEdgeFn('x-build-board', {})
    expect(res.error).toEqual({
      message: 'Edge Function returned a non-2xx status code', code: '', status: 0,
    })
  })
})
