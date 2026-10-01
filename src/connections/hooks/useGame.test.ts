// cs-blessed-connections

/**
 * WHAT TWO READS, THE PAGE'S VALUES AND THE PICKS BECOME, AND WHAT A FAILED
 * READ LEAVES BEHIND.
 *
 * When the hook reloads is `useRefetchOnGameUpdate`'s contract and its own
 * tests'. Stubbed here so the load body can be run on demand, because the
 * body is what belongs to connections: two reads, `gd` built from them and
 * the page's values, and the distinctions a failure has to keep.
 *
 * Two of those distinctions are invisible in the returned state unless you
 * look for them. An absent game and a failed read BOTH leave `gd` null, and
 * only `failure` tells the page which one to draw. And WHICH read failed is
 * the one thing a player's sentence cannot say, so the two are branched
 * separately rather than folded into one test.
 *
 * The picks room is the one channel this hook keeps. Coop joins the stable
 * room `connections:<gameId>` — stable so every peer shares the Broadcast — and
 * a click applies locally and goes on the wire; compete joins nothing and
 * applies locally. The room is keyed on the game alone, so a new `Session`
 * object (a token refresh) must not rebuild it, and a new game must.
 */

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Envelope } from '@/common/supabase/envelope'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { CONCEDED, gp } from '@/common/members/gamePlayer.fixture'
import type { GamePlayer } from '@/common/members/member'
import type { Board } from '../lib/board'
import type { ConnectionsPlayerStatus } from '../lib/statuses'

const { mockReadRows, mockChannel, mockRemoveChannel, refetch } = vi.hoisted(() => ({
  mockReadRows: vi.fn(),
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
  // The `load` the hook hands `useRefetchOnGameUpdate`, kept so a test can run
  // it.
  refetch: { load: null as ((a: { isCurrent: () => boolean }) => Promise<void>) | null },
}))

// A query builder that remembers which table it was opened on and answers every
// chained call with itself — `readRows` is mocked, so the chain only has to
// survive being built, and the table is how the mock knows which read this is.
vi.mock('../db', () => {
  const on = (table: string): unknown =>
    new Proxy({ table }, { get: (t, key) => (key === 'table' ? t.table : () => on(t.table)) })
  return { db: { from: (table: string) => on(table) } }
})

vi.mock('@/common/supabase/supabase', () => ({
  supabase: { channel: mockChannel, removeChannel: mockRemoveChannel },
}))

vi.mock('@/common/game-page/useRefetchOnGameUpdate', () => ({
  useRefetchOnGameUpdate: (opts: { load: (a: { isCurrent: () => boolean }) => Promise<void> }) => {
    refetch.load = opts.load
  },
}))

vi.mock('@/common/supabase/dbResult', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/common/supabase/dbResult')>()),
  readRows: mockReadRows,
}))

import { useGame } from './useGame'

const GAME_ID = 'g1'

function playerStatus(
  found: number,
  mistakes: number,
  ended: ConnectionsPlayerStatus['player_ended_reason'] = null,
): ConnectionsPlayerStatus {
  return { found_categories_count: found, mistake_count: mistakes, player_ended_reason: ended }
}

/** A 4-category / 16-tile board. */
const BOARD: Board = {
  categories: [
    { rank: 0, name: 'RED', tiles: ['a', 'b', 'c', 'd'] },
    { rank: 1, name: 'GREEN', tiles: ['e', 'f', 'g', 'h'] },
    { rank: 2, name: 'BLUE', tiles: ['i', 'j', 'k', 'l'] },
    { rank: 3, name: 'PURPLE', tiles: ['m', 'n', 'o', 'p'] },
  ],
  tileOrder: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'],
}

/** The page's values, as `GamePage` hands them: me (u1) and moth (u2), a
 *  compete game in play, moth conceded. Only what the hook reads is here. */
