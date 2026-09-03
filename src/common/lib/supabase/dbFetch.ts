// cs-fixed-deep

import {
  NO_ANSWER_TO_CODE_AND_TEXT, type DbError,
} from './dbEnvelope'
import { logDb, logSlow } from './dbLog'

/**
 * The `fetch` every Supabase call goes through — the ONE place a request that
 * never reached the server is noticed.
 *
 * ─── Why this exists ─────────────────────────────────────────
 * A rejected `fetch` leaves no trace of its own. postgrest-js turns the
 * rejection into `{ message: "TypeError: Load failed", code: "", status: 0 }`
 * (Safari's wording for any failed request), which is nothing a call site can
 * act on and nothing anyone can debug from: the browser deliberately collapses
 * DNS failure, refused connection, TLS error and dead socket into one opaque
 * TypeError with no code and no cause. A report of "it said TypeError on my
 * phone" had no console record to read even with Web Inspector attached.
 *
 * That `status: 0` is the one useful thing in it, and it is load-bearing now:
 * postgrest-js sets it on this path and only this path, so it is how every
 * wrapper downstream recognizes the same failure (`nothingAnswered`).
 *
 * The facts that DO distinguish those cases are ambient rather than in the
 * error, so this is where they get captured — see `getTextualOnlineStatus()`.
 *
 * One function covers everything the client does — PostgREST, edge functions,
 * auth — because they all share this fetch.
 *
 * ─── What it does NOT do ─────────────────────────────────────
 * **It does not touch the error.** What callers receive is re-thrown exactly as
 * it arrived — editing it here would make this a second author of player copy,
 * in the layer furthest from the player.
 *
 * It does not word the modal either. What it decides — WHO answered — rides
 * out as an `FE` code in `statusText`, and the wrapper holding the answer turns
 * that into the sentence and the modal through the one builder in
 * `dbEnvelope`, precisely so the log and the modal cannot disagree about one
 * event.
 *
 * No retry either. These are mutations (`submit_word`, `concede`, `end_game`);
 * a silent second attempt is worse than a clear message. The player decides.
 *
 * ─── Why it THROWS rather than answering with an envelope ────
 * The obvious idea, on finding that the wrappers were re-deriving a worse
 * envelope than the one built here: stop throwing, and return this envelope as
 * a normal 200 JSON body — the contract the server already follows. Every
 * wrapper's failure handling would collapse to "if the body is an envelope,
 * return it unchanged."
 *
 * It would have worked. Auth is fenced off by `isSupabaseInternal`, so
 * supabase-js's own token refresh would never see the synthetic response, and
 * the objection is not risk.
 *
 * **It was rejected because it buys nothing.** The wrappers already have every
 * fact they need — `status === 0` says nothing answered, `navigator.onLine`
 * says which sentence — so inverting a standard contract hands them information
 * they can read for themselves, at the price of every future reader (and every
 * future direct-`fetch` consumer) having to learn that this `fetch` sometimes
 * resolves for a request that never happened. Calling the same builder from
 * both places was the smaller answer, and it is what is here.
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
 *  Duration is NOT here — `ms` is a field of its own (instant reject = a dead
 *  connection, 30s+ = a timeout on a live one: same message, different bug). */
function getTextualOnlineStatus(): string {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
  return `online=${online}${hidden ? ' hidden' : ''}`
}


/** The request's identity, with no credentials in it. A Supabase URL carries
 *  the apikey and often a JWT in the query string, and console output gets
 *  screenshotted into chat — so only the method and path are logged. */
