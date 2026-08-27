// cs-unmet

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgrestClient } from '@supabase/postgrest-js'
import {
  diagnosticsLine, environmentalEnvelope, faultEnvelope, isEnvelope, isOurDbCode, logDb, logSlow,
  reportDbFault, readRows, runRpc,
} from './dbResult'
import { clearFaultsForTest, peekFaultsForTest } from '../fault/faultStore'

/**
 * The new server-result system's own tests (plans/error-system.md).
 *
 * Two of these are load-bearing for the whole design:
 *
 *   - `isOurDbCode` must accept ONLY our two classes. Every other SQLSTATE in
 *     existence is a raw fault, and a test that widened would quietly promote
 *     Postgres's own errors into outcomes we claim to have authored.
 *   - zero rows must be `ok`. An empty result is a correct protocol answer, and
 *     only a caller can know it is impossible — so a helper that treated it as
 *     a failure would take that judgment away from the one place that has it.
 */

beforeEach(() => {
  clearFaultsForTest()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('isOurDbCode', () => {
  it('accepts our two classes', () => {
    expect(isOurDbCode('PA000')).toBe(true)
    expect(isOurDbCode('PN999')).toBe(true)
  })

  // The class carries the meaning, so a code from PL/pgSQL's own P0 class is
  // rejected on its second character alone.
  it("rejects PL/pgSQL's class and the privilege codes", () => {
    expect(isOurDbCode('P0001')).toBe(false)
    expect(isOurDbCode('P0002')).toBe(false)
    expect(isOurDbCode('42501')).toBe(false)
  })

  it("rejects Postgres's own codes and malformed ones", () => {
    expect(isOurDbCode('23514')).toBe(false) // check violation
    expect(isOurDbCode('40P01')).toBe(false) // deadlock
    expect(isOurDbCode('PA00')).toBe(false) // too short
    expect(isOurDbCode('PA0000')).toBe(false) // too long
    expect(isOurDbCode('pa001')).toBe(false) // lowercase
    expect(isOurDbCode('PB001')).toBe(false) // not one of our classes
    expect(isOurDbCode(undefined)).toBe(false)
  })
})

describe('isEnvelope', () => {
  it('accepts both branches', () => {
    expect(isEnvelope({ type: 'ok' })).toBe(true)
    expect(isEnvelope({ type: 'not-ok', severity: 'fault' })).toBe(true)
  })

  // Plenty of non-envelopes arrive on this path; each must fall through cleanly
  // rather than be half-read as one.
  it('rejects the other shapes an RPC can return', () => {
    expect(isEnvelope('won')).toBe(false)
    expect(isEnvelope(3)).toBe(false)
    expect(isEnvelope(null)).toBe(false)
    expect(isEnvelope([{ id: 'x' }])).toBe(false)
    expect(isEnvelope({ result: 'accepted', points: 5 })).toBe(false)
    expect(isEnvelope({ type: 'accepted' })).toBe(false)
  })
})

describe('readRows', () => {
  it('hands back the rows on success', async () => {
    const r = await readRows(Promise.resolve({ data: [{ handle: 'a' }], error: null }))
    expect(r).toEqual({ type: 'ok', data: [{ handle: 'a' }] })
  })

  it('treats zero rows as ok, leaving the judgment to the caller', async () => {
    const r = await readRows(Promise.resolve({ data: [], error: null }))
    expect(r).toEqual({ type: 'ok', data: [] })
  })

  it('collapses a null payload to an empty array', async () => {
    const r = await readRows(Promise.resolve({ data: null, error: null }))
    expect(r).toEqual({ type: 'ok', data: [] })
  })

  // A read that failed still comes back as an ENVELOPE — the database didn't
  // give us one, so we build it, carrying what we know.
  it('builds a fault envelope from a read error', async () => {
    const r = await readRows(
      Promise.resolve({ data: null, error: { message: 'nope', code: '42501', details: 'why' } }),
    )
    expect(r).toEqual({
      type: 'not-ok', severity: 'fault', message: 'nope', dbcode: '42501', detail: 'why',
    })
  })

  it('builds one from a thrown rejection too', async () => {
    const r = await readRows(Promise.reject(new TypeError('Load failed')))
    expect(r).toMatchObject({ type: 'not-ok', severity: 'fault', message: 'Load failed' })
  })
})

// Nothing is stripped between the wire and the caller: the plan's rule is that
// one shape travels all the way through rather than each layer deciding which
// fields the next one deserves.
describe('runRpc — one shape, always', () => {
  it('keeps dbcode and detail on an ok result', async () => {
    const r = await runRpc<{ n: number }>(
      Promise.resolve({
        data: { type: 'ok', data: { n: 1 }, outcome: 'warning', dbcode: 'PA004', detail: 'why' },
        error: null,
      }),
    )
    expect(r).toEqual({
      type: 'ok', data: { n: 1 }, outcome: 'warning', dbcode: 'PA004', detail: 'why',
    })
  })

  // `field` names which input a validation is about. Nothing renders it yet —
  // the form plumbing is designed but unbuilt — so this pins that the value
  // survives the trip rather than being dropped in a layer on the way.
  it('carries the field a validation is about', async () => {
    const r = await runRpc(
      Promise.resolve({
        data: {
          type: 'not-ok', severity: 'validation', field: 'letters',
          message: '2–15 letters, or ?', dbcode: 'PN001',
        },
        error: null,
      }),
    )
    expect(r).toMatchObject({ severity: 'validation', field: 'letters' })
  })

  it('keeps them on a not-ok result too', async () => {
    const r = await runRpc(
      Promise.resolve({
        data: { type: 'not-ok', severity: 'validation', message: 'Nope', dbcode: 'PN001', detail: 'why' },
        error: null,
      }),
    )
    expect(r).toEqual({
      type: 'not-ok', severity: 'validation', message: 'Nope', dbcode: 'PN001', detail: 'why',
    })
  })

  // A declared fault passes through UNCHANGED, like any other envelope. The
  // modal is already up; what keeps a call site from rendering it is that it
  // bails on anything that isn't `ok`, not that we hid it.
  it('passes a declared fault through unchanged, and reports it', async () => {
    const envelope = { type: 'not-ok', severity: 'fault', message: 'Broken', dbcode: 'PN500' }
    const r = await runRpc(Promise.resolve({ data: envelope, error: null }))
    expect(r).toEqual(envelope)
    // It arrives HTTP 200, so the seam never saw it — without this the modal
    // would never appear and `severity: 'fault'` would mean two different
    // things depending on how the fault arose.
    const [fault] = peekFaultsForTest()
    expect(fault.text).toBe('Broken')
    expect(fault.diagnostics).toContain('dbcode=PN500')
  })

  // A declared fault is the ONLY kind `dbFetch` never sees — it arrives HTTP
  // 200 — so if `runRpc` can't name the call, it is the one fault in the app
  // that can't say where it came from. The name is not passed in: postgrest-js
  // builds every call around a `url`, and reading it keeps the line identical
  // to the seam's with nothing to maintain.
  //
  // PINNED because `url` and `method` are `protected` upstream. If a version
  // bump renames either, this goes red instead of the diagnostics quietly
  // degrading to "rpc" everywhere.
  it('names the call in a declared fault, taken from the builder', async () => {
    // A REAL PostgrestClient, because the whole assertion is about postgrest-js's
    // internals. A hand-made object with a `url` on it would pass whatever
    // upstream did.
    const client = new PostgrestClient('http://local/rest/v1', {
      fetch: (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ type: 'not-ok', severity: 'fault', message: 'Broken', dbcode: 'PN500' }),
            { headers: { 'content-type': 'application/json' } },
          ),
        )) as never,
    })
    await runRpc(client.schema('common').rpc('create_club', { club_name: 'x' }))
    const [fault] = peekFaultsForTest()
    expect(fault.diagnostics).toContain('POST /rest/v1/rpc/create_club')
  })

  it('falls back to a bare label when the builder has no url', async () => {
    const envelope = { type: 'not-ok', severity: 'fault', message: 'Broken', dbcode: 'PN500' }
    await runRpc(Promise.resolve({ data: envelope, error: null }))
    expect(peekFaultsForTest()[0].diagnostics).toContain('| rpc |')
  })

  it('builds a fault envelope when the reply is not an envelope at all', async () => {
    const r = await runRpc(Promise.resolve({ data: 'won', error: null }))
    expect(r).toMatchObject({ type: 'not-ok', severity: 'fault' })
    // No dbcode: the call SUCCEEDED, so there is no Postgres error to carry.
    // The unreadable body is the only evidence there is, so it must survive.
    expect(r).not.toHaveProperty('dbcode')
    expect((r as { detail?: string }).detail).toBe('rawBody: "won"')
    expect(peekFaultsForTest()).toHaveLength(1)
  })

  // Postgres's HINT is the most useful field in many raw faults, and the
  // envelope has one debugging slot — so it is folded in, not dropped.
  it("keeps Postgres's hint alongside the detail on a raw fault", async () => {
    const r = await runRpc(
      Promise.resolve({
        data: null,
        error: {
          message: 'permission denied for table clubs',
          code: '42501',
          details: null,
          hint: 'Grant the required privileges to the current role',
        },
      }),
    )
    expect(r).toMatchObject({
      type: 'not-ok',
      severity: 'fault',
      dbcode: '42501',
      detail: 'Grant the required privileges to the current role',
    })
  })

  it('joins detail and hint when both arrive', async () => {
    const r = await runRpc(
      Promise.resolve({
        data: null,
        error: { message: 'boom', code: '23514', details: 'Failing row contains (…)', hint: 'try less' },
      }),
    )
    expect((r as { detail?: string }).detail).toBe('Failing row contains (…) — try less')
  })
})