function makeCtx(
  over: {
    mode?: 'coop' | 'compete'
    myId?: string
    players?: GamePlayer[]
    gameEnding?: unknown
    turnHolderId?: string | null
  } = {},
): PlayAreaLoaderProps {
  const {
    mode = 'compete',
    myId = 'u1',
    players = [
      gp('u1', 'me', 'red', { player_status: playerStatus(1, 2) }),
      gp('u2', 'moth', 'blue', { ...CONCEDED, player_status: playerStatus(0, 3, 'conceded') }),
    ],
    gameEnding = null,
    turnHolderId = null,
  } = over
  return {
    authSession: { user: { id: myId } },
    resubscribeCount: 0,
    cg: {
      id: GAME_ID,
      mode,
      title: 'A game',
      setup: { timer: { kind: 'none' }, coop_style: 'free-for-all' },
      game_status: { required_categories_count: 4, max_mistakes: 4 },
      players,
      gameEnding,
      isGameEnded: gameEnding !== null,
      updated_at: 't1',
      turns: { isTurnBased: turnHolderId !== null, turnHolderId },
      standing: {
        isPlayer: players.some((p) => p.user_id === myId),
        isConceded: false,
        isLocallyTerminal: false,
        isStillPlaying: true,
        isMyTurn: true,
        isWaitingForTurn: false,
        isBoardInteractive: true,
      },
    },
  } as unknown as PlayAreaLoaderProps
}

const CTX = makeCtx()

function ok<T>(data: T): Envelope<T> {
  return {
    type: 'ok', data, severity: null, field: null, meta: null,
    dbcode: null, detail: null, message: null, outcome: null,
  }
}

/** A read that failed. Only a FAULT can reach here — a read authors nothing
 *  else — and `dbcode` is what makes one failure tellable from another. */
function readFailed(dbcode: string): Envelope<never> {
  return {
    type: 'not-ok', data: null, outcome: null, severity: 'fault',
    message: 'The board could not be loaded.', field: null, meta: null,
    dbcode, detail: null,
  }
}

/** The event rows as the read hands them: the wire word, no readings yet. */
const MY_MATCH = {
  id: 1, user_id: 'u1', tiles: ['a', 'b', 'c', 'd'], result: 'correct',
  matched_category_rank: 0, created_at: '2026-06-15T00:01:00Z',
}
const MY_MISS = {
  id: 2, user_id: 'u1', tiles: ['e', 'f', 'g', 'm'], result: 'oneAway',
  matched_category_rank: null, created_at: '2026-06-15T00:02:00Z',
}
const THEIR_MATCH = {
  id: 3, user_id: 'u2', tiles: ['e', 'f', 'g', 'h'], result: 'correct',
  matched_category_rank: 1, created_at: '2026-06-15T00:03:00Z',
}

/** Answer each of the two reads by the table it was opened on, so a test
 *  says what it means rather than counting calls in load order. */
function answer(by: { games?: unknown; events?: unknown }) {
  mockReadRows.mockImplementation((query: { table: keyof typeof by }) => {
    const res = by[query.table]
    if (!res) throw new Error(`no fixture for the ${String(query.table)} read`)
    return Promise.resolve(res)
  })
}

/** Everything present and readable — the ordinary load. */
const ALL_GOOD = {
  games: ok([{ board: BOARD, puzzle_date: '2026-06-15' }]),
  events: ok([MY_MATCH, MY_MISS, THEIR_MATCH]),
}

/** Mount with these page values, run one refetch, and hand back what the hook
 *  says afterwards. */
async function load(ctx: PlayAreaLoaderProps = CTX) {
  const { result } = renderHook(() => useGame(ctx))
  await act(async () => {
    await refetch.load!({ isCurrent: () => true })
  })
  return result
}

// The picks room, as realtime-js would hand it back: the hook chains
// `.channel(name).on(…).subscribe()`, and `broadcast` calls `.send(…)`.
// `topic` is what the teardown registry keys off.
const channelChain = {
  topic: `realtime:connections:${GAME_ID}`,
  on: vi.fn(function () {
    return channelChain
  }),
  subscribe: vi.fn(function () {
    return channelChain
  }),
  send: vi.fn(() => Promise.resolve('ok')),
}

beforeEach(() => {
  vi.clearAllMocks()
  refetch.load = null
  mockChannel.mockReturnValue(channelChain)
  mockRemoveChannel.mockResolvedValue('ok')
})

