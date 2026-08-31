// cs-unmet

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgrestClient } from '@supabase/postgrest-js'
import {
  diagnosticsLine, environmentalEnvelope, faultEnvelope, _isEnvelope, logDb, logSlow,
  notOkOutcome, reportDbFault, readRows, runEdgeFn, runRpc,
} from './dbResult'
import { clearFaultsForTest, peekFaultsForTest } from '../fault/faultStore'

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: mockInvoke } } }))

/**
 * The new server-result system's own tests (plans/error-system.md).
 *
 * The load-bearing one: zero rows must be `ok`. An empty result is a correct
 * protocol answer, and only a caller can know it is impossible — so a helper
 * that treated it as a failure would take that judgment away from the one place
 * that has it.
 */

/**
 * An envelope with EVERY key — the nine that always travel — so an assertion
 * below states the whole shape rather than a subset of it.
 *
 * That is the point of exact equality here: this file is where the shape IS the
 * contract, and `toMatchObject` would pass an envelope that had quietly lost a
 * key. Spelling the nulls out at each call site would bury the one or two
 * fields a given test is actually about.
 */
const env = (partial: Record<string, unknown>) => ({
  type: null,
  data: null,
  outcome: null,
  severity: null,
  message: null,
  field: null,
  meta: null,
  dbcode: null,
  detail: null,
  ...partial,
})

