// cs-blessed-game-page

/**
 * Tests for useCommonGame.
 *
 * useCommonGame is the linchpin of the GamePage layer — it owns the shared
 * Realtime room for one game across all peers (presence, manual-pause
 * broadcast, suspend broadcast, the `changed` nudge), the read of the
 * two page blobs and the timer, and the unified `paused` flag every consumer
 * reads.
 *
 * **What's covered here:**
 *   - Initial load populates `cg` from shell_data, `me` as my entry in it,
 *     hands game_data through opaque, and clears `loading`.
 *   - A game whose builder has not written a shell is a failure, named.
 *   - `paused` correctly unifies presence-pause + manual-pause (via the
 *     broadcast handler) and short-circuits to false once the shell says the
 *     game ended.
 *   - `sendManualPause` / `sendManualUnpause` apply optimistically to local
 *     state AND broadcast over the channel.
 *   - Receiving a peer's `manualPause` broadcast sets `manuallyPausedBy`;
 *     receiving `manualUnpause` clears it.
 *
 * **Deferred to manual smoke / future tests** (intentionally not covered —
 * modeling the full supabase API in mocks would dwarf the value):
 *   - Presence sync → `presentUserIds` derivation. The pure unification logic
 *     is testable via the manual-pause path above, but the presence-sync
 *     wiring is exercised in the browser whenever a peer disconnects.
 *   - `set_current_view` / `unset_current_view` RPCs on SUBSCRIBED / unmount,
 *     and the "last viewer leaving" condition that gates the unset.
 *   - Suspend-broadcast → navigate.
 *   - `rebroadcastManualPause` on presence change.
 *
 * Mocking strategy
 * ----------------
 * Same shape as useClubChat.test.ts / useAuthSession.test.ts: vi.hoisted spies
 * stand in for the Supabase channel, the schema-scoped DB client, and the
 * router's navigate. The channel's `.on()` calls flow through one capture so
 * tests can fire specific event types by name.
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Shell } from './shell'

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

vi.mock('../supabase/supabase', () => ({
  supabase: {
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
    schema: () => ({
      from: mockSchemaFrom,
      rpc: mockRpc,
    }),
  },
}))

vi.mock('../routing/router', () => ({
  navigate: mockNavigate,
}))

// We don't care about timer math here — just give the hook a
// non-ticking stub. The real useGameTimer has its own test file.
vi.mock('../timer/useGameTimer', () => ({
  useGameTimer: () => ({ displaySeconds: 0, expired: false }),
}))

import { useCommonGame } from './useCommonGame'

// ---- Per-test channel state ----

/** Handlers keyed by event-tag — `broadcast:<event>`, `presence:<event>`,
 *  or the bare kind for any other. The hook registers each via `.on()`;
 *  tests fire by name. */
const handlers: Record<string, AnyHandler> = {}
const trackSpy = vi.fn()
const untrackSpy = vi.fn()
const sendSpy = vi.fn()
/** Mutable record returned by .presenceState() — tests update it
 *  before firing the presence:sync handler. */
let presenceStateRecord: Record<string, Array<{ user_id?: string }>> = {}

