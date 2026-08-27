// cs-unmet

import { logStamp } from './realtimeDiag'
import { isOurCode, presentDbFault, type DbError } from './dbResult'

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
 * One seam covers everything the client does — PostgREST, edge functions,
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


/** Everything about the moment a request failed, past the error itself. Each
 *  field answers a question the raw message can't:
 *    - `ms`      instant reject = a dead connection; 30s+ = a timeout on a live
 *                one. Completely different problems, same message.
 *    - `online`  false ends the investigation — the device knew it was offline.
 *    - `hidden`  a request issued while the tab is backgrounded is the iOS
 *                suspend case, where the connection dies under us.
 */
function context(ms: number): string {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
  return `${Math.round(ms)}ms online=${online}${hidden ? ' hidden' : ''}`
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
 * Is this a path the fault seam speaks for?
 *
 * PostgREST and edge functions, yes — those are the calls the new server-result
 * system covers. **Auth is deliberately excluded**: a 400 from `/auth/v1/` is
 * usually a user-facing condition the sign-in screen already handles (an
 * expired link, a bad OTP), and turning those into blocking fault modals would
 * be wrong. Auth keeps the plain log line it has always had.
 */
function seamSpeaksFor(input: RequestInfo | URL, init?: RequestInit): boolean {
  const path = label(input, init).split(' ')[1] ?? ''
  return path.startsWith('/rest/v1/') || path.startsWith('/functions/v1/')
}

/**
 * `fetch` with a `[db]` console trail, and **the seam where faults are
 * presented** (plans/error-system.md → "Faults and environmental failures are
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
  try {
    const res = await fetch(input, init)
    const ms = performance.now() - started
    // A failing STATUS is the server answering, so it isn't this module's
    // subject — but it is worth a line, because "the RPC said no" and "the RPC
    // never arrived" are the two halves of the same investigation.
    if (!res.ok) {
      console.warn(`[db] ${logStamp()} ${label(input, init)} → ${res.status} (${context(ms)})`)
      // A non-2xx from PostgREST is Postgres's own error shape — a RAW FAULT,
      // by definition something nobody wrote a line of SQL for. Our own
      // declared outcomes are not here: they come back 200 with an envelope.
      // `clone()` so the caller's stream is untouched.
      if (seamSpeaksFor(input, init)) {
        try {
          const body = (await res.clone().json()) as DbError
          if (!isOurCode(body?.code)) {
            presentDbFault({ where: label(input, init), kind: 'raw', error: body, extra: { status: res.status } })
          }
        } catch {
          // A non-JSON error body is itself the anomaly; the warn line above
          // already carries the status, and there is nothing to classify.
        }
      }
    } else if (ms > SLOW_MS) {
      console.warn(`[db] ${logStamp()} ${label(input, init)} slow (${context(ms)})`)
    } else {
      // Every successful call gets a line, at `debug` so it never drowns the
      // warns and errors. The browser's own level filter is the volume control
      // — no verbose flag of ours. The BODY is deliberately not parsed here:
      // until RPCs return envelopes there is nothing in it worth the cost.
      console.debug(`[db] ${logStamp()} ${label(input, init)} → ${res.status} (${context(ms)})`)
    }
    return res
  } catch (err) {
    const ms = performance.now() - started
    // Read name/message off the THROWN VALUE rather than narrowing with
    // `instanceof Error`: an abort arrives as a DOMException, which does not
    // reliably satisfy that check, and converting it to a fresh Error would
    // drop the very name the abort branch below tests for. Anything without a
    // name is treated as an ordinary failure.
    const raw = err as { name?: string; message?: string; code?: string } | null
    const name = raw?.name ?? 'Error'
    const message = raw?.message ?? String(err)
    console.error(`[db] ${logStamp()} ${label(input, init)} FAILED: ${name}: ${message} (${context(ms)})`)

    // ENVIRONMENTAL: the request never completed, so the server never spoke and
    // no author could have written for this. The seam owns the sentence, which
    // is why no call site needs an `if` for "did we hear back at all?".
    //
    // An abort is NOT one of these — it is us cancelling our own request (a
    // component unmounting, a superseded fetch), so nobody is owed a modal.
    if (name !== 'AbortError' && seamSpeaksFor(input, init)) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      presentDbFault({
        where: label(input, init),
        kind: offline ? 'offline' : 'unreachable',
        extra: { ms: Math.round(ms), thrown: `${name}: ${message}` },
      })
    }

    // Re-throw UNTOUCHED. The error object itself is never reworded here —
    // this function presents and logs; it does not edit what callers receive.
    throw err
  }
}
