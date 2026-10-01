// cs-blessed-game-page

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
 *   - Initial load populates `cg`, its `players`, and clears
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
 * Same shape as useClubChat.test.ts / useAuthSession.test.ts: vi.hoisted
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
import type { GameManifest } from '../manifest/gameManifest'

/** A manifest carrying only what the hook reads from one. */
function manifestWith(draftsOffTurn: boolean): GameManifest {
  return { draftsOffTurn } as GameManifest
}

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
    // realtime-js sets `topic` (prefixed) in the channel constructor; the
    // teardown registry keys off it, so the fake needs it too.
    topic: 'realtime:game:g1',
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
      } else if (kind === 'system') {
        // The deaf-window closer's binding (postgresAttached.ts).
        handlers['system'] = handler
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
  mode: 'coop',
  title: 'Game One',
  setup: { timer: { kind: 'none' } },
  is_current_view: true,
  restart_count: 0,
  game_status: {},
  updated_at: '2026-01-01T00:00:00Z',
  started_at: '2026-01-01T00:00:00Z',
  ended_at: null,
  game_ended_reason: null,
  game_ended_reason_detail: null,
  game_ended_outcome: null,
  game_ended_by_user_id: null,
  current_turn_user_id: null,
}

/** The ending columns of a game that has ended, as `common._end_game` writes
 *  them. */
const ENDED_ROW = {
  ended_at: '2026-01-01T01:00:00Z',
  game_ended_reason: 'reached_goal',
  game_ended_reason_detail: 'solved',
  game_ended_outcome: 'won',
  game_ended_by_user_id: 'ada',
}

const TIMER_ROWS = [{ kind: 'none', countdown_seconds_at_setup: null }]

/** A `common.game_players` row: still playing, unranked, no status. */
const playerRow = (user_id: string, over: Record<string, unknown> = {}) => ({
  user_id,
  player_ended_at: null,
  player_ended_reason: null,
  player_ended_reason_detail: null,
  final_ranking: null,
  outcome: null,
  solved_at: null,
  player_status: {},
  turn_seat: null as number | null,
  ...over,
})

/** The ending columns of a player who conceded. */
const CONCEDED_ROW = {
  player_ended_at: '2026-01-01T00:00:00Z',
  player_ended_reason: 'conceded',
  player_ended_reason_detail: 'conceded',
}

/** The ending columns of a player who is out of guesses. */
const EXHAUSTED_ROW = {
  player_ended_at: '2026-01-01T00:00:00Z',
  player_ended_reason: 'resource_exhausted',
  player_ended_reason_detail: 'exhausted',
}