function buildChannel() {
  const ch = {
    // realtime-js sets `topic` (prefixed) in the channel constructor; the
    // teardown registry keys off it, so the fake needs it too.
    topic: 'realtime:game:g1',
    on: vi.fn(function (
      this: typeof ch,
      kind: string,
      filterOrEvent: Record<string, string>,
      handler: AnyHandler,
    ) {
      if (kind === 'broadcast') {
        handlers[`broadcast:${filterOrEvent.event}`] = handler
      } else if (kind === 'presence') {
        handlers[`presence:${filterOrEvent.event}`] = handler
      } else {
        handlers[kind] = handler
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

// ada = self, bea = a live peer, cara = a peer who is out of the game
// (conceded, finished, or out of budget — the game is not waiting for her),
// zed-bot = an AI opponent. Each of the last two exercises one exclusion from
// the presence-pause roster: cara has nothing left to do, and zed-bot is never
// going to open a tab at all.
const PLAYERS: Shell['players'] = [
  { id: 'ada', username: 'ada', color: 'red', ai: false, stillPlaying: true },
  { id: 'bea', username: 'bea', color: 'blue', ai: false, stillPlaying: true },
  { id: 'cara', username: 'cara', color: 'green', ai: false, stillPlaying: false },
  { id: 'zed-bot', username: 'zed-bot', color: 'brown', ai: true, stillPlaying: true },
]

/** The shell_data `common._make_json_shell_data` builds for a game in play. */
const SHELL: Shell = {
  id: 'g1',
  gametype: 'codenamesduet',
  club: { handle: 'club-one' },
  title: 'Game One',
  restartCount: 0,
  ended: false,
  players: PLAYERS,
}

/** …and once the game has ended: nobody is still playing. */
const ENDED_SHELL: Shell = {
  ...SHELL,
  ended: true,
  players: PLAYERS.map((p) => ({ ...p, stillPlaying: false })),
}

const GAME_DATA = { gametype: 'codenamesduet', puzzle: { words: ['a'] } }

const GAME_ROW = { shell_data: SHELL, game_data: GAME_DATA }

const TIMER_ROWS = [{ kind: 'none', countdown_seconds_at_setup: null }]

/** Answer the reads with these rows instead of the defaults. */
function serve(gameRows: unknown[], timerRows: unknown[] = TIMER_ROWS) {
  mockSchemaFrom.mockImplementation((table: string) => {
    // Rows, not a single row: `readRows` dropped `.maybeSingle()`, which
    // treated a game this club cannot see as indistinguishable from a broken
    // connection.
    const rows = table === 'games' ? gameRows : table === 'timers' ? timerRows : null
    if (rows === null) throw new Error(`unexpected table: ${table}`)
    return { select: () => ({ eq: () => Promise.resolve({ data: rows, error: null, status: 200 }) }) }
  })
}

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
  // An ENVELOPE, because `unset_current_view` returns one now and `runRpc`
  // treats an unreadable body as a fault — a bare `{ error: null }` would put
  // a fault modal up on the happy path and nothing here would notice.
  // Both view-state RPCs read their envelope through `runRpc`, so one default
  // serves both.
  mockRpc.mockResolvedValue({ data: { type: 'ok' }, error: null })
  mockNavigate.mockClear()

  mockSchemaFrom.mockReset()
  serve([GAME_ROW])
})

afterEach(() => {
  vi.clearAllMocks()
})

/** Fire the latest captured presence:sync handler with the
 *  current presenceStateRecord. */
function firePresenceSync() {
  handlers['presence:sync']?.()
}

/** Render the hook and wait for the first read to settle. */
async function load() {
  const { result } = renderHook(() => useCommonGame('g1', fakeSession))
  await waitFor(() => expect(result.current.loading).toBe(false))
  return result
}

describe('useCommonGame — initial load', () => {
  it('cg is shell_data, with me as my own entry in players — the same object', async () => {
    const result = await load()
    expect(result.current.cg).toMatchObject({
      id: 'g1',
      gametype: 'codenamesduet',
      club: { handle: 'club-one' },
      title: 'Game One',
      restartCount: 0,
      ended: false,
    })
    const { me, players } = result.current.cg!
    expect(players).toEqual(PLAYERS)
    expect(me.id).toBe('ada')
    expect(players).toContain(me)
  })

  it('hands game_data through untouched', async () => {
    const result = await load()
    expect(result.current.gameData).toEqual(GAME_DATA)
  })

  it('a null game_data passes through as null — the game\'s builder has not written one', async () => {
    serve([{ shell_data: SHELL, game_data: null }])
    const result = await load()
    expect(result.current.cg).not.toBeNull()
    expect(result.current.gameData).toBeNull()
  })

  it('reads the timer off common.timers', async () => {
    serve([GAME_ROW], [{ kind: 'countdown', countdown_seconds_at_setup: 90 }])
    const result = await load()
    expect(result.current.timer.mode).toEqual({ kind: 'countdown', seconds: 90 })
  })
})

/**
 * **A failed read is not a missing game — in the SHELL.**
 *
 * This gate runs before any play surface mounts, so `GamePage` saying "There's
 * no game here." for an outage overrode all sixteen of them, whatever they had
 * worked out for themselves. Zero rows and a dead read both left the game
 * null, and only one of them means the game is gone.
 */
describe('useCommonGame — a dead read is not an absent game', () => {
  it('reports a failed games read as a failure, not as no-such-game', async () => {
    mockSchemaFrom.mockImplementation((table: string) => {
      if (table === 'games') {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: null,
              error: { message: 'permission denied', code: '42501' },
              status: 403,
            }),
          }),
        }
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null, status: 200 }) }) }
    })
    const result = await load()
    expect(result.current.failure).toMatchObject({ type: 'not-ok', message: 'permission denied' })
    expect(result.current.cg).toBeNull()
  })

  // The other half: zero rows is a real answer, and must NOT set a failure —
  // otherwise a deleted game would show an error page instead of the sentence
  // written for it.
  it('leaves failure null when the read worked and found nothing', async () => {
    serve([], [])
    const result = await load()
    expect(result.current.failure).toBeNull()
    expect(result.current.cg).toBeNull()
  })

  it('a game with no shell_data yet is a failure that says so, not a game that is gone', async () => {
    // An unconverted game's row, or one not yet rebuilt: the builder has not
    // written the page. Saying "no such game" would be the confident wrong
    // answer; the error page names the real one.
    serve([{ shell_data: null, game_data: null }])
    const result = await load()
    expect(result.current.failure).toMatchObject({ type: 'not-ok', severity: 'fault' })
    expect(result.current.failure!.detail).toContain('g1')
    expect(result.current.cg).toBeNull()
  })
})

