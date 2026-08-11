import { logStamp } from './realtimeDiag'

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
 * `fetch` with a `[db]` console trail on failure.
 *
 * The tag is its own channel, beside `[rt]` (realtime) and `[ui]` (the browser
 * snapshot + play-surface lifecycle) — a failed request is neither of those.
 * Filtering the console to `[db]` gives the request path on its own.
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
    } else if (ms > SLOW_MS) {
      console.warn(`[db] ${logStamp()} ${label(input, init)} slow (${context(ms)})`)
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

    // Log and re-throw UNTOUCHED. Rewording belongs to the frontend, which
    // owns every player-facing string; a wrapper that edited the message here
    // would be a second author of player copy, in the layer furthest from the
    // player. This function's whole job is the console line above.
    throw err
  }
}
