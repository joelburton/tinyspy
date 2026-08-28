// cs-unmet

import {
  environmentalEnvelope, faultEnvelope, logDb, logSlow, reportDbFault, type DbError,
} from './dbResult'

/**
 * The `fetch` every Supabase call goes through — the ONE place a request that
 * never reached the server is noticed.
 *
 * ─── Why this exists ─────────────────────────────────────────
 * A rejected `fetch` used to leave NO trace anywhere. postgrest-js turns the
 * rejection into `{ message: "TypeError: Load failed", code: "", status: 0 }`
 * (Safari's wording for any failed request), and the 47 sites that render an
 * error just render and return — nothing is logged. So a report of "it said
 * TypeError on my phone" had no console record to read even with Web Inspector
 * attached, and the message itself carries nothing: the browser deliberately
 * collapses DNS failure, refused connection, TLS error and dead socket into one
 * opaque TypeError with no code and no cause.
 *
 * The facts that DO distinguish those cases are ambient rather than in the
 * error, so this is where they get captured — see `context()`.
 *
 * One function covers everything the client does — PostgREST, edge functions,
 * auth — because they all share this fetch.
 *
 * ─── What it does NOT do ─────────────────────────────────────
 * **It does not touch the error.** Rewording belongs to the frontend, which
 * owns every player-facing string; editing the message here would make this a
 * second author of player copy, in the layer furthest from the player.
 *
 * No retry either. These are mutations (`submit_word`, `concede`, `end_game`);
 * a silent second attempt is worse than a clear message. The player decides.
 */

/** How long a request may run before we count it slow enough to narrate. A
 *  request that eventually FAILS is logged whatever its duration; this is only
 *  the bar for mentioning one that succeeded, since a 4-second success is a
 *  clue about the same flaky link. */
const SLOW_MS = 4000


/** The device's own state at the moment of the call, which answers questions
 *  the error message can't:
 *    - `online`  false ends the investigation — the device knew it was offline.
 *    - `hidden`  a request issued while the tab is backgrounded is the iOS
 *                suspend case, where the connection dies under us.
 *  Duration is NOT here: `ms` is a field of its own now (instant reject = a dead
 *  connection, 30s+ = a timeout on a live one — same message, different bug). */
function context(): string {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
  return `online=${online}${hidden ? ' hidden' : ''}`
}

/** The request's identity, with no credentials in it. A Supabase URL carries
 *  the apikey and often a JWT in the query string, and console output gets
 *  screenshotted into chat — so only the method and path are logged. */
function label(input: RequestInfo | URL, init?: RequestInit): string {
  const raw =
    typeof input === 'string' ? input
      : input instanceof URL ? input.toString()
        : input.url
  let path = raw
  try {
    path = new URL(raw, typeof location !== 'undefined' ? location.href : undefined).pathname
  } catch {
    // A malformed URL is itself worth seeing; fall through with the raw string.
  }
  const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')
  return `${method} ${path}`
}

/**
 * Is this one of SUPABASE'S OWN endpoints, rather than ours?
 *
 * Everything here is Supabase, so the line is not the vendor — it is whose
 * semantics are on the other end. `/rest/v1/` and `/functions/v1/` reach OUR
 * schema and OUR code, and their failures are the server-result system's
 * subject. `/auth/v1/` is the platform's own service: a 400 there is usually a
 * user-facing condition the sign-in screen already handles (an expired link, a
 * bad OTP), and turning those into blocking fault modals would be wrong.
 *
 * **A failure here is logged but never presented** — it gets its `[db]` line
 * and no modal.
 *
 * It is the complement of an allowlist, so anything unrecognized is `true` too:
 * a storage call if we ever add one, or a URL `label()` could not parse. That
 * is the conservative default — no modal for a call we cannot identify.
 */
function isSupabaseInternal(input: RequestInfo | URL, init?: RequestInit): boolean {
  const path = label(input, init).split(' ')[1] ?? ''
  return !(path.startsWith('/rest/v1/') || path.startsWith('/functions/v1/'))
}

/** Is this a call to an RPC — the one shape whose 2xx body carries an answer
 *  that something downstream (`runRpc`) reads and logs for itself? */
function isRpc(input: RequestInfo | URL, init?: RequestInit): boolean {
  return (label(input, init).split(' ')[1] ?? '').startsWith('/rest/v1/rpc/')
}

/**
 * `fetch` with a `[db]` console trail, and **where faults are presented** (plans/error-system.md → "Faults and environmental failures are
 * presented centrally").
 *
 * The tag is its own channel, beside `[rt]` (realtime) and `[ui]` (the browser
 * snapshot + play-surface lifecycle) — a failed request is neither of those.
 * Filtering the console to `[db]` gives the request path on its own.
 *
 * ─── Why presentation lives here ─────────────────────────────
 * This is the one place every Supabase call passes through, so it is the only
 * place a rule like "a player never has to be told twice, and a call site never
 * has to word a network failure" can be enforced rather than remembered. What
 * reaches a call site is then only the outcomes it has an opinion about.
 */