describe('connections useGame — a load that worked', () => {
  it('builds gd from the reads and the page, and stops loading', async () => {
    answer(ALL_GOOD)
    const result = await load()
    const gd = result.current.gd!

    expect(gd.puzzle.date).toBe('2026-06-15')
    expect(gd.puzzle.board).toEqual(BOARD)
    expect(gd.events.map((e) => e.id)).toEqual([1, 2, 3])
    expect(gd.mode).toBe('compete')
    expect(result.current.loading).toBe(false)
    expect(result.current.failure).toBeNull()
  })

  it('reads each guess once: its outcome, and whether it matched', async () => {
    answer(ALL_GOOD)
    const [match, miss] = (await load()).current.gd!.events
    expect(match).toMatchObject({ result: 'correct', matched: true, outcome: 'won' })
    expect(miss).toMatchObject({ result: 'oneAway', matched: false, outcome: 'near' })
  })

  it('reads the two table-facts off game_status', async () => {
    answer(ALL_GOOD)
    const gd = (await load()).current.gd!
    expect(gd.readout.requiredCategoriesCount).toBe(4)
    expect(gd.readout.maxMistakes).toBe(4)
  })

  it('keys the players by id, in the page\'s order, each with their counts and ending', async () => {
    answer(ALL_GOOD)
    const gd = (await load()).current.gd!
    expect(Object.keys(gd.playersById)).toEqual(['u1', 'u2'])
    expect(gd.playersById.u1!.username).toBe('me')
    expect([gd.playersById.u1!.foundCategoriesCount, gd.playersById.u2!.foundCategoriesCount]).toEqual([1, 0])
    expect([gd.playersById.u1!.mistakeCount, gd.playersById.u2!.mistakeCount]).toEqual([2, 3])
    expect(gd.playersById.u1!.playerEnding).toBeNull()
    expect(gd.playersById.u2!.playerEnding).toEqual({
      at: CONCEDED.player_ended_at, reason: 'conceded', reasonDetail: 'conceded',
    })
  })

  it('puts only my own guesses on the board in compete, and every guess in coop', async () => {
    answer(ALL_GOOD)
    expect((await load()).current.gd?.boardEvents.map((e) => e.id)).toEqual([1, 2])
    answer(ALL_GOOD)
    expect((await load(makeCtx({ mode: 'coop' }))).current.gd?.boardEvents.map((e) => e.id))
      .toEqual([1, 2, 3])
  })

  it('projects the matched categories from the board\'s rows, joined to the board by rank', async () => {
    answer(ALL_GOOD)
    // Compete: my one match; moth's GREEN is not on my board.
    expect((await load()).current.gd?.matchedCategories).toEqual([
      { rank: 0, name: 'RED', tiles: ['a', 'b', 'c', 'd'], matched_at: MY_MATCH.created_at },
    ])
    answer(ALL_GOOD)
    // Coop: the team's two, in the order they were matched.
    expect((await load(makeCtx({ mode: 'coop' }))).current.gd?.matchedCategories.map((m) => m.name))
      .toEqual(['RED', 'GREEN'])
  })

  it('leaves the tiles of my matched bands off the loose tiles, in the board\'s order', async () => {
    answer(ALL_GOOD)
    // Compete: RED is mine, so its four are gone; moth's GREEN is still loose.
    expect((await load()).current.gd?.puzzle.remainingTiles)
      .toEqual(['e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'])
    answer(ALL_GOOD)
    expect((await load(makeCtx({ mode: 'coop' }))).current.gd?.puzzle.remainingTiles)
      .toEqual(['i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'])
  })

  it('gives the counts that apply to me — my own in compete, the team\'s in coop', async () => {
    answer(ALL_GOOD)
    const compete = (await load()).current.gd!
    expect(compete.readout.foundCount).toBe(1)
    expect(compete.readout.mistakeCount).toBe(2)
    // Coop: the matches are the sum, the mistakes are written on every player.
    answer(ALL_GOOD)
    const coop = (await load(makeCtx({
      mode: 'coop',
      players: [
        gp('u1', 'me', 'red', { player_status: playerStatus(1, 3) }),
        gp('u2', 'moth', 'blue', { player_status: playerStatus(1, 3) }),
      ],
    }))).current.gd!
    expect(coop.readout.foundCount).toBe(2)
    expect(coop.readout.mistakeCount).toBe(3)
  })

  // SPECTATING: a guess until the design settles what a watcher sees.
  it('reads no matches and the budget spent for a club member watching a compete game', async () => {
    answer(ALL_GOOD)
    const gd = (await load(makeCtx({ myId: 'u9' }))).current.gd!
    expect(gd.me).toBeNull()
    expect(gd.readout.foundCount).toBe(0)
    expect(gd.readout.mistakeCount).toBe(4)
  })

  it('names compete\'s winner and the turn holder as players', async () => {
    answer(ALL_GOOD)
    const gd = (await load(makeCtx({
      turnHolderId: 'u2',
      players: [
        CTX.cg.players[0]!,
        { ...CTX.cg.players[1]!, outcome: 'won', final_ranking: 1 },
      ],
    }))).current.gd!
    expect(gd.winner?.username).toBe('moth')
    expect(gd.turns.turnHolder?.username).toBe('moth')
    expect(gd.turns.isTurnBased).toBe(true)
  })

  it('says I am eliminated in compete once my mistakes reach the budget, never in coop', async () => {
    answer(ALL_GOOD)
    expect((await load()).current.gd?.standing.isEliminated).toBe(false)
    const spent = [gp('u1', 'me', 'red', { player_status: playerStatus(2, 4) })]
    answer(ALL_GOOD)
    expect((await load(makeCtx({ players: spent }))).current.gd?.standing.isEliminated).toBe(true)
    answer(ALL_GOOD)
    expect((await load(makeCtx({ mode: 'coop', players: spent }))).current.gd?.standing.isEliminated)
      .toBe(false)
  })

  it('says I have solved in compete once my solve is recorded, and in coop when the team won', async () => {
    answer(ALL_GOOD)
    expect((await load()).current.gd?.standing.hasSolved).toBe(false)
    answer(ALL_GOOD)
    const solved = makeCtx({
      players: [
        gp('u1', 'me', 'red', { solved_at: '2026-06-15T00:05:00Z', player_status: playerStatus(4, 2) }),
        CTX.cg.players[1]!,
      ],
    })
    expect((await load(solved)).current.gd?.standing.hasSolved).toBe(true)
    answer(ALL_GOOD)
    const coopWon = makeCtx({
      mode: 'coop',
      gameEnding: { reason: 'reached_goal', reasonDetail: 'solved', outcome: 'won', endedByUserId: 'u2' },
    })
    expect((await load(coopWon)).current.gd?.standing.hasSolved).toBe(true)
  })

  it('picks my own entry out as me, and carries where I stand', async () => {
    answer(ALL_GOOD)
    const gd = (await load()).current.gd!
    expect(gd.me?.username).toBe('me')
    expect(gd.standing.isMyTurn).toBe(true)
    expect(gd.standing.isPlayer).toBe(true)
  })

  it('builds the setup rows with the puzzle\'s date', async () => {
    answer(ALL_GOOD)
    const gd = (await load()).current.gd!
    expect(gd.setupRows.find((r) => r.key === 'puzzle_id')?.value).toBe('June 15, 2026')
  })
})

