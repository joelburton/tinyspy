/**
 * Shared manifest RPC dispatchers — the tiny, identical wrappers every game's
 * manifest hand-copied to turn a Supabase `db.rpc(...)` / edge-function invoke
 * into the `{ error?: string }` shape the GameManifest contract wants.
 *
 * These live here (not per-game) so the "collapse `{ data, error }` → `{ error?
 * }`" convention — and, more importantly, the *subtle* edge-function error
 * unwrap (see `invokeStartGameEdgeFn`) — exist exactly once.
 */

/** The manifest contract's dispatcher result: an optional error message. */
export type RpcResult = { error?: string }

/**
 * A minimal structural view of a schema-scoped Supabase client's `.rpc`, narrow
 * enough that any game's `db` (`supabase.schema('<game>')`) satisfies it. The
 * game passes its concrete, fully-typed `db`; we only need the `{ error }` off
 * the awaited result.
 */
type TimeoutRpc = 'submit_timeout' | 'end_game'
type RpcClient = {
  rpc: (
    fn: TimeoutRpc,
    args: { target_game: string },
  ) => PromiseLike<{ error: { message: string } | null }>
}

/**
 * Build the game-agnostic `(gameId) => Promise<{ error? }>` dispatcher for a
 * per-game, single-`target_game`-arg RPC. Collapses the 14 byte-identical
 * `submitTimeout` / `endGame` wrappers across the seven turn/timeout games:
 *
 *     const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
 *     const endGame       = makeRpcDispatcher(db, 'end_game')
 *
 * `submit_timeout` is fired by every connected client on countdown expiry and
 * raises "not in progress" once one call wins — GamePage swallows that, so the
 * dispatcher just surfaces the message verbatim.
 */
export function makeRpcDispatcher(
  db: RpcClient,
  fnName: TimeoutRpc,
): (gameId: string) => Promise<RpcResult> {
  return async (gameId: string) => {
    const { error } = await db.rpc(fnName, { target_game: gameId })
    return error ? { error: error.message } : {}
  }
}