beforeEach(() => {
  clearFaultsForTest()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

/**
 * **Nothing answered: every wrapper says the same thing.**
 *
 * This is the guard for the failure that had none, and its absence is why the
 * two authors drifted (plans/envelope-layering.md). `dbFetch` words a request
 * that never reached the server — "You appear to be offline…" — and shows it.
 * The three wrappers used to word it again from the browser's own opaque
 * string, so a player saw a modal and a pill disagreeing about one event.
 *
 * `status: 0` is the signal: postgrest-js sets it on its fetch-rejection path
 * and only there, and `callEdgeFn` matches it for the same case.
 *
 * The browser's string is not thrown away — it moves to `detail`, which is the
 * one field that separates a dead socket from a TLS failure. It just stops
 * being the sentence a player reads.
 */
describe('a request nothing answered', () => {
  const OFFLINE = 'You appear to be offline. Please refresh and try again.'
  const UNREACHABLE = "The server didn't answer. Please refresh and try again."

  /** `navigator.onLine` picks WHICH sentence; both are pinned below. */
  const setOnline = (online: boolean) =>
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)

  const rejected = {
    data: null,
    error: { message: 'TypeError: Failed to fetch', code: '' },
    status: 0,
  }

  it('readRows says the frontend sentence, not the browser string', async () => {
    setOnline(false)
    const r = await readRows(Promise.resolve(rejected))
    expect(r).toMatchObject({ type: 'not-ok', severity: 'fault', message: OFFLINE })
  })

  it('runRpc says it too', async () => {
    setOnline(false)
    const r = await runRpc(Promise.resolve(rejected))
    expect(r).toMatchObject({ type: 'not-ok', severity: 'fault', message: OFFLINE })
  })

  it('runEdgeFn says it too', async () => {
    setOnline(false)
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    const r = await runEdgeFn('anything', {})
    expect(r).toMatchObject({ type: 'not-ok', severity: 'fault', message: OFFLINE })
  })

  it('picks the unreachable sentence when the device thinks it is online', async () => {
    setOnline(true)
    const r = await readRows(Promise.resolve(rejected))
    expect(r).toMatchObject({ message: UNREACHABLE })
  })

  it('keeps the browser string as the DETAIL, where it is worth having', async () => {
    setOnline(false)
    const r = await readRows(Promise.resolve(rejected))
    expect(r.detail).toContain('TypeError: Failed to fetch')
  })

  // The other half of the rule. Without this, a wrapper that ALWAYS said the
  // offline sentence would pass every test above.
  it('leaves a real server error alone — something did answer', async () => {
    setOnline(false)
    const r = await readRows(
      Promise.resolve({
        data: null,
        error: { message: 'permission denied', code: '42501' },
        status: 403,
      }),
    )
    expect(r).toMatchObject({ message: 'permission denied', dbcode: '42501' })
  })

  // dbFetch has already presented this one; a second modal from the wrapper is
  // the same news twice (plans/envelope-layering.md §1).
  it('raises no modal of its own — dbFetch already did', async () => {
    setOnline(false)
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    await runEdgeFn('anything', {})
    expect(peekFaultsForTest()).toHaveLength(0)
  })
})

describe('_isEnvelope', () => {
  it('accepts both branches', () => {
    expect(_isEnvelope({ type: 'ok' })).toBe(true)
    expect(_isEnvelope({ type: 'not-ok', severity: 'fault' })).toBe(true)
  })

  // Plenty of non-envelopes arrive on this path; each must fall through cleanly
  // rather than be half-read as one.
  it('rejects the other shapes an RPC can return', () => {
    expect(_isEnvelope('won')).toBe(false)
    expect(_isEnvelope(3)).toBe(false)
    expect(_isEnvelope(null)).toBe(false)
    expect(_isEnvelope([{ id: 'x' }])).toBe(false)
    expect(_isEnvelope({ result: 'accepted', points: 5 })).toBe(false)
    expect(_isEnvelope({ type: 'accepted' })).toBe(false)
  })
})

describe('readRows', () => {
  it('hands back the rows on success', async () => {
    const r = await readRows(Promise.resolve({ data: [{ handle: 'a' }], error: null }))
    expect(r).toEqual(env({ type: 'ok', data: [{ handle: 'a' }] }))
  })

  it('treats zero rows as ok, leaving the judgment to the caller', async () => {
    const r = await readRows(Promise.resolve({ data: [], error: null }))
    expect(r).toEqual(env({ type: 'ok', data: [] }))
  })

  it('collapses a null payload to an empty array', async () => {
    const r = await readRows(Promise.resolve({ data: null, error: null }))
    expect(r).toEqual(env({ type: 'ok', data: [] }))
  })

  // A read that failed still comes back as an ENVELOPE — the database didn't
  // give us one, so we build it, carrying what we know.
  it('builds a fault envelope from a read error', async () => {
    const r = await readRows(
      Promise.resolve({ data: null, error: { message: 'nope', code: '42501', details: 'why' } }),
    )
    expect(r).toEqual(
      env({ type: 'not-ok', severity: 'fault', message: 'nope', dbcode: '42501', detail: 'why' }),
    )
  })

  // A THROW is "nothing answered" by another road, so it gets that sentence
  // rather than the browser's. postgrest-js converts a rejected fetch into
  // `{ error, status: 0 }` before it reaches here, so what this actually
  // exercises is a throw from some other layer.
  it('says the frontend sentence for a thrown rejection too', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const r = await readRows(Promise.reject(new TypeError('Load failed')))
    expect(r).toMatchObject({
      type: 'not-ok',
      severity: 'fault',
      message: 'You appear to be offline. Please refresh and try again.',
    })
    // Not discarded — kept where it is useful and invisible to players.
    expect(r.detail).toContain('Load failed')
  })

  // ── Pointed at an RPC ────────────────────────────────────────
  // The cast is the point: TypeScript rejects `readRows(db.rpc(…))` because an
  // RPC resolves to `data: T | null`, not `Row[]` — but a `returns setof`
  // function slips through that, and so does any cast. The envelope would
  // otherwise be nested inside `data`, where its own `type` and `severity`
  // are invisible to every call site.
  it('faults when handed an RPC envelope instead of rows', async () => {
    const envelope = { type: 'not-ok', severity: 'race', message: 'too late' }
    const r = await readRows(
      Promise.resolve({ data: envelope, error: null }) as unknown as Promise<
        { data: unknown[] | null; error: null }
      >,
    )
    expect(r).toMatchObject({
      type: 'not-ok',
      severity: 'fault',
      message: 'BUG: a table read did not answer with rows',
    })
    expect(r.detail).toContain('an RPC envelope')
    // The modal is raised here, like every other fault the wrappers detect.
    expect(peekFaultsForTest()).toHaveLength(1)
  })

  it('faults on a scalar too, and says what it got', async () => {
    const r = await readRows(
      Promise.resolve({ data: 42, error: null }) as unknown as Promise<
        { data: unknown[] | null; error: null }
      >,
    )
    expect(r).toMatchObject({ type: 'not-ok', severity: 'fault' })
    expect(r.detail).toContain('a number')
  })
})

