import { supabase } from './supabase'
import type { CallError } from '../game/serverError'

/**
 * Invoke an edge function and hand back either its payload or a CLASSIFIABLE
 * error — the edge-function sibling of `callRpc`, and the only place FE code
 * is allowed to dig a server error out of a functions-js failure.
 *
 * ─── Why call sites must not do this themselves ───────────────
 * `supabase.functions.invoke` reports any 4xx/5xx as its own generic "Edge
 * Function returned a non-2xx status code"; the real server error rides on
 * `error.context`, a Response whose body is readable exactly ONCE. Five call
 * sites used to each hand-roll that read and then build a bare `{ message }`
 * — which threw away the two facts classification needs:
 *
 *   - **`code`**: the SQLSTATE. Edge functions that relay a DB error now
 *     return it beside the message (`{ error, code }`), restoring what
 *     functions-js strips — a relayed raise classifies exactly like a direct
 *     RPC failure.
 *   - **`answered`**: reading the body IS proof the server answered. Without
 *     the marker, a function's prose answer is indistinguishable from a dead
 *     connection and misfiles as transport ("Server; try refresh" over a real
 *     answer). See CallError in serverError.ts.
 *
 * ─── The contract with edge functions ─────────────────────────
 * Every function returns errors as `{ error: '<fe-error-key>', code? }` —
 * `key|detail1|detail2|` shapes, never player-facing prose (the fe-error-key
 * contract, docs/supabase.md → Server errors; guarded by edgeFnErrorKeys.test.ts).
 * So in the converted world a NON-key, UNANSWERED failure here can only be
 * environmental, which is what finally makes the transport wording honest.
 *
 * Returns `{ data }` on 2xx (payload validation is the caller's — shapes are
 * per-function) or `{ error }` ready for `failureMessage` / `faultMessage` /
 * `failureText`, which own all wording per the caller's surface.
 */
export async function callEdgeFn(
  fnName: string,
  body: Record<string, unknown>,
): Promise<{ data: unknown; error: null } | { data: null; error: NonNullable<CallError> }> {
  const { data, error } = await supabase.functions.invoke(fnName, { body })
  if (!error) return { data, error: null }

  // A body that parses as OUR `{ error }` shape is proof our function
  // answered; read it once. The HTTP status rides along for the diagnostics
  // line (the fault modal + the [db] log) — it exists only on this path.
  const ctx = (error as { context?: Response }).context
  if (ctx) {
    try {
      const parsed = (await ctx.json()) as { error?: string; code?: string } | null
      if (parsed && typeof parsed.error === 'string') {
        return {
          data: null,
          error: {
            message: parsed.error,
            ...(typeof parsed.code === 'string' ? { code: parsed.code } : {}),
            status: ctx.status,
            answered: true,
          },
        }
      }
    } catch {
      // Body wasn't JSON — fall through.
    }
  }
  // No response, or a response that isn't our function speaking (a gateway
  // 502's HTML, platform JSON) — either way the FUNCTION never answered, so
  // this is environmental: codeless and unanswered, classifyFailure files it
  // as transport and the player gets the translated advice line.
  return { data: null, error: { message: error.message, code: '' } }
}
