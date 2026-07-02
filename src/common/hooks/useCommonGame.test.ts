/**
 * Tests for useCommonGame.
 *
 * useCommonGame is the linchpin of the GamePage layer — it owns
 * the shared Realtime room for one game across all peers (presence,
 * manual-pause broadcast, suspend broadcast, postgres-changes on
 * the row), the cross-cutting common.games row + roster + timer,
 * and the unified `paused` flag every consumer reads.
 *
 * **What's covered here:**
 *   - Initial load populates `commonGame`, `players`, and clears
 *     `loading` (the row + roster + club handle path).
 *   - `paused` correctly unifies presence-pause + manual-pause
 *     (via the broadcast handler) and short-circuits to false
 *     once `ended_at` is set (terminal short-circuit).
 *   - `sendManualPause` / `sendManualUnpause` apply optimistically
 *     to local state AND broadcast over the channel.
 *   - Receiving a peer's `manualPause` broadcast sets
 *     `manuallyPausedBy`; receiving `manualUnpause` clears it.
 *
 * **Deferred to manual smoke / future tests** (intentionally not
 * covered — modeling the full supabase API in mocks would dwarf
 * the value):
 *   - Presence sync → `presentUserIds` derivation. The pure
 *     unification logic is testable via the manual-pause path
 *     above, but the presence-sync wiring is exercised in the
 *     browser whenever a peer disconnects.
 *   - `set_current_view` / `unset_current_view` RPCs on
 *     SUBSCRIBED / unmount, and the "last viewer leaving"
 *     condition that gates the unset.
 *   - Suspend-broadcast → navigate.
 *   - `rebroadcastManualPause` on presence change.
 *
 * Mocking strategy
 * ----------------
 * Same shape as useClubChat.test.ts / useSession.test.ts: vi.hoisted
 * spies stand in for the Supabase channel, the schema-scoped DB
 * client, and the router's navigate. The channel's `.on()` calls
 * for `postgres_changes`, `broadcast`, and `presence` all flow
 * through one capture so tests can fire specific event types by
 * name.
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type AnyHandler = (...args: unknown[]) => void

const fakeSession = {
  user: { id: 'ada' },
} as unknown as Session

const {
  mockChannel,
  mockRemoveChannel,
  mockSchemaFrom,
  mockRpc,
  mockNavigate,
} = vi.hoisted(() => ({
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockSchemaFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockNavigate: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
    schema: () => ({
      from: mockSchemaFrom,
      rpc: mockRpc,
    }),
  },
}))

vi.mock('../lib/router', () => ({
  navigate: mockNavigate,
}))

// We don't care about timer math here — just give the hook a
// non-ticking stub. The real useGameTimer has its own test file.
vi.mock('./useGameTimer', () => ({
  useGameTimer: () => ({ displaySeconds: 0, expired: false }),
}))

import { useCommonGame } from './useCommonGame'

// ---- Per-test channel state ----

/** Handlers keyed by event-tag — postgres_changes' filter table,
 *  broadcast events' `event` field, or `presence:sync`. The hook
 *  registers each via `.on()`; tests fire by name. */
const handlers: Record<string, AnyHandler> = {}
const trackSpy = vi.fn()
const untrackSpy = vi.fn()
const sendSpy = vi.fn()
/** Mutable record returned by .presenceState() — tests update it
 *  before firing the presence:sync handler. */
let presenceStateRecord: Record<string, Array<{ user_id?: string }>> = {}

function buildChannel() {
  const ch = {
    on: vi.fn(function (
      this: typeof ch,
      kind: string,
      filterOrEvent: Record<string, string>,
      handler: AnyHandler,
    ) {
      if (kind === 'postgres_changes') {
        handlers['postgres_changes'] = handler
      } else if (kind === 'broadcast') {
        handlers[`broadcast:${filterOrEvent.event}`] = handler
      } else if (kind === 'presence') {
        handlers[`presence:${filterOrEvent.event}`] = handler
      }
      return this
    }),
    subscribe: vi.fn(function (this: typeof ch) {
      // Status callback is captured but not invoked by any current
      // test — the SUBSCRIBED-fires-set_current_view path is in
      // the deferred set (see top-of-file note).
      return this
    }),
    track: trackSpy,
    untrack: untrackSpy,
    send: sendSpy,
    presenceState: () => presenceStateRecord,
  }
  return ch
}

const GAME_ROW = {
  id: 'g1',
  club_handle: 'club-one',
  gametype: 'codenamesduet',
  title: 'Game One',
  setup: { timer: { kind: 'none' } },
  is_current_view: true,
  play_state: 'playing',
  is_terminal: false,
  status: null,
  total_idle_seconds: 0,
  started_at: '2026-01-01T00:00:00Z',
  ended_at: null,
}

const PLAYER_ROWS = [
  { user_id: 'ada', conceded: false, conceded_at: null, result: null },
  { user_id: 'bea', conceded: true, conceded_at: '2026-01-01T00:00:00Z', result: null },
]
const PROFILES = [
  { user_id: 'ada', username: 'ada', color: 'red' },
  { user_id: 'bea', username: 'bea', color: 'blue' },
]
// The hook merges the game_players concede/result bits onto each profile.
const GAME_PLAYERS = [
  { user_id: 'ada', username: 'ada', color: 'red', conceded: false, conceded_at: null, result: null },
  {
    user_id: 'bea',
    username: 'bea',
    color: 'blue',
    conceded: true,
    conceded_at: '2026-01-01T00:00:00Z',
    result: null,
  },
]

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k]
  presenceStateRecord = {}
  trackSpy.mockClear()
  untrackSpy.mockClear()
  sendSpy.mockClear()
  mockChannel.mockReset()
  mockChannel.mockImplementation(() => buildChannel())
  mockRemoveChannel.mockClear()
  mockRpc.mockReset()
  mockRpc.mockResolvedValue({ error: null })
  mockNavigate.mockClear()

  // Default DB chain — tests can override per-table behavior by
  // re-mocking mockSchemaFrom inside the test, but the happy-path
  // returns the GAME_ROW + PLAYER_ROWS + PROFILES.
  mockSchemaFrom.mockReset()
  mockSchemaFrom.mockImplementation((table: string) => {
    if (table === 'games') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: GAME_ROW,
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: PLAYER_ROWS, error: null }),
        }),
      }
    }
    if (table === 'profiles') {
      return {
        select: () => ({
          in: () => Promise.resolve({ data: PROFILES, error: null }),
        }),
      }
    }
    throw new Error(`unexpected table: ${table}`)
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

