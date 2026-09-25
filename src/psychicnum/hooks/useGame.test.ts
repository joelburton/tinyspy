// cs-fixed-psychicnum

/**
 * WHAT THREE READS BECOME, AND WHAT A FAILED ONE LEAVES BEHIND.
 *
 * The hook's subscription is `useRealtimeRefetch`'s — the channel, the
 * SUBSCRIBED refetch and the teardown are that hook's contract and its own
 * tests'. Stubbed here so the refetch body can be run on demand, because the
 * body is what belongs to psychicnum: three reads, and the distinctions a
 * failure has to keep.
 *
 * Two of those distinctions are invisible in the returned state unless you
 * look for them. An absent game and a failed read BOTH leave `game` null, and
 * only `failure` tells the page which one to draw. And WHICH read failed is
 * the one thing a player's sentence cannot say, so the three are branched
 * separately rather than folded into one test — a fold typechecks perfectly
 * and reports the wrong outage.
 */

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Envelope } from '@/common/supabase/envelope'

const { mockReadRows, refetch } = vi.hoisted(() => ({
  mockReadRows: vi.fn(),
  // The `load` the hook hands `useRealtimeRefetch`, kept so a test can run it.
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

vi.mock('@/common/realtime/useRealtimeRefetch', () => ({
  useRealtimeRefetch: (opts: { load: (a: { mounted: () => boolean }) => Promise<void> }) => {
    refetch.load = opts.load
  },
}))

vi.mock('@/common/supabase/dbResult', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/common/supabase/dbResult')>()),
  readRows: mockReadRows,
}))

import { useGame } from './useGame'

const GAME_ID = 'g1'

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
  id: GAME_ID,
  club_handle: 'pals',
  mode: 'coop',
  words: ['apple', 'brick', 'cedar'],
  secrets: null,
  created_at: '2026-09-01T00:00:00Z',
}
const PLAYER_ROW = { user_id: 'u1', guesses_used: 2, found_secrets_count: 1 }
const EVENT_ROW = {
  id: 1, user_id: 'u1', word: 'apple', is_correct: true,
  kind: 'guess', created_at: '2026-09-01T00:01:00Z',
}

/** Answer each of the three reads by the table it was opened on, so a test
 *  says what it means rather than counting calls in load order. */
function answer(by: { games_state?: unknown; players?: unknown; events?: unknown }) {
  mockReadRows.mockImplementation((query: { table: keyof typeof by }) => {
    const res = by[query.table]
    if (!res) throw new Error(`no fixture for the ${String(query.table)} read`)
    return Promise.resolve(res)
  })
}

/** Everything present and readable — the ordinary load. */
const ALL_GOOD = {
  games_state: ok([GAME_ROW]),
  players: ok([PLAYER_ROW]),
  events: ok([EVENT_ROW]),
}

/** Mount, run one refetch, and hand back what the hook says afterwards. */
async function load() {
  const { result } = renderHook(() => useGame(GAME_ID))
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
  it('projects the row, the budgets and the log, and stops loading', async () => {
    answer(ALL_GOOD)
    const result = await load()

    expect(result.current.game?.id).toBe(GAME_ID)
    expect(result.current.game?.words).toEqual(['apple', 'brick', 'cedar'])
    expect(result.current.players).toEqual([PLAYER_ROW])
    expect(result.current.guesses).toEqual([EVENT_ROW])
    expect(result.current.loading).toBe(false)
    expect(result.current.failure).toBeNull()
  })

  it('keeps the secrets null while the game is live — the view withholds them', async () => {
    answer(ALL_GOOD)
    expect((await load()).current.game?.secrets).toBeNull()
  })
})

describe('psychicnum useGame — no such game', () => {
  it('leaves game null WITHOUT a failure, so the page says "not found" and not "offline"', async () => {
    // Zero rows is the caller's to read: no game with that id, or one this
    // club cannot see. Nothing failed, so nothing may claim it did.
    answer({ games_state: ok([]) })
    const result = await load()

    expect(result.current.game).toBeNull()
    expect(result.current.failure).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('does not go on to read the players or the log', async () => {
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
    expect(result.current.game).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('keeps the PLAYERS read’s failure, not the game read’s success', async () => {
    answer({ ...ALL_GOOD, players: readFailed('PN302') })
    expect((await load()).current.failure?.dbcode).toBe('PN302')
  })

  it('keeps the EVENTS read’s failure', async () => {
    answer({ ...ALL_GOOD, events: readFailed('PN303') })
    expect((await load()).current.failure?.dbcode).toBe('PN303')
  })
})

describe('psychicnum useGame — the outage that ended', () => {
  it('clears the failure on the next load that worked', async () => {
    // This refetches on every realtime event, so a recovered outage has to
    // take its sentence with it — otherwise the board comes back under a
    // stale explanation of why it is missing.
    answer({ games_state: readFailed('PN301') })
    const { result } = renderHook(() => useGame(GAME_ID))
    await act(async () => {
      await refetch.load!({ mounted: () => true })
    })
    expect(result.current.failure).not.toBeNull()

    answer(ALL_GOOD)
    await act(async () => {
      await refetch.load!({ mounted: () => true })
    })
    expect(result.current.failure).toBeNull()
    expect(result.current.game?.id).toBe(GAME_ID)
  })
})