// ada = self, bea = a live peer, cara = a peer who has conceded, dai = a player
// who is DONE without conceding (finished, eliminated, out of budget — the game
// is not waiting for them), zed-bot = an AI opponent. Each of the last three
// exercises one exclusion from the presence-pause roster: cara quit, dai has
// nothing left to do, and zed-bot is never going to open a tab at all. Nobody
// has a `turn_seat`: a free-for-all game.
const PLAYER_ROWS = [
  playerRow('ada'),
  playerRow('bea'),
  playerRow('cara', CONCEDED_ROW),
  playerRow('dai', EXHAUSTED_ROW),
  playerRow('zed-bot'),
]
const PROFILES = [
  { user_id: 'ada', username: 'ada', color: 'red', ai_member: false },
  { user_id: 'bea', username: 'bea', color: 'blue', ai_member: false },
  { user_id: 'cara', username: 'cara', color: 'green', ai_member: false },
  { user_id: 'dai', username: 'dai', color: 'purple', ai_member: false },
  { user_id: 'zed-bot', username: 'zed-bot', color: 'brown', ai_member: true },
]
// The hook merges the game_players per-player bits onto each profile.
const GAME_PLAYERS = PLAYER_ROWS.map(function mergeProfile(row) {
  const { turn_seat: _seat, ...bits } = row
  const profile = PROFILES.find((p) => p.user_id === row.user_id)!
  return { ...profile, ...bits }
})

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

  // Default DB chain — tests can override per-table behavior by
  // re-mocking mockSchemaFrom inside the test, but the happy-path
  // returns the GAME_ROW + PLAYER_ROWS + PROFILES.
  mockSchemaFrom.mockReset()
  mockSchemaFrom.mockImplementation((table: string) => {
    if (table === 'games') {
      return {
        select: () => ({
          // Rows, not a single row: `readRows` dropped `.maybeSingle()`, which
          // treated a game this club cannot see as indistinguishable from a
          // broken connection.
          eq: () => Promise.resolve({ data: [GAME_ROW], error: null, status: 200 }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: PLAYER_ROWS, error: null, status: 200 }),
        }),
      }
    }
    if (table === 'profiles') {
      return {
        select: () => ({
          in: () => Promise.resolve({ data: PROFILES, error: null, status: 200 }),
        }),
      }
    }
    if (table === 'timers') {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: TIMER_ROWS, error: null, status: 200 }),
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
  it('populates cg + players + club_handle and clears loading', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cg).toMatchObject({
      id: 'g1',
      club_handle: 'club-one',
      gametype: 'codenamesduet',
      title: 'Game One',
    })
    expect(result.current.cg!.players).toEqual(GAME_PLAYERS)
  })

  it('reads the ending off the row, null while the game is played', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cg?.gameEnding).toBeNull()
  })

  it('reads the ending columns of a game that has ended', async () => {
    mockSchemaFrom.mockImplementation((table: string) => {
      if (table === 'games') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [{ ...GAME_ROW, ...ENDED_ROW }], error: null, status: 200 }) }) }
      }
      if (table === 'profiles') {
        return { select: () => ({ in: () => Promise.resolve({ data: PROFILES, error: null, status: 200 }) }) }
      }
      const rows = table === 'timers' ? TIMER_ROWS : PLAYER_ROWS
      return { select: () => ({ eq: () => Promise.resolve({ data: rows, error: null, status: 200 }) }) }
    })
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cg?.gameEnding).toEqual({
      reason: 'reached_goal', reasonDetail: 'solved', outcome: 'won', endedByUserId: 'ada',
    })
  })

  it('reads the timer off common.timers, not the setup', async () => {
    mockSchemaFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ in: () => Promise.resolve({ data: PROFILES, error: null, status: 200 }) }) }
      }
      const rows = table === 'timers'
        ? [{ kind: 'countdown', countdown_seconds_at_setup: 90 }]
        : table === 'games' ? [GAME_ROW] : PLAYER_ROWS
      return { select: () => ({ eq: () => Promise.resolve({ data: rows, error: null, status: 200 }) }) }
    })
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cg?.timer.mode).toEqual({ kind: 'countdown', seconds: 90 })
  })
})

/**
 * **Where I stand** — the standing terms, one formula each (docs/win-lose.md →
 * Where a player stands), computed once here for every PlayArea.
 */
