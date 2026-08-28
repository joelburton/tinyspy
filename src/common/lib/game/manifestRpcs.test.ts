// cs-unmet

/**
 * Tests for manifestRpcs — what is left of it.
 *
 * The start-game adapters this file also covered are gone: every `create_game`
 * returns the envelope itself now, so a manifest calls `runRpc` / `runEdgeFn`
 * and those two are tested where they live (dbResult.test.ts). What remains is
 * the `{ data, error }` → `{ error? }` collapse for `submit_timeout` and
 * `end_game`, which is small but load-bearing: it is ONE frontend path over
 * sixteen SQL definitions, so a regression here breaks every game at once.
 *
 * `makeRpcDispatcher` takes the `db` as a param, so it is tested with a fake
 * client and no mocking at all.
 */

import { describe, expect, it, vi } from 'vitest'

import { makeRpcDispatcher } from './manifestRpcs'

describe('makeRpcDispatcher', () => {
  it('calls the named RPC with { target_game } and returns {} on success', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const submitTimeout = makeRpcDispatcher({ rpc }, 'submit_timeout')

    const result = await submitTimeout('game-1')

    expect(result).toEqual({})
    expect(rpc).toHaveBeenCalledWith('submit_timeout', { target_game: 'game-1' })
  })

  it('surfaces the STRUCTURED error — message and code intact for the classifier', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'game-not-in-play|', code: 'P0001' } })
    const endGame = makeRpcDispatcher({ rpc }, 'end_game')

    expect(await endGame('game-2')).toEqual({ error: { message: 'game-not-in-play|', code: 'P0001' } })
    expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'game-2' })
  })
})