function getMethodPathClean(input: RequestInfo | URL, init?: RequestInit): string {
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
 * a storage call if we ever add one, or a URL we could not parse. That is the
 * conservative default — no modal for a call we cannot identify.
 */
function isSupabaseInternal(input: RequestInfo | URL, init?: RequestInit): boolean {
  const path = getMethodPathClean(input, init).split(' ')[1] ?? ''
  return !(path.startsWith('/rest/v1/') || path.startsWith('/functions/v1/'))
}



/**
 * `fetch` with a `[db]` console trail, and **where a failure is classified** —
 * never presented (docs/envelopes.md → Presenting a fault is not a call site's
 * job).
 *
 * ─── Why classification lives here, and presentation does not ──
 * This is the one place every Supabase call passes through, and the only layer
 * that can see whether the body parsed — so it is where "who answered" is
 * decided. But all it knows is the URL, and a modal is decided per ANSWER: one
 * call can want quiet for a dropped network and a modal for a signed-out
 * player. So the wrapper holding the answer presents; this layer hands it the
 * verdict in `statusText` and logs only what nothing else will.
 */
export const dbFetch: typeof fetch = async (input, init) => {
  const started = performance.now()
  // The fetch's two outcomes, held rather than branched on, so the duration and
  // the call label below are computed once for both.
  let res: Response | null = null
  let thrown: unknown = null
  try {
    res = await fetch(input, init)
  } catch (err) {
    thrown = err
  }
  const ms = Math.round(performance.now() - started)
  const call = getMethodPathClean(input, init)

  // EVERY path from here writes exactly one `[db]` line and then returns or
  // throws. Each case is a guard that narrates and leaves, so the cases read in
  // order and none of them can fall into the next.

  // ─── NOTHING ANSWERED ────────────────────────────────────────
  // The exceptional case, and the only one that throws, so it goes first: what
  // follows can then treat `res` as a Response rather than a maybe.
  //
  // Read name/message off the THROWN VALUE rather than narrowing with
  // `instanceof Error`: an abort arrives as a DOMException, which does not
  // reliably satisfy that check, and converting it to a fresh Error would drop
  // the very name the abort test below needs.
  if (!res) {
    const raw = thrown as { name?: string; message?: string } | null
    const name = raw?.name ?? 'Error'
    const message = raw?.message ?? String(thrown)
    // The thrown error IS the detail here — there is no server-supplied one to
    // compete with it — and `status` stays blank because nothing answered.
    const fields = { call, ms, detail: `${name}: ${message} ${getTextualOnlineStatus()}` }

    // Only what nothing else will speak for — the same rule as the `OK` line
    // below. An abort is us canceling ourselves; auth has no wrapper. A failure
    // on OUR endpoints reaches a wrapper, which writes the better line: it
    // knows the severity, the code and the outcome, and this layer knows only
    // that a request did not come back.
    if (name === 'AbortError' || isSupabaseInternal(input, init)) logDb('FAULT', fields)

    // Re-thrown UNTOUCHED. The error object itself is never reworded here —
    // this function classifies and logs; it does not edit what callers receive.
    throw thrown
  }

  const fields = { call, status: res.status, ms, detail: getTextualOnlineStatus() }

  // ─── IT WORKED ───────────────────────────────────────────────
  if (res.ok) {
    // A slow SUCCESS is the same clue about a flaky link that a failure is, so
    // it is the one success worth raising to `warn` — and worth saying even
    // about a call something else will speak for. Its line says how long the
    // call took and nothing about what came back, because the body has not
    // been read.
    if (ms > SLOW_MS) {
      logSlow({ call, ms, detail: getTextualOnlineStatus() })
      return res
    }
    // **This narrates only what nothing else will.** A 2xx says the request
    // arrived and nothing about what came back, and for every call reaching OUR
    // endpoints there is a wrapper that reads the answer and logs what it MEANT
    // — `runRpc`, `runEdgeFn`, `readRows`. A line here as well would put a bare
    // `OK` directly above one that may contradict it.
    //
    // So what is left is Supabase's own endpoints: auth, and anything
    // unrecognized. No wrapper will ever see those, and this is their only line.
    // (A call to OUR endpoints made without a wrapper would leave no line on
    // success — one more reason every such call goes through one.)
    if (isSupabaseInternal(input, init)) logDb('OK', fields)
    return res
  }

  // ─── IT ANSWERED, WITH A FAILURE ─────────────────────────────
  // Supabase's own endpoints have no wrapper downstream, so this line is the
  // whole record of them.
  if (isSupabaseInternal(input, init)) {
    logDb('FAULT', fields)
    return res
  }

  // A non-2xx from PostgREST is Postgres's own error shape — a RAW FAULT, by
  // definition something nobody wrote a line of SQL for.
  //
  // A PA/PN code HERE is a third thing, and always a bug of ours: our own codes
  // are meant to arrive HTTP 200 inside an envelope, so one in the raw shape
  // means the RPC that raised it has no handler to catch it. The line says so
  // by carrying one of our codes beside a 4xx status, which no correctly-handled
  // call can produce.
  //
  // The body is read as TEXT, once, and re-emitted below — `json()` would
  // consume the stream the caller still needs, and a `clone()` cannot be
  // annotated.
  const text = await res.text()
  let body: DbError = null
  let parsed = true
  try {
    body = JSON.parse(text) as DbError
  } catch {
    // Only WHETHER it parsed is kept. The body itself is the better record and
    // already travels: postgrest-js puts an unparseable one on the error's own
    // `message`, which the wrapper writes to the `[db]` line as `detail`.
    parsed = false
  }

  // ─── WHO answered ────────────────────────────────────────────
  // Two things to go fix, and this is the only layer that can tell them apart:
  // postgrest-js flattens a parsed body and an unparseable one into the same
  // `{ message: string }` before a wrapper sees either.
  //
  // `null` means there is nothing for this layer to add — Postgres named itself
  // with a SQLSTATE, and the wrapper reads that straight off the error.
  const verdict =
    body?.code ? null
    // It PARSED but carried no SQLSTATE — Kong's own `{"message":"no Route
    // matched…"}`, or any platform layer answering for us. Our gateway is up
    // and the thing behind it is not.
    : parsed ? NO_ANSWER_TO_CODE_AND_TEXT.upstreamDown
    // An unparseable body. PostgREST ALWAYS speaks JSON, so something that is
    // not PostgREST answered: a captive portal, a proxy, an ISP error page.
    // (An edge function's unparseable body means something else — the runtime
    // answering instead of the function — but `callEdgeFn` holds the Response
    // and decides that for itself.)
    : NO_ANSWER_TO_CODE_AND_TEXT.foreignResponder

  // **The verdict rides in `statusText`.** It is the one field that survives
  // postgrest-js untouched, and the wrapper reads it to build the envelope a
  // call site will see — so the modal and the log say the same thing without
  // this layer presenting anything.
  //
  // Reconstructing rather than mutating, because `Response.statusText` is
  // read-only. Everything either library touches is preserved: `ok` and `status`
  // (derived from the status), `text()`, and the headers.
  return new Response(text, {
    status: res.status,
    statusText: verdict ? verdict.code : res.statusText,
    headers: res.headers,
  })
}