describe('useCommonGame — where I stand', () => {
  type PlayerRow = Record<string, unknown>

  // Answer the reads with this game row and roster instead of the defaults.
  function serve(game: Record<string, unknown>, rows: PlayerRow[]) {
    mockSchemaFrom.mockImplementation((table: string) => {
      if (table === 'games') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [{ ...GAME_ROW, ...game }], error: null, status: 200 }) }) }
      }
      if (table === 'game_players') {
        return { select: () => ({ eq: () => Promise.resolve({ data: rows, error: null, status: 200 }) }) }
      }
      if (table === 'timers') {
        return { select: () => ({ eq: () => Promise.resolve({ data: TIMER_ROWS, error: null, status: 200 }) }) }
      }
      return { select: () => ({ in: () => Promise.resolve({ data: PROFILES, error: null, status: 200 }) }) }
    })
  }

  async function standing(draftsOffTurn = false, authSession = fakeSession) {
    const { result } = renderHook(() => useCommonGame('g1', authSession, manifestWith(draftsOffTurn)))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const { turns, standing } = result.current.cg!
    return { ...standing, ...turns }
  }

  // ada and bea seated in a turn order.
  const SEATED = [
    { ...PLAYER_ROWS[0], turn_seat: 0 },
    { ...PLAYER_ROWS[1], turn_seat: 1 },
  ]

  it('a free-for-all game: still playing, and every move is mine', async () => {
    serve({ current_turn_user_id: null }, PLAYER_ROWS)
    expect(await standing()).toEqual({
      isPlayer: true, isConceded: false, isLocallyTerminal: false, isStillPlaying: true,
      isTurnBased: false, turnHolderId: null, isMyTurn: true, isWaitingForTurn: false,
      isBoardInteractive: true,
    })
  })

  it('a turn game on a teammate\'s turn: still playing, waiting, the board inert', async () => {
    serve({ current_turn_user_id: 'bea' }, SEATED)
    expect(await standing()).toMatchObject({
      isStillPlaying: true, isTurnBased: true, turnHolderId: 'bea',
      isMyTurn: false, isWaitingForTurn: true, isBoardInteractive: false,
    })
  })

  it('a game that drafts off-turn keeps the board live while I wait', async () => {
    serve({ current_turn_user_id: 'bea' }, SEATED)
    expect(await standing(true)).toMatchObject({
      isMyTurn: false, isWaitingForTurn: true, isBoardInteractive: true,
    })
  })

  it('a turn game on my turn', async () => {
    serve({ current_turn_user_id: 'ada' }, SEATED)
    expect(await standing()).toMatchObject({
      isMyTurn: true, isWaitingForTurn: false, isBoardInteractive: true,
    })
  })

  it('a turn game whose pointer names nobody is nobody\'s turn, never everybody\'s', async () => {
    serve({ current_turn_user_id: null }, SEATED)
    expect(await standing()).toMatchObject({ isTurnBased: true, turnHolderId: null, isMyTurn: false })
  })

  it('a finished game is nobody\'s turn, though the pointer still names me', async () => {
    serve({ current_turn_user_id: 'ada', ...ENDED_ROW }, SEATED)
    expect(await standing()).toMatchObject({
      isStillPlaying: false, turnHolderId: 'ada', isMyTurn: false, isWaitingForTurn: false,
      isBoardInteractive: false,
    })
  })

  it('a conceder is locally terminal, and out', async () => {
    serve({}, [{ ...PLAYER_ROWS[0], ...CONCEDED_ROW }, PLAYER_ROWS[1]])
    expect(await standing(true)).toMatchObject({
      isConceded: true, isLocallyTerminal: true, isStillPlaying: false,
      isMyTurn: false, isWaitingForTurn: false, isBoardInteractive: false,
    })
  })

  it('a racer who is done without conceding is locally terminal, not conceded', async () => {
    serve({}, [{ ...PLAYER_ROWS[0], ...EXHAUSTED_ROW }, PLAYER_ROWS[1]])
    expect(await standing()).toMatchObject({
      isConceded: false, isLocallyTerminal: true, isStillPlaying: false, isMyTurn: false,
    })
  })

  it('a club member watching is not a player, and never has the turn', async () => {
    serve({}, PLAYER_ROWS)
    const watcher = { user: { id: 'eve' } } as unknown as Session
    expect(await standing(true, watcher)).toMatchObject({
      isPlayer: false, isStillPlaying: false, isMyTurn: false, isBoardInteractive: false,
    })
  })
})

