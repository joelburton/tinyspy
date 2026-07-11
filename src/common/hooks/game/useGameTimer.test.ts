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

const { rpcMock, maybeSingleMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}))

vi.mock('../../db', () => ({
  db: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
    }),
    rpc: rpcMock,
  },
}))

import { useGameTimer, formatTimerSeconds } from './useGameTimer'

beforeEach(() => {
  vi.useFakeTimers()
  maybeSingleMock.mockResolvedValue({ data: { ticks: 0 } })
  rpcMock.mockResolvedValue({ data: 0, error: null })
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
    rpcMock.mockResolvedValue({ data: 3, error: null })
    const { result } = renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countup' }, paused: false, running: true }),
    )
    await flush()
    expect(result.current.displaySeconds).toBe(3)
  })

  it('countdown display is max(0, seconds - ticks)', async () => {
    rpcMock.mockResolvedValue({ data: 4, error: null })
    const { result } = renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countdown', seconds: 10 }, paused: false, running: true }),
    )
    await flush()
    expect(result.current.displaySeconds).toBe(6)
    expect(result.current.expired).toBe(false)
  })

  it('flips `expired` when a countdown reaches 0 and never goes negative', async () => {
    rpcMock.mockResolvedValue({ data: 12, error: null }) // past the 10s duration
    const { result } = renderHook(() =>
      useGameTimer({ gameId: 'g', mode: { kind: 'countdown', seconds: 10 }, paused: false, running: true }),
    )
    await flush()
    expect(result.current.displaySeconds).toBe(0)
    expect(result.current.expired).toBe(true)
  })

  it('does not drive while paused (count stops), but still seeds from the read', async () => {
    maybeSingleMock.mockResolvedValue({ data: { ticks: 5 } })
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

  it('never rewinds the display when a later read reports fewer ticks', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: 5, error: null })
      .mockResolvedValue({ data: 3, error: null }) // out-of-order / stale
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
      .mockResolvedValueOnce({ data: 70, error: null }) // past the duration → expired
      .mockResolvedValue({ data: 1, error: null }) // common.reset_game zeroed the clock
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