// Nothing is stripped between the wire and the caller: the plan's rule is that
// one shape travels all the way through rather than each layer deciding which
// fields the next one deserves.
describe('runRpc — one shape, always', () => {
  it('keeps dbcode and detail on an ok result', async () => {
    const r = await runRpc<{ n: number }>(
      Promise.resolve({
        data: env({ type: 'ok', data: { n: 1 }, outcome: 'warning', dbcode: 'PA004', detail: 'why' }),
        error: null,
      }),
    )
    expect(r).toEqual(
      env({ type: 'ok', data: { n: 1 }, outcome: 'warning', dbcode: 'PA004', detail: 'why' }),
    )
  })

  // `field` names which input a validation is about. Nothing renders it yet —
  // the form plumbing is designed but unbuilt — so this pins that the value
  // survives the trip rather than being dropped in a layer on the way.
  it('carries the field a validation is about', async () => {
    const r = await runRpc(
      Promise.resolve({
        data: {
          type: 'not-ok', severity: 'form-validation', field: 'letters',
          message: '2–15 letters, or ?', dbcode: 'PN001',
        },
        error: null,
      }),
    )
    expect(r).toMatchObject({ severity: 'form-validation', field: 'letters' })
  })

  it('keeps them on a not-ok result too', async () => {
    const r = await runRpc(
      Promise.resolve({
        data: { type: 'not-ok', severity: 'form-validation', message: 'Nope', dbcode: 'PN001', detail: 'why' },
        error: null,
      }),
    )
    expect(r).toEqual({
      type: 'not-ok', severity: 'form-validation', message: 'Nope', dbcode: 'PN001', detail: 'why',
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
    // The key is PRESENT and null, like every other key on every envelope — the
    // assertion is that it carries no CODE, not that it is missing. Absence
    // stopped being a way to say anything when the builders stopped stripping.
    expect((r as { dbcode: string | null }).dbcode).toBeNull()
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
    const diagnostics = logDb('SERVICE_ERROR', { call: 'POST /rest/v1/rpc/delete_game' }, 'Already deleted')
    expect(spy.mock.calls[0][0]).toContain('msg="Already deleted"')
    expect(diagnostics).not.toContain('msg=')
  })
})

describe('reportDbFault', () => {
  // The two details answer different questions — what the SERVER said, and what
  // the DEVICE knew — so a line carrying one used to silently drop the other.
  it('keeps the transport detail alongside the envelope one', () => {
    reportDbFault(
      { call: 'GET /rest/v1/clubs', detail: 'online=false hidden' },
      faultEnvelope({ message: 'nope', code: '42501', details: 'why' }, 'fallback'),
    )
    const [fault] = peekFaultsForTest()
    expect(fault.diagnostics).toContain('online=false hidden')
    expect(fault.diagnostics).toContain('why')
  })

  it('words an offline failure itself, naming no action', () => {
    // The builder reads `navigator.onLine` rather than taking it, so that two
    // callers cannot ask the same global and disagree about the answer.
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    reportDbFault({ call: 'GET /rest/v1/clubs' }, environmentalEnvelope())
    const [fault] = peekFaultsForTest()
    expect(fault.text).toBe('You appear to be offline. Please refresh and try again.')
    // It must NOT claim the call did or didn't land — the link can die on the
    // way back, after the write committed.
    expect(String(fault.text)).not.toMatch(/didn't send|wasn't saved|failed to/i)
  })

  it('puts the call in the diagnostics rather than the sentence', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    reportDbFault({ call: 'POST /rest/v1/rpc/submit_guess' }, environmentalEnvelope())
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
      data: null,
      outcome: null,
      severity: 'fault',
      message: 'BUG: guess that is not on the board',
      field: null,
      meta: null,
      dbcode: 'PN500',
      detail: 'guess absent from games.words',
    })
    const [fault] = peekFaultsForTest()
    expect(fault.text).toBe('BUG: guess that is not on the board')
    expect(fault.diagnostics).toContain('dbcode=PN500')
    expect(fault.diagnostics).toContain('guess absent from games.words')
  })
})

