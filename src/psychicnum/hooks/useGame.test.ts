// cs-fixed-psychicnum

/**
 * WHAT TWO READS AND THE PAGE'S VALUES BECOME, AND WHAT A FAILED READ LEAVES
 * BEHIND.
 *
 * When the hook reloads is `useRefetchOnGameUpdate`'s contract and its own
 * tests'. Stubbed here so the load body can be run on demand, because the
 * body is what belongs to psychicnum: two reads, `gd` built from them and the
 * page's values, and the distinctions a failure has to keep.
 *
 * Two of those distinctions are invisible in the returned state unless you
 * look for them. An absent game and a failed read BOTH leave `gd` null, and
 * only `failure` tells the page which one to draw. And WHICH read failed is
 * the one thing a player's sentence cannot say, so the two are branched
 * separately rather than folded into one test — a fold typechecks perfectly
 * and reports the wrong outage.
 */

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Envelope } from '@/common/supabase/envelope'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { CONCEDED, gp } from '@/common/members/gamePlayer.fixture'
import type { PsychicnumPlayerStatus } from '../lib/statuses'

const { mockReadRows, refetch } = vi.hoisted(() => ({
  mockReadRows: vi.fn(),
  // The `load` the hook hands `useRefetchOnGameUpdate`, kept so a test can run it.
  refetch: { load: null as ((a: { mounted: () => boolean }) => Promise<void>) | null },
}))

// A query builder that remembers which table it was opened on and answers
// every chained call with itself — `readRows` is mocked, so the chain only has
// to survive being built, and the table is how the mock knows which read this is.
vi.mock('../db', () => {
  const on = (table: string): unknown =>
    new Proxy({ table }, { get: (t, key) => (key === 'table' ? t.table : () => on(t.table)) })
  return { db: { from: (table: string) => on(table) } }
})

vi.mock('@/common/game-page/useRefetchOnGameUpdate', () => ({
  useRefetchOnGameUpdate: (opts: { load: (a: { mounted: () => boolean }) => Promise<void> }) => {
    refetch.load = opts.load
  },
}))

vi.mock('@/common/supabase/dbResult', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/common/supabase/dbResult')>()),
  readRows: mockReadRows,
}))

import { useGame } from './useGame'

const GAME_ID = 'g1'

const playerStatus = (found: number, used: number, ended: PsychicnumPlayerStatus['player_ended_reason'] = null) => ({
  found_secrets_count: found, guesses_used: used, player_ended_reason: ended,
})

/** The page's values, as `GamePage` hands them: me (u1) and moth (u2), a
 *  compete game in play, moth conceded. */
const CTX = {
  gameId: GAME_ID,
  session: { user: { id: 'u1' } },
  mode: 'compete',
  title: 'A game',
  setup: { max_guesses: 7, word_count: 10, band: 3, timer: { kind: 'none' } },
  gameStatus: { required_secrets_count: 3, max_guesses: 7 },
  players: [
    gp('u1', 'me', 'red', { player_status: playerStatus(1, 2) }),
    gp('u2', 'moth', 'blue', { ...CONCEDED, player_status: playerStatus(0, 3, 'conceded') }),
  ],
  gameEnding: null,
  isTurnBased: false,
  turnHolderId: null,
  isPlayer: true,
  isConceded: false,
  isLocallyTerminal: false,
  isStillPlaying: true,
  isMyTurn: true,
  isWaitingForTurn: false,
  isBoardInteractive: true,
  commonGameUpdatedAt: 't1',
  resubscribeCount: 0,
} as unknown as GamePageCtx

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

const GAME_ROW = {
  words: ['apple', 'brick', 'cedar'],
  secrets: null,
}
const EVENT_ROW = {
  id: 1, user_id: 'u1', word: 'apple', is_correct: true,
  kind: 'guess', created_at: '2026-09-01T00:01:00Z',
}

/** Answer each of the two reads by the table it was opened on, so a test
 *  says what it means rather than counting calls in load order. */
function answer(by: { games_state?: unknown; events?: unknown }) {
  mockReadRows.mockImplementation((query: { table: keyof typeof by }) => {
    const res = by[query.table]
    if (!res) throw new Error(`no fixture for the ${String(query.table)} read`)
    return Promise.resolve(res)
  })
}

/** Everything present and readable — the ordinary load. */
const ALL_GOOD = {
  games_state: ok([GAME_ROW]),
  events: ok([EVENT_ROW]),
}

/** Mount, run one refetch, and hand back what the hook says afterwards. */
async function load() {
  const { result } = renderHook(() => useGame(CTX))
  await act(async () => {
    await refetch.load!({ mounted: () => true })
  })
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
  refetch.load = null
})

