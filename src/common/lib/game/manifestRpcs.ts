/**
 * Shared manifest RPC dispatchers — the tiny, identical wrappers every game's
 * manifest hand-copied to turn a Supabase `db.rpc(...)` / edge-function invoke
 * into the `{ error?: string }` shape the GameManifest contract wants.
 *
 * These live here (not per-game) so the "collapse `{ data, error }` → `{ error?
 * }`" convention — and, more importantly, the *subtle* edge-function error
 * unwrap (see `invokeStartGameEdgeFn`) — exist exactly once.
 */

import { callEdgeFn } from '../supabase/callEdgeFn'
import type { CallError } from './serverError'

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

/**
 * Invoke a `<game>-build-board` edge function and normalize its result to the
 * manifest's `{ id } | { error }` union. The invoke + read-once error unwrap
 * live in `callEdgeFn`, which returns a CLASSIFIABLE CallError — carrying the
 * relayed SQLSTATE (`code`) and the "the function answered" marker — so every
 * consumer routes it through the classifier instead of stringifying it. On
 * success we still guard the `{ id }` payload here (a 200 with an `{ error }`
 * body is possible).
 *
 * `brand` + `mode` only feed the last-resort "failed to start …" message.
 */
export async function invokeStartGameEdgeFn(
  fnName: string,
  body: StartGameBody,
  brand: string,
): Promise<{ id: string } | { error: NonNullable<CallError> }> {
  const res = await callEdgeFn(fnName, body)
  if (res.error) return { error: res.error }
  const payload = res.data as { id?: string; error?: string; code?: string } | null
  if (!payload || payload.error || !payload.id) {
    // A 2xx that isn't the success shape. The function answered — so this is
    // never transport — carrying its own words or the last-resort description.
    return {
      error: {
        message: payload?.error ?? `failed to start ${brand} (${body.mode}) game`,
        ...(payload?.code ? { code: payload.code } : {}),
        answered: true,
      },
    }
  }
  return { id: payload.id }
}