/** Fire the latest captured presence:sync handler with the
 *  current presenceStateRecord. */
function firePresenceSync() {
  handlers['presence:sync']?.()
}

describe('useCommonGame — initial load', () => {
  it('populates commonGame + players + club_handle and clears loading', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.commonGame).toMatchObject({
      id: 'g1',
      club_handle: 'club-one',
      gametype: 'codenamesduet',
      title: 'Game One',
    })
    expect(result.current.players).toEqual(GAME_PLAYERS)
  })
})

describe('useCommonGame — paused unification', () => {
  it('paused is false when no one is missing and no manual pause is in effect', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Mark both players present.
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    expect(result.current.paused).toBe(false)
    expect(result.current.missing).toEqual([])
  })

  it('paused is true (presence) when a peer is missing', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Only ada is present; bea is missing.
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
    }
    act(() => firePresenceSync())

    expect(result.current.paused).toBe(true)
    expect(result.current.missing.map((m) => m.user_id)).toEqual(['bea'])
    expect(result.current.manuallyPausedBy).toBeNull()
  })

  it('paused is true (manual) when sendManualPause fires, even with everyone present', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Everyone present.
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    act(() => result.current.sendManualPause())
    expect(result.current.paused).toBe(true)
    expect(result.current.manuallyPausedBy?.user_id).toBe('ada')
  })

  it('sendManualUnpause clears the manual pause', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession))
    await waitFor(() => expect(result.current.loading).toBe(false))
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    act(() => result.current.sendManualPause())
    expect(result.current.paused).toBe(true)

    act(() => result.current.sendManualUnpause())
    expect(result.current.paused).toBe(false)
    expect(result.current.manuallyPausedBy).toBeNull()
  })

  it('paused short-circuits to false once the game ends (ended_at set)', async () => {
    // First load returns a non-terminal row; then a postgres-
    // changes event fires the row again with ended_at populated.
    const endedRow = {
      ...GAME_ROW,
      ended_at: '2026-01-01T01:00:00Z',
      is_terminal: true,
      play_state: 'won',
    }
    let firstCall = true
    mockSchemaFrom.mockImplementation((table: string) => {
      if (table === 'games') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockImplementation(async () => {
                const data = firstCall ? GAME_ROW : endedRow
                firstCall = false
                return { data, error: null }
              }),
            }),
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: PLAYER_ROWS, error: null }),
          }),
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: PROFILES, error: null }),
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    })

    const { result } = renderHook(() => useCommonGame('g1', fakeSession))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Put the game into a manual-paused state with someone missing.
    presenceStateRecord = { ada: [{ user_id: 'ada' }] }
    act(() => firePresenceSync())
    act(() => result.current.sendManualPause())
    expect(result.current.paused).toBe(true)

    // The game ends server-side; postgres-changes refetches and
    // loads the row with ended_at. Paused should now be false
    // even though manuallyPausedBy is still set — the terminal
    // short-circuit takes priority so PauseBoundary remounts
    // PlayArea to render the GameOverModal.
    await act(async () => {
      await handlers['postgres_changes']?.()
    })

    await waitFor(() =>
      expect(result.current.commonGame?.ended_at).toBe('2026-01-01T01:00:00Z'),
    )
    expect(result.current.paused).toBe(false)
  })
})

describe('useCommonGame — manual-pause broadcast wiring', () => {
  it('sendManualPause broadcasts a manualPause event with the local user id', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.sendManualPause())
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'manualPause',
      payload: { type: 'manualPause', userId: 'ada' },
    })
  })

  it('sendManualUnpause broadcasts a manualUnpause event', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.sendManualPause())
    sendSpy.mockClear()
    act(() => result.current.sendManualUnpause())
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'manualPause',
      payload: { type: 'manualUnpause' },
    })
  })

  it('receives a peer manualPause broadcast and sets manuallyPausedBy', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession))
    await waitFor(() => expect(result.current.loading).toBe(false))
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    // Bea, on her tab, clicks Pause. We receive her broadcast.
    act(() =>
      handlers['broadcast:manualPause']?.({
        payload: { type: 'manualPause', userId: 'bea' },
      }),
    )

    expect(result.current.paused).toBe(true)
    expect(result.current.manuallyPausedBy?.user_id).toBe('bea')
  })

  it('receives a peer manualUnpause and clears manuallyPausedBy', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession))
    await waitFor(() => expect(result.current.loading).toBe(false))
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())
    act(() =>
      handlers['broadcast:manualPause']?.({
        payload: { type: 'manualPause', userId: 'bea' },
      }),
    )
    expect(result.current.paused).toBe(true)

    act(() =>
      handlers['broadcast:manualPause']?.({
        payload: { type: 'manualUnpause' },
      }),
    )
    expect(result.current.paused).toBe(false)
    expect(result.current.manuallyPausedBy).toBeNull()
  })
})
