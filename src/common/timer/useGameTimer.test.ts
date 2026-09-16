// cs-blessed-timer

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
import { useGameTimer } from './useGameTimer'

/** `common.tick_timer`'s answer when it advanced the clock. Every key of the ok
 *  envelope is present and null (docs/envelopes.md → the shape is the
 *  contract), which is 200 characters in which only the count ever differs
 *  between specs — so only the count is written at a call. */
const ticked = (n: number) => ({
  data: {
    type: 'ok', data: { result: 'ticked', ticks: n }, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
})

beforeEach(() => {
  vi.useFakeTimers()
  seedMock.mockResolvedValue({ data: [{ ticks: 0 }], error: null, status: 200 })
  rpcMock.mockResolvedValue(ticked(0))
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
    rpcMock.mockResolvedValue(ticked(3))
    const { result } = renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countup' }, paused: false, running: true }),
    )
    await flush()
    expect(result.current.displaySeconds).toBe(3)
  })

  it('countdown display is max(0, seconds - ticks)', async () => {
    rpcMock.mockResolvedValue(ticked(4))
    const { result } = renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countdown', seconds: 10 }, paused: false, running: true }),
    )
    await flush()
    expect(result.current.displaySeconds).toBe(6)
    expect(result.current.expired).toBe(false)
  })

  it('flips `expired` when a countdown reaches 0 and never goes negative', async () => {
    rpcMock.mockResolvedValue(ticked(12)) // past the 10s duration
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
   * Dropping every one would hide the interesting half: a raw Postgres fault
   * here — a broken `common.timers`, a lost grant — is a real bug arriving
   * with a real SQLSTATE, and it would vanish once a second.
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

  it('SCREAMS for a code it never declared', async () => {
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
      .mockResolvedValueOnce(ticked(5))
      .mockResolvedValue(ticked(3)) // out-of-order / stale
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
      .mockResolvedValueOnce(ticked(70)) // past the duration → expired
      .mockResolvedValue(ticked(1)) // common.reset_game zeroed the clock
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
