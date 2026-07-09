/**
 * Tests for crosswords' `startGameInClub` — specifically the setup-leak
 * backstop (review finding 1.1).
 *
 * The bug: an uploaded `.puz`/`.ipuz` parses its whole solution grid into
 * `setup.board`. `startGameInClub` used to strip `board`/`filename` from the
 * persisted setup ONLY when the *final* source was `'upload'`. But the
 * SetupForm tab buttons spread the prior setup (`onChange({ ...s, source:
 * 'library' })`), so a parsed board survives a tab-switch — and a
 * library/NYT start would then persist the full solution into the unshielded
 * `common.games.setup` + the club's saved default, whence it self-perpetuates.
 *
 * The fix strips `board`/`filename` UNCONDITIONALLY (plus a server backstop in
 * create_game). These tests pin the FE half: whatever the source, the persisted
 * setup never carries the board, and a genuine upload still rides its board as
 * the separate top-level `board` arg.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

/** A chainable supabase-query-builder stand-in: `.single()` resolves to the
 *  shared result; `rpc` records the (fn, args) it was called with. */
function builder(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {
    single: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => void) => resolve(result),
  }
  return b
}

const { rpcCalls, rpcResult } = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcResult: { current: { data: { id: 'new-game' } as unknown, error: null as unknown } },
}))

vi.mock('./db', () => ({
  db: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return builder(rpcResult.current)
    },
  },
}))

import { crosswordsCoopGame } from './manifest'

/** The args the last `create_game` rpc was invoked with. */
function lastCreateArgs(): Record<string, unknown> {
  const call = rpcCalls.filter((c) => c.fn === 'create_game').at(-1)
  if (!call) throw new Error('create_game was not called')
  return call.args
}

/** A minimal parsed upload board (shape only — the values are the "secret"). */
const UPLOAD_BOARD = {
  meta: { width: 2, height: 2, title: 'Secret', cells: [] },
  solution: [['A', 'B'], ['C', 'D']],
}

beforeEach(() => {
  rpcCalls.length = 0
  rpcResult.current = { data: { id: 'new-game' }, error: null }
})

describe('crosswordsCoopGame.startGameInClub — setup-leak backstop', () => {
  it('a genuine upload passes the board as the top-level arg, never in the setup', async () => {
    const setup = { timer: { kind: 'none' }, source: 'upload', board: UPLOAD_BOARD, filename: 'x.puz' }
    const res = await crosswordsCoopGame.startGameInClub('pals', setup, ['ada-id'])

    expect(res).toEqual({ id: 'new-game' })
    const args = lastCreateArgs()
    // The board rides as the separate inline arg…
    expect(args.board).toEqual(UPLOAD_BOARD)
    // …and is stripped from the setup create_game persists (status + default).
    expect(args.setup).not.toHaveProperty('board')
    expect(args.setup).not.toHaveProperty('filename')
  })

  it('a library start with a stale board (post tab-switch) still strips it', async () => {
    // Simulates: parse an upload, then switch to Library and pick a puzzle. The
    // spread-prior-setup leaves `board`/`filename` behind with source='library'.
    const setup = {
      timer: { kind: 'none' },
      source: 'library',
      puzzle_id: 'pz-1',
      board: UPLOAD_BOARD,
      filename: 'x.puz',
    }
    const res = await crosswordsCoopGame.startGameInClub('pals', setup, ['ada-id'])

    expect(res).toEqual({ id: 'new-game' })
    const args = lastCreateArgs()
    // Not an upload, so no inline board arg is sent…
    expect(args.board).toBeUndefined()
    // …and the stale board never reaches the persisted setup.
    expect(args.setup).not.toHaveProperty('board')
    expect(args.setup).not.toHaveProperty('filename')
    expect(args.setup).toMatchObject({ source: 'library', puzzle_id: 'pz-1' })
  })
})
