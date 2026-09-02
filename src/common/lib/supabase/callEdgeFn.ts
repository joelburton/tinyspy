// cs-unmet

import { supabase } from './supabase'
import type { DbError } from './dbEnvelope'
import { OUR_BUG_TO_CODE_AND_TEXT } from './dbEnvelope'

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
 *     answer). See DbError in dbEnvelope.ts.
 *
 * ─── The contract with edge functions ─────────────────────────
 * Every function returns errors as `{ error: '<fe-error-key>', code? }` —
 * `key|detail1|detail2|` shapes, never player-facing prose (the fe-error-key
 * contract, docs/supabase.md → Server errors; guarded by edgeFnErrorKeys.test.ts).
 * So in the converted world a NON-key, UNANSWERED failure here can only be the
 * transport, which is what finally makes the transport wording honest — though
 * "the transport" is wider than "environmental", which means specifically that
 * no response object exists (docs/envelopes.md).
 *
 * Returns `{ data }` on 2xx (payload validation is the caller's — shapes are
 * per-function) or `{ error }` ready for `failureMessage` / `faultMessage` /
 * `failureText`, which own all wording per the caller's surface.
 */
export async function callEdgeFn(
  fnName: string,
  body: Record<string, unknown>,
): Promise<{ data: unknown; error: null } | { data: null; error: NonNullable<DbError> }> {
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
      // Not JSON. The RUNTIME answered, not the function — `Function not found`
      // in `text/plain`, or a container that will not boot. Ours either way: a
      // deploy failure, not a network one.
      //
      // This is decided here because here is where the Response is.
      // functions-js hands over the whole object as `error.context`, so the
      // content-type and the parse attempt are both in reach — which is not
      // true on the database path, where postgrest-js flattens a parsed body
      // and an unparseable one into the same `{ message }` shape.
      const bug = OUR_BUG_TO_CODE_AND_TEXT.runtimeNotFunction
      const contentType = ctx.headers.get('content-type') ?? 'none'
      return {
        data: null,
        error: {
          message: bug.text,
          code: bug.code,
          status: ctx.status,
          answered: true,
          details: `body was not JSON (content-type: ${contentType})`,
        },
      }
    }
  }
  // No response, or one that parsed but is not our function's shape — platform
  // JSON, a relay's own error. Codeless, because our function never spoke.
  //
  // **`status` separates the two**, and they are genuinely different failures:
  // a gateway 502 IS a reply and a dead socket is not. `0` is the no-reply
  // signal `nothingAnswered` reads, matching what postgrest-js sets for the
  // same case, so one predicate covers both transports.
  return { data: null, error: { message: error.message, code: '', status: ctx?.status ?? 0 } }
}
