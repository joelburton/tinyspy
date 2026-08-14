/**
 * Tests for connections's `startGameInClub`.
 *
 * This file used to guard the find-or-create path: connections had a unique
 * (club, puzzle, mode) constraint, so starting a game for a puzzle the club
 * already had one for loaded the EXISTING game and waited for ITS roster
 * rather than the players just picked — and the fix (a rich error naming the
 * players that game needs) had its own bug, reading `game_players` /
 * `profiles` through the connections-scoped client when they live in
 * `common`.
 *
 * All of that is gone, and could not be reached today: the setup dialog has
 * no puzzle picker, and `connections.create_game` hands out the earliest
 * puzzle none of the selected players has played — so "a game already exists
 * for this puzzle" is not a state the dialog can produce. Resuming a
 * half-finished game is the club page's job.
 *
 * What's left to pin is that starting a game passes the setup through
 * untouched, `puzzleId` included when one IS supplied (the fixtures rely on
 * that) and absent when it isn't (which is how the server is told to choose).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

/** A chainable, awaitable supabase-query-builder stand-in. */
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

const { connData, rpcResult, rpcCalls } = vi.hoisted(() => ({
  connData: {} as Record<string, { data: unknown; error: unknown }>,
  rpcResult: { current: { data: null as unknown, error: null as unknown } },
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
}))

vi.mock('./db', () => ({
  db: {
    from: (table: string) => builder(connData[table] ?? EMPTY),
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      return builder(rpcResult.current)
    },
  },
}))

import { connectionsCoopGame } from './manifest'

beforeEach(() => {
  rpcCalls.length = 0
  rpcResult.current = { data: { id: 'new-game' }, error: null }
})

describe('connectionsCoopGame.startGameInClub', () => {
  it('creates a game via create_game and returns its id', async () => {
    const res = await connectionsCoopGame.startGameInClub('pals', { timer: { kind: 'none' } }, [
      'cade-id',
    ])
    expect(res).toEqual({ id: 'new-game' })
    expect(rpcCalls[0]!.name).toBe('create_game')
    expect(rpcCalls[0]!.args.target_club).toBe('pals')
    expect(rpcCalls[0]!.args.player_user_ids).toEqual(['cade-id'])
  })

  it('sends NO puzzleId when the setup carries none — that is how the server is told to choose', async () => {
    await connectionsCoopGame.startGameInClub('pals', { timer: { kind: 'none' } }, ['cade-id'])
    const setup = rpcCalls[0]!.args.setup as Record<string, unknown>
    expect('puzzleId' in setup).toBe(false)
  })

  it('passes an explicit puzzleId straight through when one IS given', async () => {
    // Not a path the dialog takes, but create_game still honours it and the
    // test fixtures depend on that staying true.
    await connectionsCoopGame.startGameInClub('pals', { puzzleId: 'p1', timer: { kind: 'none' } }, [
      'cade-id',
    ])
    expect((rpcCalls[0]!.args.setup as Record<string, unknown>).puzzleId).toBe('p1')
  })

  it('surfaces a create_game failure as an error rather than an id', async () => {
    rpcResult.current = { data: null, error: { message: 'boom' } }
    const res = await connectionsCoopGame.startGameInClub('pals', { timer: { kind: 'none' } }, [
      'cade-id',
    ])
    expect(res).toHaveProperty('error')
  })
})
