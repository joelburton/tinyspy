import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isEnvelope, isOurCode, presentDbFault, readRows } from './dbResult'
import { clearFaultsForTest, peekFaultsForTest } from '../fault/faultStore'

/**
 * The new server-result system's own tests (plans/error-system.md).
 *
 * Two of these are load-bearing for the whole design:
 *
 *   - `isOurCode` must accept ONLY our two classes. Every other SQLSTATE in
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

describe('isOurCode', () => {
  it('accepts our two classes', () => {
    expect(isOurCode('PA000')).toBe(true)
    expect(isOurCode('PN999')).toBe(true)
  })

  // The class carries the meaning, so a code from PL/pgSQL's own P0 class is
  // rejected on its second character alone.
  it("rejects PL/pgSQL's class and the privilege codes", () => {
    expect(isOurCode('P0001')).toBe(false)
    expect(isOurCode('P0002')).toBe(false)
    expect(isOurCode('42501')).toBe(false)
  })

  it("rejects Postgres's own codes and malformed ones", () => {
    expect(isOurCode('23514')).toBe(false) // check violation
    expect(isOurCode('40P01')).toBe(false) // deadlock
    expect(isOurCode('PA00')).toBe(false) // too short
    expect(isOurCode('PA0000')).toBe(false) // too long
    expect(isOurCode('pa001')).toBe(false) // lowercase
    expect(isOurCode('PB001')).toBe(false) // not one of our classes
    expect(isOurCode(undefined)).toBe(false)
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

  // `faulted` and not a message: the seam already presented and logged, so
  // there is nothing for the call site to render.
  it('reports an error as faulted, with nothing to say', async () => {
    const r = await readRows(Promise.resolve({ data: null, error: { message: 'nope', code: '42501' } }))
    expect(r).toEqual({ type: 'faulted' })
  })

  it('reports a thrown rejection as faulted', async () => {
    const r = await readRows(Promise.reject(new TypeError('Load failed')))
    expect(r).toEqual({ type: 'faulted' })
  })
})

describe('presentDbFault', () => {
  it('words an offline failure itself, naming no action', () => {
    presentDbFault({ where: 'GET /rest/v1/clubs', kind: 'offline' })
    const [fault] = peekFaultsForTest()
    expect(fault.text).toBe('You appear to be offline. Please refresh and try again.')
    // It must NOT claim the call did or didn't land — the link can die on the
    // way back, after the write committed.
    expect(String(fault.text)).not.toMatch(/didn't send|wasn't saved|failed to/i)
  })

  it('puts the call in the diagnostics rather than the sentence', () => {
    presentDbFault({ where: 'POST /rest/v1/rpc/submit_guess', kind: 'unreachable' })
    const [fault] = peekFaultsForTest()
    expect(fault.diagnostics).toContain('POST /rest/v1/rpc/submit_guess')
    expect(fault.text).not.toContain('submit_guess')
  })

  it('shows a raw fault its own text, since nobody wrote one for it', () => {
    presentDbFault({
      where: 'POST /rest/v1/rpc/submit_guess',
      kind: 'raw',
      error: { code: '23514', message: 'violates check constraint "players_guesses_remaining_check"' },
    })
    const [fault] = peekFaultsForTest()
    expect(fault.text).toContain('players_guesses_remaining_check')
    expect(fault.diagnostics).toContain('dbcode=23514')
  })

  it('shows a declared fault the sentence its author wrote', () => {
    presentDbFault({
      where: 'POST /rest/v1/rpc/submit_guess',
      kind: 'declared',
      envelope: {
        type: 'not-ok',
        severity: 'fault',
        message: 'That word is not on the board',
        dbcode: 'PN500',
        detail: 'guess absent from games.words',
      },
    })
    const [fault] = peekFaultsForTest()
    expect(fault.text).toBe('That word is not on the board')
    expect(fault.diagnostics).toContain('dbcode=PN500')
    expect(fault.diagnostics).toContain('guess absent from games.words')
  })
})