export const dbFetch: typeof fetch = async (input, init) => {
  const started = performance.now()
  // The fetch's two outcomes, held rather than branched on, so the narration
  // below is one flat sequence instead of a success arm and a catch arm that
  // each have to remember to log.
  let res: Response | null = null
  let thrown: unknown = null
  try {
    res = await fetch(input, init)
  } catch (err) {
    thrown = err
  }
  const ms = Math.round(performance.now() - started)
  const call = label(input, init)

  // EVERY path through this block writes exactly one `[db]` line and then leaves
  // by the bottom, where the result is returned or the error re-thrown. The
  // label is what buys that: each case is a guard that narrates and breaks, so
  // the cases read in order and none of them can fall into the next.
  narrate: {
    if (!res) {
      // Nothing answered. Read name/message off the THROWN VALUE rather than
      // narrowing with `instanceof Error`: an abort arrives as a DOMException,
      // which does not reliably satisfy that check, and converting it to a fresh
      // Error would drop the very name the abort test below needs.
      const raw = thrown as { name?: string; message?: string } | null
      const name = raw?.name ?? 'Error'
      const message = raw?.message ?? String(thrown)
      // The thrown error IS the detail here — there is no server-supplied one to
      // compete with it — and `status` stays blank because nothing answered.
      const fields = { call, ms, detail: `${name}: ${message} ${context()}` }

      // An ABORT is not an environmental failure: it is us canceling our own
      // request (a component unmounting, a superseded fetch), so nobody is owed
      // a modal. It still gets a line — an abort storm is worth seeing. Neither
      // is a call to Supabase's own endpoints, which the sign-in screen owns.
      if (name === 'AbortError' || isSupabaseInternal(input, init)) {
        logDb('FAULT', fields)
        break narrate
      }

      // ENVIRONMENTAL: the server never spoke, so no author could have written
      // for this. This function owns the sentence, which is why no call site needs an
      // `if` for "did we hear back at all?".
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      reportDbFault(fields, { ...environmentalEnvelope(offline), detail: fields.detail })
      break narrate
    }

    const fields = { call, status: res.status, ms, detail: context() }

    if (res.ok) {
      // A slow SUCCESS is the same clue about a flaky link that a failure is, so
      // it is the one success worth raising to `warn` — and worth saying even
      // about a call something else will speak for.
      if (ms > SLOW_MS) {
        // The request's own line: it says how long the call took, and nothing
        // about what came back, because the body has not been read.
        logSlow({ call, ms, detail: context() })
        break narrate
      }
      // An RPC's 2xx says only that the request arrived; the answer inside it is
      // `runRpc`'s to read and to log, and it may well be a fault. Saying `OK`
      // here would put a line claiming success directly above one contradicting
      // it, so this function stays quiet and lets the layer that knows speak.
      //
      // The cost, until the conversion finishes: an RPC called WITHOUT `runRpc`
      // — the raw `db.rpc()` sites — logs nothing on success.
      //
      // A read has no such layer, so its line is this one. The body is not
      // parsed for it: rows are not worth the cost, and there is no envelope.
      if (!isRpc(input, init)) logDb('OK', fields)
      break narrate
    }

    // Supabase's own endpoints are never presented, so nothing downstream will
    // report this one. The line is the whole record of it.
    if (isSupabaseInternal(input, init)) {
      logDb('FAULT', fields)
      break narrate
    }

    // A non-2xx from PostgREST is Postgres's own error shape — a RAW FAULT, by
    // definition something nobody wrote a line of SQL for. `clone()` so the
    // caller's stream is untouched.
    //
    // A PA/PN code HERE is a third thing, and always a bug of ours: our own
    // codes are meant to arrive HTTP 200 inside an envelope, so one in the raw
    // shape means the RPC that raised it has no handler to catch it — during the
    // conversion, an unconverted RPC calling a converted helper. The line says
    // so by carrying one of our codes beside a 4xx status, which no
    // correctly-handled call can produce.
    //
    // Parse if we can, present either way. A body that ISN'T JSON — a gateway's
    // HTML error page, an empty response — leaves us with no code and no
    // message, but it is the failure most worth showing: a Kong 502 on a
    // PostgREST call means the stack is broken, not that a move was refused.
    // The fields we do have (the call, the status, the time) are the ones the
    // modal needs, and `faultEnvelope(null, …)` is that shape.
    let body: DbError = null
    try {
      body = (await res.clone().json()) as DbError
    } catch {
      // Deliberately empty: `body` stays null and the report below carries the
      // fallback sentence.
    }
    reportDbFault(fields, faultEnvelope(body, 'The server refused the request.'))
  }

  // Re-thrown UNTOUCHED. The error object itself is never reworded here — this
  // function presents and logs; it does not edit what callers receive.
  if (!res) throw thrown
  return res
}
