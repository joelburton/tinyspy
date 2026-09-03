// cs-fixed-deep

/**
 * **CALLING AN RPC FROM DENO** — the inbound half of the envelope, the twin of
 * `src/common/lib/supabase/dbResult.ts`'s `runRpc`.
 *
 * The app has four call directions, and this file is the fourth's caller:
 *
 *   | FE → RPC              | `runRpc`    (src/common/lib/supabase/dbResult.ts) |
 *   | FE → table read       | `readRows`  (same file)                           |
 *   | FE → edge function    | `runEdgeFn` (same file)                           |
 *   | edge function → RPC   | HERE                                              |
 *
 * `envelope.ts` beside this holds the builders for the answer a function
 * **sends**; this is the answer it **receives**. Without it every function
 * hand-writes the same three steps, and a boundary written thirteen times is a
 * boundary spelled thirteen ways.
 *
 * **Why this is a second implementation and not an import.** The frontend's
 * `dbResult.ts` reaches into `dbFetch`, the fault-modal store and browser
 * globals; Deno cannot have any of it, and would not want it — an edge function
 * has no surface to present a fault ON. It answers by returning an envelope,
 * which its caller's `runEdgeFn` then presents. So what crosses the runtime
 * boundary is the `Envelope` TYPE and nothing else, exactly as `envelope.ts`
 * explains for the outbound half.
 *
 * **What it does NOT cover, deliberately.** The row-returning helper RPCs the
 * board builders call — `candidate_words`, `pick_seed`, `matching_words` and
 * the rest — keep calling `supabase.rpc(...)` directly and keep signalling
 * failure by `throw`, which the handler's `crash(FN, e)` turns into a fault at
 * the edge. Those calls sit inside pure helpers rather than the request
 * handler, they have no refusal to relay and no player sentence, and giving
 * them envelopes would push branching into every board builder to gain nothing
 * (docs/envelopes.md → How edge functions RECEIVE one). A `readRows` twin earns
 * its place the day one of them needs to relay a refusal.
 */

import { faultEnvelope, isEnvelope } from './envelope.ts'
import type { Envelope } from '../../../src/common/lib/supabase/envelope.ts'

/** What supabase-js hands back from `.rpc(...)`, narrowed to what we read. */
type RpcReply = {
  data: unknown
  error: { message: string; code?: string } | null
}

/**
 * **Run an RPC that answers in an envelope, and hand the envelope back.**
 *
 * The call site constructs the call, exactly as on the frontend, and gets a
 * checked `Envelope<T>` — never a raw body:
 *
 *     const res = await runRpc<ClueContext>(
 *       db.schema('codenamesduet').rpc('get_clue_context', { target_game }),
 *       'get_clue_context',
 *     )
 *     if (res.type === 'not-ok') return json(res)   // relay the refusal
 *     const ctx = res.data                          // carry on
 *
 * That one `not-ok` branch covers three different failures — the RPC's own
 * refusal, a transport failure, an unreadable answer — which is the point of
 * handing back an envelope rather than a `Response`: the call site does not
 * have to know which happened to do the right thing with it.
 *
 * **Relay or unwrap is the call site's choice**, and it is one line either way.
 * `startGame` relays the whole envelope because `create_game`'s answer IS its
 * answer; `codenamesduet-suggest-clue` unwraps the `ok` because the board it
 * carries is only the first step of the work. Two wrapper variants would have
 * been one variant too many.
 *
 * `rpcName` is a parameter rather than dug off the query builder (which is what
 * the frontend's `callLabel` does, defensively, because postgrest-js marks
 * `url` and `method` protected). Here the name is known at every call site, and
 * a parameter cannot go stale when a library renames a field.
 */
export async function runRpc<T>(call: PromiseLike<RpcReply>, rpcName: string): Promise<Envelope<T>> {
  const started = Date.now()
  // No try/catch: postgrest-js turns a rejected fetch into `{ error }` before
  // it reaches us, and anything that still throws is a genuine crash the
  // handler's `crash(FN, e)` should report as one. Swallowing it here would
  // turn a stack trace into a sentence.
  const settled = await call
  const ms = Date.now() - started

  if (settled.error) {
    // NOTHING RAN. Not a refusal — a refusal arrives as a 200 carrying an
    // envelope — but a revoked grant, an unreachable PostgREST, a signature
    // that no longer matches. The RPC's name rides in the message because the
    // fault modal shows it and "which call" is the first thing anyone asks.
    return faultEnvelope(
      'PN117',
      `BUG: ${rpcName} did not run`,
      `${rpcName}: ${settled.error.message} (${settled.error.code ?? 'no code'})`,
    )
  }

  if (!isEnvelope(settled.data)) {
    // A converted RPC always answers with one, so anything else means this
    // function is calling a version of it that predates the envelope — a
    // half-finished deploy, or a conversion that reached the Deno half first.
    // A fault rather than a fall-through, deliberately: reading a non-envelope
    // as the payload is how a stale deploy becomes a puzzling bug instead of a
    // clear one.
    return faultEnvelope(
      'PN118',
      `BUG: ${rpcName} returned no envelope`,
      `${rpcName}: returned ${JSON.stringify(settled.data)?.slice(0, 200)}`,
    )
  }

  // `settled.data` is an `Envelope` by the guard above; the cast only adds the
  // caller's `T`, which no runtime check can establish.
  const envelope = settled.data as Envelope<T>
  // One line per call, the Deno counterpart of the frontend's `[db]` line. An
  // edge function's console is the only place its half of a request is
  // visible, so every call says something rather than leaving it to taste.
  console.log(
    `[rpc] ${rpcName} ${envelope.type} ${ms}ms`
    + (envelope.type === 'not-ok' ? ` ${envelope.severity} ${envelope.dbcode}` : ''),
  )
  return envelope
}
