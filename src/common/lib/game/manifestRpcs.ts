/**
 * Shared manifest RPC dispatchers — the tiny, identical wrappers every game's
 * manifest hand-copied to turn a Supabase `db.rpc(...)` / edge-function invoke
 * into the `{ error?: string }` shape the GameManifest contract wants.
 *
 * These live here (not per-game) so the "collapse `{ data, error }` → `{ error?
 * }`" convention — and, more importantly, the *subtle* edge-function error
 * unwrap (see `invokeStartGameEdgeFn`) — exist exactly once.
 */

import { supabase } from '../supabase/supabase'

/** The manifest contract's dispatcher result: an optional error message. */
export type RpcResult = { error?: string }

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
  ) => PromiseLike<{ error: { message: string } | null }>
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
    return error ? { error: error.message } : {}
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

/**
 * Invoke a `<game>-build-board` edge function and normalize its result to the
 * manifest's `{ id } | { error }` union. Owns the **subtle** part that boggle,
 * spellingbee, and waffle each copied verbatim:
 *
 * `supabase.functions.invoke` reports a 4xx/5xx as its own generic
 * "Edge Function returned a non-2xx status code" message — the *real* server
 * error sits on `error.context`, a `Response` we can read **once**. So on error
 * we read `context.json()` and surface its `{ error }` field, falling back to
 * the generic message if the body isn't the JSON shape we expect. On success we
 * still guard the `{ id }` payload (a 200 with an `{ error }` body is possible).
 *
 * `brand` + `mode` only feed the last-resort "failed to start …" message.
 */
export async function invokeStartGameEdgeFn(
  fnName: string,
  body: StartGameBody,
  brand: string,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase.functions.invoke(fnName, { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    let serverMsg: string | null = null
    if (ctx) {
      try {
        const parsed = (await ctx.json()) as { error?: string }
        if (parsed && typeof parsed.error === 'string') serverMsg = parsed.error
      } catch {
        // body wasn't JSON; fall through to the generic message
      }
    }
    return { error: serverMsg ?? error.message }
  }
  const payload = data as { id?: string; error?: string } | null
  if (!payload || payload.error || !payload.id) {
    return { error: payload?.error ?? `failed to start ${brand} (${body.mode}) game` }
  }
  return { id: payload.id }
}
