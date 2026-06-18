/**
 * Tests for useRealtimeRefetch — the factory four of the per-game
 * data hooks share. The factory is small but its contract is
 * load-bearing: every game's per-row fetch + refetch loop runs
 * through here, and a regression in the SUBSCRIBED-refetch path
 * (or in the mounted-guard handoff) would propagate to every
 * consumer at once.
 *
 * What's covered:
 *   - Initial load runs on mount.
 *   - SUBSCRIBED status triggers a refetch.
 *   - A postgres-changes event fires the load.
 *   - Multiple-table form: each subscribed table fires the same
 *     load.
 *   - `id` change rebuilds the channel (and removes the old).
 *   - Cleanup on unmount flips `mounted()` to false so the
 *     caller's load can bail out before setState.
 *   - A re-rendered load reference (caller didn't memoize) does
 *     NOT thrash the channel — the deps + ref trick is what
 *     keeps the factory cheap to use.
 *
 * Mocking strategy
 * ----------------
 * Same vi.hoisted + chained-mock shape as useClubChat.test.ts /
 * useCommonGame.test.ts. Each `.on('postgres_changes', ...)`
 * captures the handler keyed by table name so tests can fire
 * specific tables individually.
 */

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockChannel, mockRemoveChannel } = vi.hoisted(() => ({
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}))

vi.mock('../lib/channelDedup', () => ({
  channelDedupSuffix: () => 'test-suffix',
}))

import { useRealtimeRefetch } from './useRealtimeRefetch'

type StatusCallback = (status: string) => void

/** Handlers from `.on('postgres_changes', { table }, handler)`
 *  calls, keyed by table name. Tests fire by table. */
let handlersByTable: Record<string, () => void> = {}
let statusCb: StatusCallback | null = null
/** Names of channels that have been created (in order) — lets
 *  the `id`-changes-rebuild test verify a fresh channel went up
 *  with the new id segment. */
let channelNames: string[] = []

function buildChannel(name: string) {
  channelNames.push(name)
  const ch = {
    on: vi.fn(function (
      this: typeof ch,
      _event: string,
      filter: { table: string },
      handler: () => void,
    ) {
      handlersByTable[filter.table] = handler
      return this
    }),
    subscribe: vi.fn(function (this: typeof ch, cb: StatusCallback) {
      statusCb = cb
      return this
    }),
  }
  return ch
}