describe('connections useGame — no such game', () => {
  it('leaves gd null WITHOUT a failure, so the page says "not found" and not "offline"', async () => {
    // Zero rows is the caller's to read: no game with that id, or one this
    // club cannot see. Nothing failed, so nothing may claim it did.
    answer({ games: ok([]) })
    const result = await load()

    expect(result.current.gd).toBeNull()
    expect(result.current.failure).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('does not go on to read the log', async () => {
    answer({ games: ok([]) })
    await load()
    expect(mockReadRows).toHaveBeenCalledTimes(1)
  })
})

describe('connections useGame — a read that failed', () => {
  it('keeps the game read’s own failure', async () => {
    answer({ games: readFailed('PN301') })
    const result = await load()

    expect(result.current.failure?.dbcode).toBe('PN301')
    expect(result.current.gd).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('keeps the EVENTS read’s failure, not the game read’s success', async () => {
    answer({ ...ALL_GOOD, events: readFailed('PN303') })
    expect((await load()).current.failure?.dbcode).toBe('PN303')
  })
})

describe('connections useGame — the outage that ended', () => {
  it('clears the failure on the next load that worked', async () => {
    // This refetches on every move and every rejoin, so a recovered outage has
    // to take its sentence with it — otherwise the board comes back under a
    // stale explanation of why it is missing.
    answer({ games: readFailed('PN301') })
    const { result } = renderHook(() => useGame(CTX))
    await act(async () => {
      await refetch.load!({ isCurrent: () => true })
    })
    expect(result.current.failure).not.toBeNull()

    answer(ALL_GOOD)
    await act(async () => {
      await refetch.load!({ isCurrent: () => true })
    })
    expect(result.current.failure).toBeNull()
    expect(result.current.gd?.events.map((e) => e.id)).toEqual([1, 2, 3])
  })

  it('clears it too when the next load finds the game gone', async () => {
    // A friend deleted the game during the outage: the read works and finds
    // zero rows. That is "not found", and the stale outage sentence must not
    // stand in front of it.
    answer({ games: readFailed('PN301') })
    const { result } = renderHook(() => useGame(CTX))
    await act(async () => {
      await refetch.load!({ isCurrent: () => true })
    })
    expect(result.current.failure).not.toBeNull()

    answer({ games: ok([]) })
    await act(async () => {
      await refetch.load!({ isCurrent: () => true })
    })
    expect(result.current.failure).toBeNull()
    expect(result.current.gd).toBeNull()
  })
})

describe('connections useGame — the picks room', () => {
  it('coop joins the game\'s room once, and a token refresh does not rebuild it', async () => {
    answer(ALL_GOOD)
    const coop = makeCtx({ mode: 'coop' })
    const { rerender } = renderHook((ctx: PlayAreaLoaderProps) => useGame(ctx), { initialProps: coop })
    expect(mockChannel).toHaveBeenCalledTimes(1)
    expect(mockChannel).toHaveBeenCalledWith(`connections:${GAME_ID}`)

    // A new Session object, as a refresh hands React. The room is keyed on the
    // game, so nothing may tear it down.
    rerender({ ...coop, authSession: { user: { id: 'u1' } } } as unknown as PlayAreaLoaderProps)
    expect(mockChannel).toHaveBeenCalledTimes(1)
    expect(mockRemoveChannel).not.toHaveBeenCalled()
  })

  it('rebuilds the room when the game changes', async () => {
    answer(ALL_GOOD)
    const coop = makeCtx({ mode: 'coop' })
    const { rerender } = renderHook((ctx: PlayAreaLoaderProps) => useGame(ctx), { initialProps: coop })
    rerender({ ...coop, cg: { ...coop.cg, id: 'g2' } })
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
    expect(mockChannel).toHaveBeenCalledTimes(2)
    expect(mockChannel).toHaveBeenLastCalledWith('connections:g2')
  })

  it('coop applies a click locally and puts it on the wire', async () => {
    answer(ALL_GOOD)
    const result = await load(makeCtx({ mode: 'coop' }))
    act(() => result.current.gd!.picks.toggleTile('a'))
    expect(result.current.gd!.picks.union).toEqual(['a'])
    expect(result.current.gd!.picks.ownerByTile.get('a')).toBe('u1')
    expect(channelChain.send).toHaveBeenCalledWith({
      type: 'broadcast', event: 'pick', payload: { type: 'pick', tile: 'a', userId: 'u1' },
    })
  })

  it('compete joins no room, and a click stays on this client', async () => {
    answer(ALL_GOOD)
    const result = await load()
    expect(mockChannel).not.toHaveBeenCalled()
    act(() => result.current.gd!.picks.toggleTile('a'))
    expect(result.current.gd!.picks.union).toEqual(['a'])
    expect(channelChain.send).not.toHaveBeenCalled()
  })

  it('a clear empties the picks', async () => {
    answer(ALL_GOOD)
    const result = await load()
    act(() => result.current.gd!.picks.toggleTile('a'))
    act(() => result.current.gd!.picks.sendClear())
    expect(result.current.gd!.picks.union).toEqual([])
  })
})