describe('runEdgeFn — the same shape, through Deno', () => {
  // The status says whether the function RAN, never what it decided. These
  // pin that: an envelope always arrives 200, faults included, and the modal
  // comes from the envelope rather than from the HTTP code.
  beforeEach(() => mockInvoke.mockReset())

  it('hands back an ok envelope', async () => {
    mockInvoke.mockResolvedValue({ data: env({ type: 'ok', data: { id: 'g1' } }), error: null })
    const r = await runEdgeFn<{ id: string }>('boggle-build-board', {})
    expect(r).toEqual(env({ type: 'ok', data: { id: 'g1' } }))
    expect(peekFaultsForTest()).toHaveLength(0)
  })

  it('leaves a validation alone — no modal, the form will say it', async () => {
    const envelope = {
      type: 'not-ok', severity: 'form-validation', field: 'band',
      message: 'No board could be built at that difficulty', dbcode: 'PN500',
    }
    mockInvoke.mockResolvedValue({ data: envelope, error: null })

    const r = await runEdgeFn('boggle-build-board', {})

    expect(r).toEqual(envelope)
    expect(peekFaultsForTest()).toHaveLength(0)
  })

  it('raises the modal for a declared fault, though the call succeeded', async () => {
    // The whole reason this function exists rather than callEdgeFn alone: a
    // fault that arrives 200 is invisible to `dbFetch`, which only reads a
    // non-2xx body. Without this, `severity: fault` would mean two different
    // things depending on which transport carried it.
    mockInvoke.mockResolvedValue({
      data: { type: 'not-ok', severity: 'fault', message: 'Broken', dbcode: 'PN501' },
      error: null,
    })

    await runEdgeFn('boggle-build-board', {})

    const [fault] = peekFaultsForTest()
    expect(fault.text).toBe('Broken')
    expect(fault.diagnostics).toContain('dbcode=PN501')
  })

  it('names the function in the diagnostics', async () => {
    mockInvoke.mockResolvedValue({
      data: { type: 'not-ok', severity: 'fault', message: 'Broken' },
      error: null,
    })
    await runEdgeFn('waffle-build-board', {})
    expect(peekFaultsForTest()[0].diagnostics).toContain('/functions/v1/waffle-build-board')
  })

  it('treats a body that is not an envelope as a fault', async () => {
    // An unconverted function still answering `{ id }`, or anything else no
    // caller can read.
    mockInvoke.mockResolvedValue({ data: { id: 'g1' }, error: null })

    const r = await runEdgeFn('boggle-build-board', {})

    expect(r).toMatchObject({ type: 'not-ok', severity: 'fault' })
    expect(peekFaultsForTest()[0].text).toContain('unreadable')
  })

  // Still a fault, but NOT a second modal. A `/functions/v1/` path is not
  // `isSupabaseInternal`, so `dbFetch` has already presented this one —
  // reporting again here was the same news twice, and the poorer telling of
  // the two, since nothing at this layer can rebuild that diagnostics line.
  it('treats a function that never answered as a fault, without a second modal', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'network down' } })

    const r = await runEdgeFn('boggle-build-board', {})

    expect(r).toMatchObject({ type: 'not-ok', severity: 'fault' })
    expect(peekFaultsForTest()).toHaveLength(0)
  })
})

