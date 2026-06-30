/**
 * Tests for connections's `startGameInClub` — specifically the
 * "you already have a game for this puzzle, but with a different set of
 * players" path.
 *
 * The regression this guards: connections has a unique (club, puzzle, mode)
 * constraint, so starting a game for a puzzle the club already has one for
 * used to silently load the *existing* game and wait for *its* roster — not
 * the players you just picked in the dialog. The fix returns a rich error
 * naming the players the existing game needs (with their circle colors), which
 * meant reading two **`common`-schema** tables: `game_players` and `profiles`.
 *
 * The bug those reads carried: they went through the connections-scoped `db`
 * (`supabase.schema('connections')`), but `game_players` / `profiles` live in
 * the `common` schema — so at runtime PostgREST looked up
 * `connections.game_players` (404) and the error named *no* players (an empty
 * roster-mismatch message); it also broke `tsc -b`.
 *
 * To catch that, the two db clients are mocked SEPARATELY: the connections
 * `db` serves `games` but returns NO data for `game_players` / `profiles` (as
 * the real wrong-schema query does), while the `common` db serves them. A
 * correct implementation reads the common client and names the players; the
 * buggy one reads connections, gets nothing, and names an empty roster.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Member, RichMessage } from '../common/lib/games'

/** A chainable, awaitable supabase-query-builder stand-in: `select`/`eq`/`in`
 *  return itself; `maybeSingle`/`single` and a direct `await` all resolve to
 *  the same `{ data, error }`. */
function builder(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    in: () => b,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => void) => resolve(result),
  }
  return b
}

const EMPTY = { data: null, error: { message: 'relation does not exist' } }

// Per-table results for each schema's client. Tests mutate these in beforeEach.
const { connData, commonData, rpcResult } = vi.hoisted(() => ({
  connData: {} as Record<string, { data: unknown; error: unknown }>,
  commonData: {} as Record<string, { data: unknown; error: unknown }>,
  rpcResult: { current: { data: null as unknown, error: null as unknown } },
}))

// The connections-scoped client (`supabase.schema('connections')`). It owns the
// connections tables (`games`) + the create_game RPC. `game_players`/`profiles`
// are NOT in this schema — querying them returns EMPTY, exactly as the real
// wrong-schema call does.
vi.mock('./db', () => ({
  db: {
    from: (table: string) => builder(connData[table] ?? EMPTY),
    rpc: () => builder(rpcResult.current),
  },
}))

// The common-scoped client (`supabase.schema('common')`) — the correct home of
// `game_players` and `profiles`.
vi.mock('../common/db', () => ({
  db: { from: (table: string) => builder(commonData[table] ?? EMPTY) },
}))

import { connectionsCoopGame } from './manifest'

/** Extract the usernames named (as `{ player }` tokens) in a rich error. */
function namedPlayers(msg: RichMessage): string[] {
  return msg
    .filter((t): t is { player: Member } => typeof t === 'object' && t !== null && 'player' in t)
    .map((t) => t.player.username)
}

beforeEach(() => {
  // An existing coop game for puzzle 'p1' in club 'pals'.
  connData.games = { data: { id: 'game-1' }, error: null }
  // The existing game's roster — ada + bea — served by the COMMON client.
  commonData.game_players = {
    data: [{ user_id: 'ada-id' }, { user_id: 'bea-id' }],
    error: null,
  }
  commonData.profiles = {
    data: [
      { user_id: 'ada-id', username: 'ada', color: 'red' },
      { user_id: 'bea-id', username: 'bea', color: 'blue' },
    ],
    error: null,
  }
})

describe('connectionsCoopGame.startGameInClub — existing puzzle, different players', () => {
  it('returns a rich error naming the existing game’s players (not an empty roster)', async () => {
    // The dialog picked cade — a DIFFERENT roster from the existing ada+bea game.
    const res = await connectionsCoopGame.startGameInClub('pals', { puzzleId: 'p1' }, ['cade-id'])

    expect(res).toHaveProperty('error')
    const msg = (res as { error: RichMessage }).error
    // The whole point: the message names WHO the existing game needs. The bug
    // (reading game_players/profiles via the connections schema) made this empty.
    expect(namedPlayers(msg)).toEqual(['ada', 'bea'])
  })

  it('reopens the existing game when the roster matches (same players)', async () => {
    // Pick exactly the existing roster — ada + bea (order-independent).
    const res = await connectionsCoopGame.startGameInClub('pals', { puzzleId: 'p1' }, [
      'bea-id',
      'ada-id',
    ])
    expect(res).toEqual({ id: 'game-1' })
  })
})

describe('connectionsCoopGame.startGameInClub — no existing puzzle game', () => {
  it('creates a new game via create_game', async () => {
    connData.games = { data: null, error: null } // no existing game
    rpcResult.current = { data: { id: 'new-game' }, error: null }

    const res = await connectionsCoopGame.startGameInClub('pals', { puzzleId: 'p2' }, ['cade-id'])
    expect(res).toEqual({ id: 'new-game' })
  })
})
