// cs-fixed-deep

import { supabase } from './supabase'
import type { DbError } from './dbEnvelope'
import { NO_ANSWER_TO_CODE_AND_TEXT, OUR_BUG_TO_CODE_AND_TEXT } from './dbEnvelope'

/**
 * Invoke an edge function and hand back either its payload or a CLASSIFIABLE
 * error, normalized into the `{ data, error }` shape a postgrest call resolves
 * to. It is `runEdgeFn`'s transport adapter and nobody else's — the only place
 * FE code digs a server error out of a functions-js failure.
 *
 * ─── Why call sites must not do this themselves ───────────────
 * `supabase.functions.invoke` reports any 4xx/5xx as its own generic "Edge
 * Function returned a non-2xx status code"; the real server error rides on
 * `error.context`, a Response whose body is readable exactly ONCE. A call site
 * that hand-rolls that read ends up building a bare `{ message }` — which
 * throws away the two facts classification needs:
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
 * ─── What an edge function answers ────────────────────────────
 * **A function that RAN answers 200 with an envelope**, faults included: the
 * status says whether it ran, the envelope says what it decided
 * (docs/envelopes.md → How edge functions build one). Where it calls an RPC it
 * relays that envelope untouched, so a sentence written in a SQL raise reaches
 * the player with its own words.
 *
 * That leaves its own `error` channel meaning **one thing only: the RPC never
 * ran.** What this function digs out of a 4xx is that channel, and `runEdgeFn`
 * turns it into a fault — the right treatment for a shape no caller can read.
 *
 * Returns `{ data }` on 2xx — payload validation is the caller's, since shapes
 * are per-function — or `{ error }` for `runEdgeFn` to classify. **Nothing here
 * words anything a player reads.**
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
            // The function's own SQLSTATE when it relayed one. Without it, one
            // of ours refused and named nothing — which is a bug of its own
            // (every function answers 200 with an envelope), so it gets the
            // code for exactly that rather than traveling on codeless.
            code: typeof parsed.code === 'string'
              ? parsed.code
              : OUR_BUG_TO_CODE_AND_TEXT.edgeFnRefusedCodeless.code,
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
  // JSON, a relay's own error. Our function never spoke either way.
  //
  // **`status` separates the two**, and they are genuinely different failures:
  // a gateway 502 IS a reply and a dead socket is not. `0` is the no-reply
  // signal `nothingAnswered` reads, matching what postgrest-js sets for the
  // same case, so one predicate covers both transports.
  //
  // A reply that was not ours is `FE003` — the SAME answer the database path
  // gives it (`dbFetch` names it there, `situationFor` reads it back), so an
  // outage reads as an outage on either transport rather than as our bug. When
  // NOTHING replied there is no code to give: `FE001` vs `FE002` turns on
  // `navigator.onLine`, which `nothingReachedUs` asks at the moment it builds
  // the envelope.
  return {
    data: null,
    error: {
      message: error.message,
      ...(ctx ? { code: NO_ANSWER_TO_CODE_AND_TEXT.upstreamDown.code } : {}),
      status: ctx?.status ?? 0,
    },
  }
}