describe('psychicnum useGame — a load that worked', () => {
  it('builds gd from the reads and the page, and stops loading', async () => {
    answer(ALL_GOOD)
    const result = await load()
    const gd = result.current.gd!

    expect(gd.board.words).toEqual(['apple', 'brick', 'cedar'])
    expect(gd.events).toEqual([EVENT_ROW])
    expect(gd.mode).toBe('compete')
    expect(result.current.loading).toBe(false)
    expect(result.current.failure).toBeNull()
  })

  it('keeps the secrets null while the game is live — the view withholds them', async () => {
    answer(ALL_GOOD)
    expect((await load()).current.gd?.secrets).toBeNull()
  })

  it('reads the budget and the secret count off game_status', async () => {
    answer(ALL_GOOD)
    const gd = (await load()).current.gd!
    expect(gd.readout.maxGuesses).toBe(7)
    expect(gd.readout.requiredSecretsCount).toBe(3)
  })

  it('keys the players by id, in the page\'s order, each with their own counts and ending', async () => {
    answer(ALL_GOOD)
    const gd = (await load()).current.gd!
    expect(Object.keys(gd.players)).toEqual(['u1', 'u2'])
    expect(gd.numPlayers).toBe(2)
    expect([gd.players.u1!.foundSecretsCount, gd.players.u1!.guessesUsed]).toEqual([1, 2])
    expect([gd.players.u2!.foundSecretsCount, gd.players.u2!.guessesUsed]).toEqual([0, 3])
    expect(gd.players.u1!.playerEnding).toBeNull()
    expect(gd.players.u2!.playerEnding).toEqual({
      at: CONCEDED.player_ended_at, reason: 'conceded', reasonDetail: 'conceded',
    })
  })

  it('says whether each player found every secret, against the board\'s count', async () => {
    answer(ALL_GOOD)
    const withAllThree = {
      ...CTX,
      players: [gp('u1', 'me', 'red', { player_status: playerStatus(3, 4) }), CTX.players[1]!],
    } as GamePageCtx
    const { result } = renderHook(() => useGame(withAllThree))
    await act(async () => {
      await refetch.load!({ mounted: () => true })
    })
    expect(result.current.gd?.players.u1?.foundAllSecrets).toBe(true)
    expect(result.current.gd?.players.u2?.foundAllSecrets).toBe(false)
  })

  it('shapes the board from the guess rows alone', async () => {
    const hint = { ...EVENT_ROW, id: 2, word: 'a clue', kind: 'hint' }
    const miss = { ...EVENT_ROW, id: 3, user_id: 'u2', word: 'brick', is_correct: false }
    answer({ ...ALL_GOOD, events: ok([EVENT_ROW, hint, miss]) })
    const gd = (await load()).current.gd!
    expect([...gd.board.tileResults]).toEqual([['apple', true], ['brick', false]])
    expect(gd.board.decidedBy.get('brick')?.username).toBe('moth')
    expect(gd.board.guessCount).toBe(2)
  })

  it('gives the counts that apply to me — my own in compete', async () => {
    answer(ALL_GOOD)
    const gd = (await load()).current.gd!
    expect([gd.readout.foundSecretsCount, gd.readout.guessesUsed]).toEqual([1, 2])
  })

  it('names compete\'s winner and the turn holder as players', async () => {
    answer(ALL_GOOD)
    const won = {
      ...CTX,
      turnHolderId: 'u2',
      players: [CTX.players[0]!, { ...CTX.players[1]!, outcome: 'won', final_ranking: 1 }],
    } as GamePageCtx
    const { result } = renderHook(() => useGame(won))
    await act(async () => {
      await refetch.load!({ mounted: () => true })
    })
    expect(result.current.gd?.winner?.username).toBe('moth')
    expect(result.current.gd?.turnHolder?.username).toBe('moth')
  })

  it('says I have solved once I found every secret in compete, and not before', async () => {
    answer(ALL_GOOD)
    expect((await load()).current.gd?.standing.hasSolved).toBe(false)
    const allThree = {
      ...CTX,
      players: [gp('u1', 'me', 'red', { player_status: playerStatus(3, 4) }), CTX.players[1]!],
    } as GamePageCtx
    const { result } = renderHook(() => useGame(allThree))
    await act(async () => {
      await refetch.load!({ mounted: () => true })
    })
    expect(result.current.gd?.standing.hasSolved).toBe(true)
  })

  it('picks my own entry out as me, and carries where I stand', async () => {
    answer(ALL_GOOD)
    const gd = (await load()).current.gd!
    expect(gd.me?.username).toBe('me')
    expect(gd.standing.isMyTurn).toBe(true)
    expect(gd.standing.isPlayerEnded).toBe(false)
  })
})

describe('psychicnum useGame — no such game', () => {
  it('leaves gd null WITHOUT a failure, so the page says "not found" and not "offline"', async () => {
    // Zero rows is the caller's to read: no game with that id, or one this
    // club cannot see. Nothing failed, so nothing may claim it did.
    answer({ games_state: ok([]) })
    const result = await load()

    expect(result.current.gd).toBeNull()
    expect(result.current.failure).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('does not go on to read the log', async () => {
    answer({ games_state: ok([]) })
    await load()
    expect(mockReadRows).toHaveBeenCalledTimes(1)
  })
})

describe('psychicnum useGame — a read that failed', () => {
  it('keeps the game read’s own failure', async () => {
    answer({ games_state: readFailed('PN301') })
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

describe('psychicnum useGame — the outage that ended', () => {
  it('clears the failure on the next load that worked', async () => {
    // This refetches on every move and every rejoin, so a recovered outage has
    // to take its sentence with it — otherwise the board comes back under a
    // stale explanation of why it is missing.
    answer({ games_state: readFailed('PN301') })
    const { result } = renderHook(() => useGame(CTX))
    await act(async () => {
      await refetch.load!({ mounted: () => true })
    })
    expect(result.current.failure).not.toBeNull()

    answer(ALL_GOOD)
    await act(async () => {
      await refetch.load!({ mounted: () => true })
    })
    expect(result.current.failure).toBeNull()
    expect(result.current.gd?.board.words).toEqual(['apple', 'brick', 'cedar'])
  })

  it('clears it too when the next load finds the game gone', async () => {
    // A friend deleted the game during the outage: the read works and finds
    // zero rows. That is "not found", and the stale outage sentence must not
    // stand in front of it.
    answer({ games_state: readFailed('PN301') })
    const { result } = renderHook(() => useGame(CTX))
    await act(async () => {
      await refetch.load!({ mounted: () => true })
    })
    expect(result.current.failure).not.toBeNull()

    answer({ games_state: ok([]) })
    await act(async () => {
      await refetch.load!({ mounted: () => true })
    })
    expect(result.current.failure).toBeNull()
    expect(result.current.gd).toBeNull()
  })
})
