// cs-unmet

/**
 * Shared manifest RPC dispatchers — the tiny, identical wrappers every game's
 * manifest hand-copied to turn a Supabase `db.rpc(...)` into the
 * `{ error?: string }` shape the GameManifest contract wants.
 *
 * **What used to live here as well were three START-GAME adapters**, and they
 * are gone because every `create_game` in the roster now returns the envelope
 * itself: a manifest calls `runRpc` or `runEdgeFn` and gets the same shape
 * either way. The adapters existed to make an unconverted RPC's `{ data, error }`
 * LOOK like one, so that the frontend could be converted before all sixteen
 * games were — a bridge with a stated end, and this is it.
 *
 * `submit_timeout` / `end_game` are what remain, and they are on the envelope
 * now too — so this file is one thin call, kept because the manifest contract
 * wants a `(gameId) => …` thunk and every game would otherwise write the same
 * closure. It converts nothing and decides nothing.
 */

import { runRpc } from '../supabase/dbResult'
import type { Envelope } from '../supabase/envelope'
import type { GameStopResult } from '../games'

/**
 * A minimal structural view of a schema-scoped Supabase client's `.rpc`, narrow
 * enough that any game's `db` (`supabase.schema('<game>')`) satisfies it —
 * generic over the ONE function name being called so a game whose schema lacks,
 * say, `end_game` (bananagrams, which uses per-player concede) still satisfies
 * `RpcClient<'submit_timeout'>`. We only need the `{ error }` off the awaited
 * result.
 */
type RpcClient<F extends string> = {
  rpc: (
    fn: F,
    args: { target_game: string },
  ) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>
}

/**
 * Build the game-agnostic `(gameId) => Promise<{ error? }>` dispatcher for a
 * per-game, single-`target_game`-arg RPC. Collapses the byte-identical
 * `submitTimeout` / `endGame` wrappers across all ten games:
 *
 *     const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
 *     const endGame       = makeRpcDispatcher(db, 'end_game')
 *
 * `submit_timeout` is fired by every connected client on countdown expiry, so
 * all but one arrive to find the game already over — PN486, a race. The
 * dispatcher does not decide what to do about that: it hands the envelope up,
 * and GamePage swallows the race while surfacing everything else.
 */
export function makeRpcDispatcher<F extends string>(
  db: RpcClient<F>,
  fnName: F,
): (gameId: string) => Promise<Envelope<GameStopResult>> {
  return async (gameId: string) => {
    return await runRpc<GameStopResult>(db.rpc(fnName, { target_game: gameId }))
  }
}



