/**
 * Tests for manifestRpcs — the shared manifest dispatchers every game routes
 * its RPCs and board-build edge-fn calls through. Small but load-bearing: a
 * regression in the `{ data, error }` → `{ error? }` collapse, or in the
 * read-once edge-function error unwrap, would surface as a broken "start game"
 * or a swallowed failure across every game at once.
 *
 * makeRpcDispatcher takes the `db` as a param, so it's tested with a fake
 * client (no mocking). invokeStartGameEdgeFn reaches the module-level
 * `supabase.functions.invoke`, so that one module is mocked; the real
 * unwrapEdgeFnError runs, driven by a fake `context` Response.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }))

vi.mock('../supabase/supabase', () => ({
  supabase: { functions: { invoke: mockInvoke } },
}))

import { invokeStartGameEdgeFn, makeRpcDispatcher, type StartGameBody } from './manifestRpcs'

describe('makeRpcDispatcher', () => {
  it('calls the named RPC with { target_game } and returns {} on success', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const submitTimeout = makeRpcDispatcher({ rpc }, 'submit_timeout')

    const result = await submitTimeout('game-1')

    expect(result).toEqual({})
    expect(rpc).toHaveBeenCalledWith('submit_timeout', { target_game: 'game-1' })
  })

  it('surfaces the RPC error message verbatim', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'game is not in progress' } })
    const endGame = makeRpcDispatcher({ rpc }, 'end_game')

    expect(await endGame('game-2')).toEqual({ error: 'game is not in progress' })
    expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'game-2' })
  })
})

describe('invokeStartGameEdgeFn', () => {
  const body: StartGameBody = {
    target_club: 'club-x',
    setup: { timer: { kind: 'none' } },
    player_user_ids: ['u1'],
    mode: 'coop',
  }

  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('returns { id } when the edge function succeeds', async () => {
    mockInvoke.mockResolvedValue({ data: { id: 'new-game' }, error: null })

    expect(await invokeStartGameEdgeFn('boggle-build-board', body, 'MothCubes')).toEqual({
      id: 'new-game',
    })
    expect(mockInvoke).toHaveBeenCalledWith('boggle-build-board', { body })
  })

  it('unwraps the real server error off error.context (the subtle read-once path)', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      // invoke reports a generic message; the real error rides on context.json().
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'no eligible pangram seeds' }) },
      },
    })

    expect(await invokeStartGameEdgeFn('spellingbee-build-board', body, 'FreeBee')).toEqual({
      error: 'no eligible pangram seeds',
    })
  })

  it('falls back to error.message when there is no context to unwrap', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'network down' } })

    expect(await invokeStartGameEdgeFn('waffle-build-board', body, 'Waffle')).toEqual({
      error: 'network down',
    })
  })

  it('treats a 200 with an { error } body as a failure', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'those letters yield no words' }, error: null })

    expect(await invokeStartGameEdgeFn('spellingbee-build-board', body, 'FreeBee')).toEqual({
      error: 'those letters yield no words',
    })
  })

  it('uses the last-resort message when the payload has no id and no error', async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null })

    expect(await invokeStartGameEdgeFn('boggle-build-board', body, 'MothCubes')).toEqual({
      error: 'failed to start MothCubes (coop) game',
    })
  })
})
