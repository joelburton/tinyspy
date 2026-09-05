// cs-unmet

/**
 * Build the `submitTimeout` and `endGame` functions a game's manifest declares.
 *
 * Reach for this from a `manifest.ts` — it is the whole of what those two
 * members need:
 *
 *     submitTimeout: makeRpcDispatcher(db, 'submit_timeout'),
 *     endGame:       makeRpcDispatcher(db, 'end_game'),
 *
 * `GameManifest` wants a `(gameId) => Promise<Envelope<GameStopResult>>` thunk
 * for each, and every game would otherwise write the same closure by hand.
 * **It converts nothing and decides nothing** — `runRpc`
 * already returns the envelope, so this only binds the client and the function
 * name and turns `target_game` into a positional argument.
 *
 * Nothing here is for `startGameInClub`: every `create_game` returns the
 * envelope itself, so a manifest calls `runRpc` or `runEdgeFn` for that one
 * and gets the same shape either way.
 */

import { runRpc } from '../supabase/dbResult'
import type { Envelope } from '../supabase/envelope'
import type { GameStopResult } from './gameManifest'

/**
 * A minimal structural view of a schema-scoped Supabase client's `.rpc`, narrow
 * enough that any game's `db` (`supabase.schema('<game>')`) satisfies it.
 *
 * **Generic over the ONE function name being called**, so a call site only has
 * to prove its client can call *that* function rather than every name this
 * module might use. No game needs the narrowing today — every schema
 * define both `submit_timeout` and `end_game`, bananagrams included, which also
 * has per-player concede rather than instead of `end_game`. It is kept because
 * a per-call constraint costs nothing and is the honest requirement.
 *
 * Both halves of the awaited result are needed, not just `error`: on a 2xx the
 * ENVELOPE arrives in `data`, and reading it is `runRpc`'s whole job.
 */
type RpcClient<F extends string> = {
  rpc: (
    fn: F,
    args: { target_game: string },
  ) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>
}

/**
 * Build the game-agnostic `(gameId) => Promise<Envelope<GameStopResult>>`
 * dispatcher for a per-game, single-`target_game`-arg RPC. Every game folder
 * calls it twice, once per member, instead of writing the same closure by
 * hand.
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