describe('the [db] line', () => {
  // Every field prints every time, so the same fact is always in the same
  // position — a blank is information (no dbcode = nothing raised; no status =
  // the server never answered).
  it('emits every field in a fixed order, blank when unknown', () => {
    expect(diagnosticsLine('SLOW', { call: 'GET /rest/v1/games', status: 200, ms: 5210 })).toMatch(
      /^\d\d:\d\d:\d\d\.\d\d\d \| SLOW \| GET \/rest\/v1\/games \| severity= \| outcome= \| dbcode= \| status=200 \| ms=5210 \| field= \| detail=$/,
    )
  })

  // A blank field is a promise that we LOOKED and there was nothing. A line
  // written before the body was read can't keep it, so it omits those fields
  // instead of printing them empty.
  it('omits the answer fields on the slow line', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logSlow({ call: 'POST /rest/v1/rpc/delete_game', ms: 5210, detail: 'online=true' })
    const line = spy.mock.calls[0][0] as string
    expect(line).toBe(
      line.replace(/\| (severity|outcome|dbcode|status|field)=/g, '| SHOULD-NOT-BE-HERE='),
    )
    expect(line).toContain('| SLOW | POST /rest/v1/rpc/delete_game | ms=5210 |')
    // Restored so the next test's spy starts empty — `vi.spyOn` on an
    // already-spied method hands back THIS spy, calls and all.
    spy.mockRestore()
  })

  // Postgres hands back hints like `Perhaps you meant "clubs.name"`, and an
  // unescaped quote breaks the line exactly where it is most worth reading.
  it('escapes quotes inside free text', () => {
    const line = diagnosticsLine('FAULT', {
      call: 'GET /rest/v1/clubs',
      detail: 'Perhaps you meant "clubs.name".',
    })
    expect(line).toContain('detail="Perhaps you meant \\"clubs.name\\"."')
  })

  // The modal and <ErrorPage> lead with the message, so repeating it under
  // them would say the same thing twice.
  it('logs the message but leaves it out of the diagnostics', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const diagnostics = logDb('ERROR', { call: 'POST /rest/v1/rpc/delete_game' }, 'Already deleted')
    expect(spy.mock.calls[0][0]).toContain('msg="Already deleted"')
    expect(diagnostics).not.toContain('msg=')
  })
})