describe('useCommonGame — paused unification', () => {
  it('paused is false when no one is missing and no manual pause is in effect', async () => {
    const result = await load()

    // Mark both players present.
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    expect(result.current.pause.paused).toBe(false)
  })

  it('paused is true (presence) when a peer is missing', async () => {
    const result = await load()

    // Only ada is present; bea is missing.
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
    }
    act(() => firePresenceSync())

    expect(result.current.pause.paused).toBe(true)
    expect(result.current.pause.manuallyPausedBy).toBeNull()
  })

  it('paused stays false when the only missing player is out of the game', async () => {
    // cara conceded, solved early or spent her budget, then closed her tab.
    // The remaining players must keep playing — her absence must NOT raise
    // the presence-pause overlay for everyone else.
    const result = await load()

    // ada + bea present; cara absent.
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    expect(result.current.pause.paused).toBe(false)
    // The roster the pause watches is where cara's absence stops mattering:
    // she is off it, so nobody is waiting on her. zed-bot is off it too, for
    // the other reason — it is never going to arrive.
    expect(result.current.pause.stillPlayingHumanPlayers.map((p) => p.id)).toEqual(['ada', 'bea'])
    // …and they are still players of the game everywhere participation
    // counts — the strip, the ranking, the end-of-game results.
    expect(result.current.cg!.players.map((p) => p.id)).toContain('cara')
    expect(result.current.cg!.players.map((p) => p.id)).toContain('zed-bot')
  })

  it('a bot never pauses the game, and never draws an absent dot', async () => {
    // zed-bot holds a seat like any player — it can win, and end_game writes
    // it a result — but it has no tab and no presence. If it counted here,
    // every game with an AI opponent would sit behind the pause overlay from
    // the first move to the last.
    const result = await load()

    // Every HUMAN still playing is present; the bot is not, and never will be.
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    expect(result.current.pause.paused).toBe(false)
    // `stillPlayingHumanPlayers` is also what the overlay draws its
    // present/absent dots from, which is why the filter is here rather than
    // inside computePause: a bot on that list would be a permanently hollow ring.
    expect(result.current.pause.stillPlayingHumanPlayers.map((p) => p.id)).toEqual(['ada', 'bea'])
  })

  it('paused is true (manual) when sendManualPause fires, even with everyone present', async () => {
    const result = await load()

    // Everyone present.
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    act(() => result.current.pause.sendManualPause())
    expect(result.current.pause.paused).toBe(true)
    expect(result.current.pause.manuallyPausedBy?.id).toBe('ada')
  })

  it('sendManualUnpause clears the manual pause', async () => {
    const result = await load()
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    act(() => result.current.pause.sendManualPause())
    expect(result.current.pause.paused).toBe(true)

    act(() => result.current.pause.sendManualUnpause())
    expect(result.current.pause.paused).toBe(false)
    expect(result.current.pause.manuallyPausedBy).toBeNull()
  })

  it('paused short-circuits to false once the game ends', async () => {
    // First load returns a game in play; then the room hears `changed` and
    // shell_data comes back ended.
    let firstCall = true
    mockSchemaFrom.mockImplementation((table: string) => {
      if (table === 'games') {
        return {
          select: () => ({
            eq: async () => {
              const row = firstCall ? GAME_ROW : { ...GAME_ROW, shell_data: ENDED_SHELL }
              firstCall = false
              return { data: [row], error: null, status: 200 }
            },
          }),
        }
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: TIMER_ROWS, error: null, status: 200 }) }) }
    })

    const result = await load()

    // Put the game into a manual-paused state with someone missing.
    presenceStateRecord = { ada: [{ user_id: 'ada' }] }
    act(() => firePresenceSync())
    act(() => result.current.pause.sendManualPause())
    expect(result.current.pause.paused).toBe(true)

    // The game ends server-side; the nudge re-reads and loads the ended
    // shell_data. Paused should now be false even though manuallyPausedBy is
    // still set — the ended short-circuit takes priority so PauseBoundary
    // remounts PlayArea to render the ending.
    await act(async () => {
      await handlers['broadcast:changed']?.()
    })

    await waitFor(() => expect(result.current.cg?.ended).toBe(true))
    expect(result.current.pause.paused).toBe(false)
  })
})

