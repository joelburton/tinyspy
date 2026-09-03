// cs-fixed-deep

import { supabase } from './supabase'
import type { DbError } from './dbEnvelope'
import { NO_ANSWER_TO_CODE_AND_TEXT, OUR_BUG_TO_CODE_AND_TEXT } from './dbEnvelope'

/**
 * **`runEdgeFn` calls this, and nothing else does** — `callSiteShape.test.ts`
 * holds that, since the export itself cannot say who it is for. It is the
 * transport half of that wrapper, split out because the digging below is worth
 * reading on its own.
 *
 * Hands back `{ data }` on a 2xx — validating that payload is the caller's job,
 * since the shape is per-function — or a CLASSIFIABLE `{ error }` in the same
 * shape a postgrest call resolves to, which `runEdgeFn` turns into an envelope.
 * **Nothing here words anything a player reads.**
 */
export async function edgeFnTransport(
  fnName: string,
  body: Record<string, unknown>,
): Promise<{ data: unknown; error: null } | { data: null; error: NonNullable<DbError> }> {
  // **A function that RAN answers 200 with an envelope**, faults included: the
  // status says whether it ran, the envelope says what it decided
  // (docs/envelopes.md → How edge functions build one). Where it calls an RPC it
  // relays that envelope untouched, so a sentence written in a SQL raise reaches
  // the player with its own words. That leaves a non-2xx meaning one thing —
  // the function never got as far as deciding — and everything below is working
  // out WHO answered instead.
  const { data, error } = await supabase.functions.invoke(fnName, { body })
  if (!error) return { data, error: null }

  // functions-js reports every 4xx/5xx as its own generic "Edge Function
  // returned a non-2xx status code" and hides the real one on `error.context`,
  // a Response whose body is readable exactly ONCE. Doing that read HERE, in one
  // place, is what keeps a hand-rolled `{ message }` at a call site from
  // throwing away the two facts classification needs: the `code` below, and
  // `answered` — reading a body is itself proof the server answered, and
  // without the marker a function's prose answer is indistinguishable from a
  // dead connection (`DbError` in dbEnvelope.ts). The HTTP status rides along
  // for the diagnostics line; it exists only on this path.
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