beforeEach(() => {
  handlersByTable = {}
  statusCb = null
  channelNames = []
  mockChannel.mockReset()
  mockChannel.mockImplementation((name: string) => buildChannel(name))
  mockRemoveChannel.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

const ONE_TABLE = {
  schema: 'tinyspy',
  table: 'clues',
  filter: 'game_id=eq.g1',
}

describe('useRealtimeRefetch', () => {
  it('fires the load callback once on mount', () => {
    const load = vi.fn().mockResolvedValue(undefined)
    renderHook(() =>
      useRealtimeRefetch({
        tables: ONE_TABLE,
        load,
        channelPrefix: 'clues',
        id: 'g1',
      }),
    )
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('passes a mounted() getter that returns true while the hook is alive', () => {
    let capturedMounted: (() => boolean) | null = null
    const load = vi.fn(async ({ mounted }: { mounted: () => boolean }) => {
      capturedMounted = mounted
    })
    renderHook(() =>
      useRealtimeRefetch({
        tables: ONE_TABLE,
        load,
        channelPrefix: 'clues',
        id: 'g1',
      }),
    )
    expect(capturedMounted).not.toBeNull()
    expect(capturedMounted!()).toBe(true)
  })

  it('flips mounted() to false on unmount so the caller can bail before setState', () => {
    let capturedMounted: (() => boolean) | null = null
    const load = vi.fn(async ({ mounted }: { mounted: () => boolean }) => {
      capturedMounted = mounted
    })
    const { unmount } = renderHook(() =>
      useRealtimeRefetch({
        tables: ONE_TABLE,
        load,
        channelPrefix: 'clues',
        id: 'g1',
      }),
    )
    expect(capturedMounted!()).toBe(true)
    unmount()
    expect(capturedMounted!()).toBe(false)
  })

  it('uses a UUID-suffixed channel name', () => {
    const load = vi.fn().mockResolvedValue(undefined)
    renderHook(() =>
      useRealtimeRefetch({
        tables: ONE_TABLE,
        load,
        channelPrefix: 'clues',
        id: 'g1',
      }),
    )
    expect(channelNames).toEqual(['clues:g1:test-suffix'])
  })

  it('refires the load on SUBSCRIBED status', () => {
    const load = vi.fn().mockResolvedValue(undefined)
    renderHook(() =>
      useRealtimeRefetch({
        tables: ONE_TABLE,
        load,
        channelPrefix: 'clues',
        id: 'g1',
      }),
    )
    expect(load).toHaveBeenCalledTimes(1)
    act(() => statusCb!('SUBSCRIBED'))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not refire on non-SUBSCRIBED statuses', () => {
    const load = vi.fn().mockResolvedValue(undefined)
    renderHook(() =>
      useRealtimeRefetch({
        tables: ONE_TABLE,
        load,
        channelPrefix: 'clues',
        id: 'g1',
      }),
    )
    expect(load).toHaveBeenCalledTimes(1)
    act(() => statusCb!('CHANNEL_ERROR'))
    act(() => statusCb!('CLOSED'))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('refires the load on a postgres_changes event', () => {
    const load = vi.fn().mockResolvedValue(undefined)
    renderHook(() =>
      useRealtimeRefetch({
        tables: ONE_TABLE,
        load,
        channelPrefix: 'clues',
        id: 'g1',
      }),
    )
    expect(load).toHaveBeenCalledTimes(1)
    act(() => handlersByTable['clues']())
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('subscribes to multiple tables when given an array; each fires the load', () => {
    const load = vi.fn().mockResolvedValue(undefined)
    renderHook(() =>
      useRealtimeRefetch({
        tables: [
          { schema: 'psychicnum', table: 'games', filter: 'id=eq.g1' },
          { schema: 'psychicnum', table: 'guesses', filter: 'game_id=eq.g1' },
        ],
        load,
        channelPrefix: 'psychicnum',
        id: 'g1',
      }),
    )
    expect(load).toHaveBeenCalledTimes(1)
    expect(Object.keys(handlersByTable).sort()).toEqual(['games', 'guesses'])

    act(() => handlersByTable['games']())
    expect(load).toHaveBeenCalledTimes(2)

    act(() => handlersByTable['guesses']())
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('rebuilds the channel when `id` changes', () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(
      ({ id }: { id: string }) =>
        useRealtimeRefetch({
          tables: { schema: 'tinyspy', table: 'clues', filter: `game_id=eq.${id}` },
          load,
          channelPrefix: 'clues',
          id,
        }),
      { initialProps: { id: 'g1' } },
    )
    expect(channelNames).toEqual(['clues:g1:test-suffix'])

    rerender({ id: 'g2' })
    expect(channelNames).toEqual([
      'clues:g1:test-suffix',
      'clues:g2:test-suffix',
    ])
    // Old channel was torn down.
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
  })

  it('removes the channel on unmount', () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const { unmount } = renderHook(() =>
      useRealtimeRefetch({
        tables: ONE_TABLE,
        load,
        channelPrefix: 'clues',
        id: 'g1',
      }),
    )
    unmount()
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
  })

  it('does NOT rebuild the channel when the caller passes a fresh load callback each render', () => {
    // Simulates the common case: caller writes the load inline,
    // so every render produces a new function reference. The
    // ref-trick inside the factory means we don't pay channel-
    // teardown for that.
    const baseLoad = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(() =>
      useRealtimeRefetch({
        tables: ONE_TABLE,
        // New closure literal every render — not stable.
        load: () => baseLoad(),
        channelPrefix: 'clues',
        id: 'g1',
      }),
    )
    expect(channelNames).toHaveLength(1)
    rerender()
    rerender()
    rerender()
    expect(channelNames).toHaveLength(1)
    expect(mockRemoveChannel).not.toHaveBeenCalled()
  })

  it('uses the LATEST load when an event fires after a re-render (ref behavior)', () => {
    const firstLoad = vi.fn().mockResolvedValue(undefined)
    const secondLoad = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(
      ({ load }: { load: () => Promise<void> }) =>
        useRealtimeRefetch({
          tables: ONE_TABLE,
          load,
          channelPrefix: 'clues',
          id: 'g1',
        }),
      { initialProps: { load: firstLoad } },
    )
    expect(firstLoad).toHaveBeenCalledTimes(1)

    rerender({ load: secondLoad })
    // The rerender alone shouldn't call load (channel didn't
    // rebuild). The next event should use the new load.
    expect(secondLoad).not.toHaveBeenCalled()

    act(() => handlersByTable['clues']())
    expect(secondLoad).toHaveBeenCalledTimes(1)
    expect(firstLoad).toHaveBeenCalledTimes(1)  // didn't fire again
  })
})
