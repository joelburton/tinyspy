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

/** The envelope PostgREST hands back, in both arms. */
const envelope = (fields: Record<string, unknown>) => ({
  data: {
    type: 'ok', data: null, outcome: null, severity: null, message: null,
    field: null, meta: null, dbcode: null, detail: null, ...fields,
  },
  error: null,
})

describe('makeRpcDispatcher', () => {
  it('calls the named RPC with { target_game } and hands the ok envelope up', async () => {
    const rpc = vi.fn().mockResolvedValue(envelope({ data: { result: 'ended' } }))
    const submitTimeout = makeRpcDispatcher({ rpc }, 'submit_timeout')

    const res = await submitTimeout('game-1')

    expect(res.type).toBe('ok')
    expect(res.type === 'ok' && res.data?.result).toBe('ended')
    expect(rpc).toHaveBeenCalledWith('submit_timeout', { target_game: 'game-1' })
  })

  it('relays a refusal WITHOUT deciding anything about it', async () => {
    // The dispatcher is a thunk, not a policy: the peer race that ends every
    // timed multiplayer game reaches it as PN486, and it passes it up intact so
    // GamePage — which knows whether anyone is looking — decides to swallow it.
    const rpc = vi.fn().mockResolvedValue(envelope({
      type: 'not-ok', severity: 'race', outcome: 'noted',
      message: 'Game over', dbcode: 'PN486', field: '_',
    }))
    const endGame = makeRpcDispatcher({ rpc }, 'end_game')

    const res = await endGame('game-2')

    expect(res.type).toBe('not-ok')
    expect(res.type === 'not-ok' && res.severity).toBe('race')
    expect(res.message).toBe('Game over')
    expect(res.dbcode).toBe('PN486')
    expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'game-2' })
  })
})