describe('reportDbFault', () => {
  it('words an offline failure itself, naming no action', () => {
    reportDbFault({ call: 'GET /rest/v1/clubs' }, environmentalEnvelope(true))
    const [fault] = peekFaultsForTest()
    expect(fault.text).toBe('You appear to be offline. Please refresh and try again.')
    // It must NOT claim the call did or didn't land — the link can die on the
    // way back, after the write committed.
    expect(String(fault.text)).not.toMatch(/didn't send|wasn't saved|failed to/i)
  })

  it('puts the call in the diagnostics rather than the sentence', () => {
    reportDbFault({ call: 'POST /rest/v1/rpc/submit_guess' }, environmentalEnvelope(false))
    const [fault] = peekFaultsForTest()
    expect(fault.diagnostics).toContain('POST /rest/v1/rpc/submit_guess')
    expect(fault.text).not.toContain('submit_guess')
  })

  it('shows a raw fault its own text, since nobody wrote one for it', () => {
    reportDbFault(
      { call: 'POST /rest/v1/rpc/submit_guess' },
      faultEnvelope(
        { code: '23514', message: 'violates check constraint "players_guesses_remaining_check"' },
        'unused',
      ),
    )
    const [fault] = peekFaultsForTest()
    expect(fault.text).toContain('players_guesses_remaining_check')
    expect(fault.diagnostics).toContain('dbcode=23514')
  })

  it('shows a declared fault the sentence its author wrote', () => {
    reportDbFault({ call: 'POST /rest/v1/rpc/submit_guess' }, {
      type: 'not-ok',
      severity: 'fault',
      message: 'That word is not on the board',
      dbcode: 'PN500',
      detail: 'guess absent from games.words',
    })
    const [fault] = peekFaultsForTest()
    expect(fault.text).toBe('That word is not on the board')
    expect(fault.diagnostics).toContain('dbcode=PN500')
    expect(fault.diagnostics).toContain('guess absent from games.words')
  })
})