// The override is the ONE field on a `[db]` line you cannot infer from the
// others, so a not-ok that carries it has to print it. It was dropped for a
// while: `envelopeFields` logged `outcome` only on the ok arm, correct until a
// not-ok could carry one, after which `outcome=` blank meant both "no override"
// and "an override we didn't print".
describe('the [db] line carries a not-ok outcome', () => {
  it('logs an override the author set on a failure', async () => {
    // `mockClear`: an earlier test in this file spied `console.warn` without
    // restoring it, so a fresh `spyOn` hands back the SAME spy with its calls
    // still on it, and `calls[0]` would be somebody else's line.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warn.mockClear()
    await runRpc(
      Promise.resolve({
        data: env({
          type: 'not-ok', severity: 'race', outcome: 'lost',
          message: 'That game was already deleted', dbcode: 'PN010',
        }),
        error: null,
      }),
    )
    expect(warn.mock.calls[0][0]).toContain('severity=race')
    expect(warn.mock.calls[0][0]).toContain('outcome=lost')
  })

  it('leaves it blank when the severity default applies', async () => {
    // `mockClear`: an earlier test in this file spied `console.warn` without
    // restoring it, so a fresh `spyOn` hands back the SAME spy with its calls
    // still on it, and `calls[0]` would be somebody else's line.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warn.mockClear()
    await runRpc(
      Promise.resolve({
        data: env({ type: 'not-ok', severity: 'race', message: 'Someone got there first' }),
        error: null,
      }),
    )
    expect(warn.mock.calls[0][0]).toContain('outcome= |')
  })
})

// A signature violation, not a game's problem: a non-null message means "render
// this" and the outcome is how it renders, so an `ok` with one and not the other
// leaves a call site nothing to do but guess — and a guess turns a server bug
// into a pill nobody questions.
describe('an ok that breaks its own contract', () => {
  it('faults on a message with no outcome', async () => {
    const r = await runRpc(
      Promise.resolve({
        data: env({ type: 'ok', data: { x: 1 }, message: 'Already guessed' }),
        error: null,
      }),
    )
    expect(r).toMatchObject({ type: 'not-ok', severity: 'fault' })
    // Its OWN sentence, not the unreadable-body one: a player who quotes this
    // back has to be identifiable as this failure rather than that one.
    const [fault] = peekFaultsForTest()
    expect(fault.text).toBe("The server's answer was incomplete.")
    expect(fault.diagnostics).toContain('a message with no outcome')
  })

  it('lets an ok with BOTH through, and one with neither', async () => {
    const withBoth = await runRpc(
      Promise.resolve({
        data: env({ type: 'ok', outcome: 'warning', message: 'Already guessed' }),
        error: null,
      }),
    )
    expect(withBoth.type).toBe('ok')
    const withNeither = await runRpc(
      Promise.resolve({ data: env({ type: 'ok', data: { x: 1 } }), error: null }),
    )
    expect(withNeither.type).toBe('ok')
  })

  // An outcome with no message is the ORDINARY case — the surface composes the
  // words — so it must not trip this.
  it('lets an outcome with no message through', async () => {
    const r = await runRpc(
      Promise.resolve({ data: env({ type: 'ok', outcome: 'won' }), error: null }),
    )
    expect(r.type).toBe('ok')
  })
})

describe('notOkOutcome', () => {
  const notOk = (severity: string, outcome: string | null = null) =>
    ({ ...env({ type: 'not-ok', severity, outcome, message: 'x' }) }) as never

  // The three that read red and the one that doesn't. `race` is the whole
  // reason the defaults aren't a single constant: it is not a losing move, so
  // it must not wear the color of one.
  it('gives each severity its default appearance', () => {
    expect(notOkOutcome(notOk('fault'))).toBe('error')
    expect(notOkOutcome(notOk('form-validation'))).toBe('error')
    expect(notOkOutcome(notOk('service-error'))).toBe('error')
    expect(notOkOutcome(notOk('race'))).toBe('warning')
  })

  // What the `outcome` key on a not-ok is FOR: one race that reads as news
  // rather than as a rejection, without inventing a severity for it.
  it("prefers the author's outcome over the default", () => {
    expect(notOkOutcome(notOk('race', 'noted'))).toBe('noted')
    expect(notOkOutcome(notOk('fault', 'lost'))).toBe('lost')
  })

  // Null means "use the default", NOT "no appearance" — the distinction the
  // always-present-nullable keys exist to make readable.
  it('reads a null outcome as unset, not as an answer', () => {
    expect(notOkOutcome(notOk('race', null))).toBe('warning')
  })
})
