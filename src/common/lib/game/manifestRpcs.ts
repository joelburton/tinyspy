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
 * `submit_timeout` / `end_game` are what remain: both are still on the old
 * shape, and both are ONE frontend path over sixteen SQL definitions
 * (`useStandardGameActions`), so they convert together or not at all.
 */

import { type CallError } from './serverError'

/** The manifest contract's dispatcher result: an optional STRUCTURED error
 *  (message + SQLSTATE), ready for the classifier — flattening to a string
 *  here is what used to cost GamePage the code and the copy table both. */
export type RpcResult = { error?: NonNullable<CallError> }

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
  ) => PromiseLike<{ error: { message: string; code?: string } | null }>
}

/**
 * Build the game-agnostic `(gameId) => Promise<{ error? }>` dispatcher for a
 * per-game, single-`target_game`-arg RPC. Collapses the byte-identical
 * `submitTimeout` / `endGame` wrappers across all ten games:
 *
 *     const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
 *     const endGame       = makeRpcDispatcher(db, 'end_game')
 *
 * `submit_timeout` is fired by every connected client on countdown expiry and
 * raises "not in progress" once one call wins — GamePage swallows that, so the
 * dispatcher just surfaces the message verbatim.
 */
export function makeRpcDispatcher<F extends string>(
  db: RpcClient<F>,
  fnName: F,
): (gameId: string) => Promise<RpcResult> {
  return async (gameId: string) => {
    const { error } = await db.rpc(fnName, { target_game: gameId })
    return error ? { error } : {}
  }
}

/** The standard start-game edge-function request body. Every board-builder
 *  (boggle / spellingbee / waffle) takes exactly these fields. */
export type StartGameBody = {
  target_club: string
  setup: unknown
  player_user_ids: string[]
  mode: 'coop' | 'compete'
}



