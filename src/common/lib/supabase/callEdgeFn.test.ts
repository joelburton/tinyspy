/**
 * callEdgeFn — the one place a functions-js failure becomes a classifiable
 * CallError. The cells these pin (the edge-fn column of the behavior matrix):
 *
 *   - a response body with our `{ error, code? }` shape → `answered: true` and
 *     the relayed SQLSTATE, so classifyFailure treats it like a direct RPC
 *     failure (and prose can never misfile as transport);
 *   - a response that ISN'T our function speaking (gateway HTML, platform
 *     JSON) → unanswered → transport, which is the honest environmental read;
 *   - no response at all → transport.
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
    expect(res.error).toEqual({ message: 'no-required-words|', code: 'P0001', answered: true })
  })

  it('recovers a codeless body and still marks it answered — prose is a FAULT, not transport', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: fnError(JSON.stringify({ error: 'no candidate words for band 3' })),
    })
    const res = await callEdgeFn('x-build-board', {})
    expect(res.error).toEqual({ message: 'no candidate words for band 3', answered: true })
  })

  it('treats a non-JSON body (a gateway answered, not our function) as transport', async () => {
    invoke.mockResolvedValue({ data: null, error: fnError('<html>502</html>', 'text/html') })
    const res = await callEdgeFn('x-build-board', {})
    expect(res.error).toEqual({ message: 'Edge Function returned a non-2xx status code', code: '' })
  })

  it('treats JSON that is not our { error } shape as transport', async () => {
    invoke.mockResolvedValue({ data: null, error: fnError(JSON.stringify({ msg: 'not ours' })) })
    const res = await callEdgeFn('x-build-board', {})
    expect(res.error).toEqual({ message: 'Edge Function returned a non-2xx status code', code: '' })
  })

  it('treats a contextless failure (fetch died) as transport', async () => {
    invoke.mockResolvedValue({ data: null, error: fnError(null) })
    const res = await callEdgeFn('x-build-board', {})
    expect(res.error).toEqual({ message: 'Edge Function returned a non-2xx status code', code: '' })
  })
})