/**
 * **A failed read is not a missing game — in the SHELL.**
 *
 * This gate runs before any play surface mounts, so `GamePage` saying "There's
 * no game here." for an outage overrode all sixteen of them, whatever they had
 * worked out for themselves. Zero rows and a dead read both left `gameData`
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
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.failure).toMatchObject({ type: 'not-ok', message: 'permission denied' })
    expect(result.current.cg).toBeNull()
  })

  // The other half: zero rows is a real answer, and must NOT set a failure —
  // otherwise a deleted game would show an error page instead of the sentence
  // written for it.
  it('leaves failure null when the read worked and found nothing', async () => {
    mockSchemaFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null, status: 200 }),
        in: () => Promise.resolve({ data: [], error: null, status: 200 }),
      }),
    }))
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.failure).toBeNull()
    expect(result.current.cg).toBeNull()
  })
})

describe('useCommonGame — paused unification', () => {
  it('paused is false when no one is missing and no manual pause is in effect', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Mark both players present.
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    expect(result.current.cg!.pause.paused).toBe(false)
  })

  it('paused is true (presence) when a peer is missing', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Only ada is present; bea is missing.
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
    }
    act(() => firePresenceSync())

    expect(result.current.cg!.pause.paused).toBe(true)
    expect(result.current.cg!.pause.manuallyPausedBy).toBeNull()
  })

  it('paused stays false when the only missing player has conceded', async () => {
    // cara conceded (quit the race), then closed her tab. The
    // remaining players must keep racing — a conceder's absence
    // must NOT raise the presence-pause overlay for everyone else.
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // ada + bea present; cara (conceded) absent.
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    expect(result.current.cg!.pause.paused).toBe(false)
    // The roster the pause watches is where cara's absence stops mattering:
    // she is off it, so nobody is waiting on her. dai and zed-bot are off it
    // too, for the other two reasons — nothing is left for dai to do, and
    // zed-bot is never going to arrive.
    expect(result.current.cg!.stillPlayingHumanPlayers.map((p) => p.user_id)).toEqual(['ada', 'bea'])
  })

  it('paused stays false when the only missing player is done playing', async () => {
    // dai is locally terminal — solved their board in a best-style race,
    // spent their budget, or was eliminated — and then closed the tab. The
    // game is not waiting for them, so the players still going must not be
    // parked behind the pause overlay. dai did NOT concede: in wordle, waffle
    // and strands the first player to go locally terminal is the one who
    // SOLVED, and may be the winner.
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))

    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
      cara: [{ user_id: 'cara' }],
    }
    act(() => firePresenceSync())

    expect(result.current.cg!.pause.paused).toBe(false)
    expect(result.current.cg!.stillPlayingHumanPlayers.map((p) => p.user_id)).toEqual(['ada', 'bea'])
    // …and they are still a player of the game everywhere participation
    // counts — the strip, the standings, the end-of-game results.
    expect(result.current.cg!.players.map((p) => p.user_id)).toContain('dai')
  })

  it('a bot never pauses the game, and never draws an absent dot', async () => {
    // zed-bot holds a game_players row like any player — it can win, and
    // end_game writes it a result — but it has no tab and no presence. If it
    // counted here, every game with an AI opponent would sit behind the pause
    // overlay from the first move to the last.
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Every HUMAN who has not conceded is present; the bot is not, and never
    // will be.
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    expect(result.current.cg!.pause.paused).toBe(false)
    // `stillPlayingHumanPlayers` is also what the overlay draws its
    // present/absent dots from, which is why the filter is here rather than
    // inside computePause:
    // a bot on that list would be a permanently hollow ring.
    expect(result.current.cg!.stillPlayingHumanPlayers.map((p) => p.user_id)).toEqual(['ada', 'bea'])
    // …and it is still a player of the game everywhere participation counts.
    expect(result.current.cg!.players.map((p) => p.user_id)).toContain('zed-bot')
  })

  it('paused is true (manual) when sendManualPause fires, even with everyone present', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Everyone present.
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    act(() => result.current.cg!.pause.sendManualPause())
    expect(result.current.cg!.pause.paused).toBe(true)
    expect(result.current.cg!.pause.manuallyPausedBy?.user_id).toBe('ada')
  })

  it('sendManualUnpause clears the manual pause', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    act(() => result.current.cg!.pause.sendManualPause())
    expect(result.current.cg!.pause.paused).toBe(true)

    act(() => result.current.cg!.pause.sendManualUnpause())
    expect(result.current.cg!.pause.paused).toBe(false)
    expect(result.current.cg!.pause.manuallyPausedBy).toBeNull()
  })

  it('paused short-circuits to false once the game ends (ended_at set)', async () => {
    // First load returns a non-terminal row; then a postgres-
    // changes event fires the row again with ended_at populated.
    const endedRow = { ...GAME_ROW, ...ENDED_ROW }
    let firstCall = true
    mockSchemaFrom.mockImplementation((table: string) => {
      if (table === 'games') {
        return {
          select: () => ({
            eq: async () => {
              const row = firstCall ? GAME_ROW : endedRow
              firstCall = false
              return { data: [row], error: null, status: 200 }
            },
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: PLAYER_ROWS, error: null, status: 200 }),
          }),
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: PROFILES, error: null, status: 200 }),
          }),
        }
      }
      if (table === 'timers') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: TIMER_ROWS, error: null, status: 200 }),
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    })

    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Put the game into a manual-paused state with someone missing.
    presenceStateRecord = { ada: [{ user_id: 'ada' }] }
    act(() => firePresenceSync())
    act(() => result.current.cg!.pause.sendManualPause())
    expect(result.current.cg!.pause.paused).toBe(true)

    // The game ends server-side; postgres-changes refetches and
    // loads the row with ended_at. Paused should now be false
    // even though manuallyPausedBy is still set — the terminal
    // short-circuit takes priority so PauseBoundary remounts
    // PlayArea to render its terminal state.
    await act(async () => {
      await handlers['postgres_changes']?.()
    })

    await waitFor(() =>
      expect(result.current.cg?.ended_at).toBe('2026-01-01T01:00:00Z'),
    )
    expect(result.current.cg!.pause.paused).toBe(false)
  })
})

describe('useCommonGame — manual-pause broadcast wiring', () => {
  it('sendManualPause broadcasts a manualPause event with the local user id', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.cg!.pause.sendManualPause())
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'manualPause',
      payload: { type: 'manualPause', userId: 'ada' },
    })
  })

  it('sendManualUnpause broadcasts a manualUnpause event', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.cg!.pause.sendManualPause())
    sendSpy.mockClear()
    act(() => result.current.cg!.pause.sendManualUnpause())
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'manualPause',
      payload: { type: 'manualUnpause' },
    })
  })

  it('receives a peer manualPause broadcast and sets manuallyPausedBy', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
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

    expect(result.current.cg!.pause.paused).toBe(true)
    expect(result.current.cg!.pause.manuallyPausedBy?.user_id).toBe('bea')
  })

  it('a manualPause from a non-player (spectator) still pauses, labeled "Someone"', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))
    presenceStateRecord = {
      ada: [{ user_id: 'ada' }],
      bea: [{ user_id: 'bea' }],
    }
    act(() => firePresenceSync())

    // A club member watching without having joined (not in `players`) clicks
    // Pause. The pause must still take effect — not silently no-op.
    act(() =>
      handlers['broadcast:manualPause']?.({
        payload: { type: 'manualPause', userId: 'zork' },
      }),
    )

    expect(result.current.cg!.pause.paused).toBe(true)
    expect(result.current.cg!.pause.manuallyPausedBy?.user_id).toBe('zork')
    expect(result.current.cg!.pause.manuallyPausedBy?.username).toBe('Someone')
  })

  it('receives a peer manualUnpause and clears manuallyPausedBy', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
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
    expect(result.current.cg!.pause.paused).toBe(true)

    act(() =>
      handlers['broadcast:manualPause']?.({
        payload: { type: 'manualUnpause' },
      }),
    )
    expect(result.current.cg!.pause.paused).toBe(false)
    expect(result.current.cg!.pause.manuallyPausedBy).toBeNull()
  })
})

describe('useCommonGame — deaf-window closer', () => {
  // The postgres_changes attach confirmation must re-run load(): SUBSCRIBED
  // is only the join ack, and a common.games write landing before the WAL
  // poller carries the subscription is dropped — the attach-time re-read is
  // what closes that window (postgresAttached.ts; pinned end-to-end by
  // e2e/realtime-deaf-window.e2e.ts).
  it('re-loads when the postgres_changes attach is confirmed', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const gamesReads = () =>
      mockSchemaFrom.mock.calls.filter((c) => c[0] === 'games').length
    const before = gamesReads()
    act(() => {
      handlers['system']?.({ status: 'ok', extension: 'postgres_changes' })
    })
    await waitFor(() => expect(gamesReads()).toBe(before + 1))
  })

  it('counts the attach in resubscribeCount, so a game reloads its own rows too', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const before = result.current.resubscribeCount
    act(() => {
      handlers['system']?.({ status: 'ok', extension: 'postgres_changes' })
    })
    expect(result.current.resubscribeCount).toBe(before + 1)
  })

  it('ignores system payloads that are not the attach ok', async () => {
    const { result } = renderHook(() => useCommonGame('g1', fakeSession, manifestWith(false)))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const gamesReads = () =>
      mockSchemaFrom.mock.calls.filter((c) => c[0] === 'games').length
    const before = gamesReads()
    act(() => {
      handlers['system']?.({ status: 'error', extension: 'postgres_changes' })
      handlers['system']?.({ status: 'ok', extension: 'presence' })
    })
    expect(gamesReads()).toBe(before)
  })
})
