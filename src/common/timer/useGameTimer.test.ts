// cs-unmet

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

/**
 * Tests for the additive-tick timer hook.
 *
 * The hook reads `common.timers.ticks` (initial seed) and drives the
 * shared count via the `tick_timer` RPC once a second. We mock the
 * common db client so we can pin what `ticks` the server reports,
 * then assert the display mapping + the driver gating (paused / not
 * running / untimed → no RPC). Fake timers + `advanceTimersByTimeAsync`
 * flush the hook's async reads.
 */

const { rpcMock, seedMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  seedMock: vi.fn(),
}))

vi.mock('../supabase/db', () => ({
  db: {
    from: () => ({
      // `readRows` awaits `.eq()` directly and gets ROWS — no `.maybeSingle()`.
      select: () => ({ eq: seedMock }),
    }),
    rpc: rpcMock,
  },
}))

import { clearFaultsForTest, peekFaultsForTest } from '../faults/faultStore'
import { useGameTimer, formatTimerSeconds } from './useGameTimer'

beforeEach(() => {
  vi.useFakeTimers()
  seedMock.mockResolvedValue({ data: [{ ticks: 0 }], error: null, status: 200 })
  rpcMock.mockResolvedValue({ data: { type: 'ok', data: { result: 'ticked', ticks: 0 }, outcome: null, severity: null, message: null, field: null, meta: null, dbcode: null, detail: null }, error: null })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

/** Flush the immediate driver call + initial read (and any pending
 *  microtasks) without advancing wall time. */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

describe('useGameTimer', () => {
  it('is inert in "none" mode and never calls tick_timer', async () => {
    const { result } = renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'none' }, paused: false, running: true }),
    )
    await flush()
    expect(result.current.displaySeconds).toBe(0)
    expect(result.current.expired).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('countup display equals the tick count', async () => {
    rpcMock.mockResolvedValue({ data: { type: 'ok', data: { result: 'ticked', ticks: 3 }, outcome: null, severity: null, message: null, field: null, meta: null, dbcode: null, detail: null }, error: null })
    const { result } = renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countup' }, paused: false, running: true }),
    )
    await flush()
    expect(result.current.displaySeconds).toBe(3)
  })

  it('countdown display is max(0, seconds - ticks)', async () => {
    rpcMock.mockResolvedValue({ data: { type: 'ok', data: { result: 'ticked', ticks: 4 }, outcome: null, severity: null, message: null, field: null, meta: null, dbcode: null, detail: null }, error: null })
    const { result } = renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countdown', seconds: 10 }, paused: false, running: true }),
    )
    await flush()
    expect(result.current.displaySeconds).toBe(6)
    expect(result.current.expired).toBe(false)
  })

  it('flips `expired` when a countdown reaches 0 and never goes negative', async () => {
    rpcMock.mockResolvedValue({ data: { type: 'ok', data: { result: 'ticked', ticks: 12 }, outcome: null, severity: null, message: null, field: null, meta: null, dbcode: null, detail: null }, error: null }) // past the 10s duration
    const { result } = renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countdown', seconds: 10 }, paused: false, running: true }),
    )
    await flush()
    expect(result.current.displaySeconds).toBe(0)
    expect(result.current.expired).toBe(true)
  })

  it('does not drive while paused (count stops), but still seeds from the read', async () => {
    seedMock.mockResolvedValue({ data: [{ ticks: 5 }], error: null, status: 200 })
    const { result } = renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countup' }, paused: true, running: true }),
    )
    await flush()
    expect(result.current.displaySeconds).toBe(5) // seeded from the initial read
    expect(rpcMock).not.toHaveBeenCalled() // paused → driver off
  })

  it('does not drive while not running (terminal / loading)', async () => {
    const { result } = renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countup' }, paused: false, running: false }),
    )
    await flush()
    expect(rpcMock).not.toHaveBeenCalled()
    expect(result.current.displaySeconds).toBe(0)
  })

  /**
   * **Which not-ok this poll may swallow, and which it may not.**
   *
   * It used to drop every one, which is what hid the interesting half: a raw
   * Postgres fault here — a broken `common.timers`, a lost grant — is a real
   * bug arriving with a real SQLSTATE, and it vanished once a second.
   */
  const notOk = (dbcode: string | null) => ({
    data: {
      type: 'not-ok', data: null, outcome: null, severity: 'fault',
      message: 'nope', field: null, meta: null, dbcode, detail: null,
    },
    error: null,
  })

  it('swallows a poll that nothing answered — the offline case', async () => {
    clearFaultsForTest()
    // Nothing answered: postgrest reports a rejected fetch as `status: 0` with
    // an error, NOT as a not-ok envelope at 200. `runRpc` turns that into an
    // environmental envelope whose dbcode is null, because nothing raised.
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'TypeError: Failed to fetch', code: '' },
      status: 0,
    })
    renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countup' }, paused: false, running: true }),
    )
    await flush()
    expect(peekFaultsForTest()).toHaveLength(0)
  })

  // The point of `presentFaults: false`: two treatments for one call. The
  // transport failures above are silent; this one is SHOWN, because a
  // signed-out player should be told (Joel). And it is shown as ITSELF, not as
  // a bug — the chain declines to call a declared refusal unhandled.
  it('shows a lapsed session, in the RPC own words', async () => {
    clearFaultsForTest()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpcMock.mockResolvedValue(notOk('PN011'))
    renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countup' }, paused: false, running: true }),
    )
    await flush()
    const shown = peekFaultsForTest().map((f) => String(f.text))
    expect(shown).toContain('nope')
    expect(shown.join(' ')).not.toContain('fell through to unhandled')
  })

  it('SCREAMS for a code it never declared — a bug it used to swallow', async () => {
    clearFaultsForTest()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpcMock.mockResolvedValue(notOk('42P01')) // undefined_table: common.timers is gone
    renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countup' }, paused: false, running: true }),
    )
    await flush()
    expect(peekFaultsForTest().map((f) => String(f.text)).join(' ')).toContain(
      'fell through to unhandled',
    )
  })

  it('never rewinds the display when a later read reports fewer ticks', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: { type: 'ok', data: { result: 'ticked', ticks: 5 }, outcome: null, severity: null, message: null, field: null, meta: null, dbcode: null, detail: null }, error: null })
      .mockResolvedValue({ data: { type: 'ok', data: { result: 'ticked', ticks: 3 }, outcome: null, severity: null, message: null, field: null, meta: null, dbcode: null, detail: null }, error: null }) // out-of-order / stale
    const { result } = renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countup' }, paused: false, running: true }),
    )
    await flush()
    expect(result.current.displaySeconds).toBe(5)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000) // next interval call returns 3
    })
    expect(result.current.displaySeconds).toBe(5) // held by Math.max
  })

  it('accepts a LARGE backward jump — the server clock was reset (replay-board)', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: { type: 'ok', data: { result: 'ticked', ticks: 70 }, outcome: null, severity: null, message: null, field: null, meta: null, dbcode: null, detail: null }, error: null }) // past the duration → expired
      .mockResolvedValue({ data: { type: 'ok', data: { result: 'ticked', ticks: 1 }, outcome: null, severity: null, message: null, field: null, meta: null, dbcode: null, detail: null }, error: null }) // common.reset_game zeroed the clock
    const { result } = renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countdown', seconds: 60 }, paused: false, running: true }),
    )
    await flush()
    expect(result.current.expired).toBe(true) // the game timed out…
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000) // …then a replay reset the clock
    })
    expect(result.current.displaySeconds).toBe(59) // followed the reset down
    expect(result.current.expired).toBe(false) // a fresh countdown, not a re-loss
  })
})

describe('formatTimerSeconds', () => {
  it('formats as M:SS with zero-padded seconds', () => {
    expect(formatTimerSeconds(0)).toBe('0:00')
    expect(formatTimerSeconds(9)).toBe('0:09')
    expect(formatTimerSeconds(60)).toBe('1:00')
    expect(formatTimerSeconds(125)).toBe('2:05')
    expect(formatTimerSeconds(600)).toBe('10:00')
  })
})