describe('useCommonGame — manual-pause broadcast wiring', () => {
  it('sendManualPause broadcasts a manualPause event with the local user id', async () => {
    const result = await load()

    act(() => result.current.pause.sendManualPause())
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'manualPause',
      payload: { type: 'manualPause', userId: 'ada' },
    })
  })

  it('sendManualUnpause broadcasts a manualUnpause event', async () => {
    const result = await load()

    act(() => result.current.pause.sendManualPause())
    sendSpy.mockClear()
    act(() => result.current.pause.sendManualUnpause())
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'manualPause',
      payload: { type: 'manualUnpause' },
    })
  })

  it('receives a peer manualPause broadcast and sets manuallyPausedBy', async () => {
    const result = await load()
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

    expect(result.current.pause.paused).toBe(true)
    expect(result.current.pause.manuallyPausedBy?.id).toBe('bea')
  })

  it('receives a peer manualUnpause and clears manuallyPausedBy', async () => {
    const result = await load()
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
    expect(result.current.pause.paused).toBe(true)

    act(() =>
      handlers['broadcast:manualPause']?.({
        payload: { type: 'manualUnpause' },
      }),
    )
    expect(result.current.pause.paused).toBe(false)
    expect(result.current.pause.manuallyPausedBy).toBeNull()
  })
})

describe('useCommonGame — the changed nudge', () => {
  // `common._nudge_game_page` sends the room one `changed` per transaction
  // that writes the row (plans/broadcast-nudge.md); the page re-reads on it.
  it('re-reads the game when the room hears changed', async () => {
    await load()

    const gamesReads = () =>
      mockSchemaFrom.mock.calls.filter((c) => c[0] === 'games').length
    const before = gamesReads()
    act(() => {
      handlers['broadcast:changed']?.({ payload: {} })
    })
    await waitFor(() => expect(gamesReads()).toBe(before + 1))
  })

  it('subscribes to no row changes: the nudge is the only news of a move', async () => {
    await load()

    expect(handlers['postgres_changes']).toBeUndefined()
  })
})
