// cs-met-supabase

import { showFaultModal } from '../faults/faultStore'
import { logDb, type DiagFields, type TransportFacts } from './dbLog'
import type { Envelope, NotOkEnv } from './envelope'

/**
 * **Building an envelope for a failure that never had one, and presenting it.**
 *
 * The database answers in an envelope; when it could not — a raw Postgres
 * error, a request that never completed — one is built here, in the same shape,
 * so nothing downstream has to know which sort of failure produced it.
 *
 * Sits between `dbLog` and `dbResult`'s three wrappers, which call these
 * builders for every failure they present. `dbFetch` reaches in only for the
 * `FE` codes it writes into `statusText`; it words nothing and shows nothing.
 * One builder per sentence is the whole point — two authors of one sentence is
 * how the modal and the pill came to disagree (docs/envelopes.md → Who writes
 * the words, per answer).
 */

/**
 * The error shape a failed call resolves to. Structural, so a PostgrestError
 * and a hand-built object both satisfy it.
 *
 * The first four fields are PostgREST's. The last two are `edgeFnTransport`'s, which
 * has a Response in hand where the database path has only a flattened message:
 * `status` is read back by `runEdgeFn` to tell "nothing answered" from "the
 * function refused", and `answered` says the runtime replied at all.
 */
export type DbError = {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
  // The HTTP status, when the failure came through an edge function. Direct
  // PostgREST errors don't carry one.
  status?: number
  // Set by `edgeFnTransport` when the runtime answered — the function's own refusal,
  // or a container that replied with something unparseable.
  answered?: true
} | null | undefined

/**
 * **The `FE` class: our server did not answer.**
 *
 * A third code class beside the two SQL and Deno use — `PA` for a raise that
 * becomes `ok`, `PN` for one that becomes `not-ok` — for envelopes the FRONTEND
 * built because nothing usable came back. Nothing raises these; they are
 * written straight into an envelope here.
 *
 * `^FE[0-9]{3}$` cannot collide with `^P[AN][0-9]{3}$`, so the forty-odd SQL
 * exception handlers that re-raise anything not matching theirs are untouched —
 * correctly, since an `FE` code never arrives in SQL.
 *
 * **Why four codes and not one.** They are four different things to go fix, and
 * the fix is what a code is for. `status=` blank means nothing reached us at
 * all; a parsed body with no SQLSTATE means OUR gateway answered and what sits
 * behind it did not; an unparseable body on `/rest/v1/` means something that
 * is not PostgREST answered, because PostgREST always speaks JSON. Merging them
 * would leave the person reading a log at 2am with one word for three
 * investigations.
 *
 * **What the sentences may say.** An environmental failure cannot tell you
 * whether your move landed, so none of them claims either way, and each says
 * "refresh and try again" — refreshing is what reveals the real state, before a
 * retry can double-apply. They differ from each other because each names WHO
 * failed, and getting that wrong sends a player to fix a router that is working
 * when the fault is our own upstream (Joel, 2026-08-31).
 */
export const NO_ANSWER_TO_CODE_AND_TEXT = {
  // Nothing answered and the device already knew — `navigator.onLine` false.
  // That ends the investigation.
  offline: {
    code: 'FE001',
    text: 'You appear to be offline. Please refresh and try again.',
  },
  // Nothing answered and the device thought it was connected: DNS, TLS, a
  // refused connection, a socket that died. We know no more than that.
  unreachable: {
    code: 'FE002',
    text: "You appear online, but the server didn't answer. Please refresh and try again.",
  },
  // A non-2xx whose body PARSED but carried no SQLSTATE — Kong's own
  // `{"message":"no Route matched…"}`, or any platform layer answering for us.
  // Our gateway is up; the thing behind it is not — which is not a sentence a
  // player needs. They need "our server is down"; the gateway's own words go to
  // `detail`. "Later" as well as "refresh", because refreshing does not fix an
  // upstream outage — but it is still what reveals whether the last move landed.
  upstreamDown: {
    code: 'FE003',
    text: 'Our server appears to be down. Please refresh and try again later.',
  },
  // A non-2xx on `/rest/v1/` whose body would not parse. PostgREST always
  // speaks JSON, so a non-JSON body there means something that is NOT PostgREST
  // answered — a captive portal, a proxy, an ISP error page. The one case where
  // something IS on the player's side of the wire to check.
  foreignResponder: {
    code: 'FE004',
    text: 'You reached a server other than ours. Please check your network connection.',
  },
} as const

/**
 * **The situation `dbFetch` named, if it named one.** It writes its verdict into
 * `statusText` — the one field that survives postgrest-js untouched — because
 * it is the only layer that can tell Kong's JSON from a captive portal's HTML,
 * and by the time a wrapper sees the failure both have been flattened into the
 * same `{ message: string }`.
 *
 * `undefined` for anything else, including a real HTTP status text: nothing
 * else in this app writes an `FE` code there.
 */
export function situationFor(statusText: string | undefined) {
  return Object.values(NO_ANSWER_TO_CODE_AND_TEXT).find((s) => s.code === statusText)
}

/**
 * **Is this one of the four?** — the question a call site asks when it wants to
 * treat "our server did not answer" as one thing.
 */
export function isEnvironmental(dbcode: string | null): boolean {
  return Object.values(NO_ANSWER_TO_CODE_AND_TEXT).some((s) => s.code === dbcode)
}


/**
 * **The bugs the frontend catches, as `PN` codes.**
 *
 * `PN`, not a class of their own, because the letter says what the code does to
 * `type` — `PA` becomes `ok`, `PN` becomes `not-ok` — and never who authored
 * it. That sequence already spans SQL raises and Deno's; TypeScript is a third
 * author of the same thing, and a call site testing `dbcode === 'PN307'` does
 * not care which layer noticed.
 *
 * All of them are OURS, which is why every sentence a player reads opens
 * `BUG:` — four carry it in their text, and `unhandledAnswer`'s is prefixed at
 * its one call, `reportUnhandled`, where the call's name goes between. They are
 * the failures where something answered and the answer was wrong — as against
 * the `FE` codes above, where our server did not answer at all.
 */
export const OUR_BUG_TO_CODE_AND_TEXT = {
  // A 2xx whose body is not one of our envelopes — an unconverted RPC, or a
  // `null` from a branch that never decided.
  unreadable: {
    code: 'PN307',
    text: 'BUG: an RPC answered with something no caller can read',
  },
  // An `ok` carrying a message with no outcome. The type system rules this out
  // at every TypeScript site that builds an envelope, so only a Deno JSON
  // literal can reach it.
  noOutcome: {
    code: 'PN308',
    text: 'BUG: an ok carried a message with no outcome',
  },
  // `readRows` pointed at something that answers with a value, not rows — a
  // `returns setof`, or a cast.
  notRows: {
    code: 'PN309',
    text: 'BUG: a table read did not answer with rows',
  },
  // The edge RUNTIME answered instead of the function — `Function not found` in
  // `text/plain`, or a container that will not boot. Ours: a deploy failure,
  // not a network one.
  //
  // A captive portal intercepts everything, so a portal on a function call
  // lands here too and blames us for a network problem. That is the safe
  // direction to be wrong in, and the log corrects it: a portal produces
  // `FE004`s on the concurrent `/rest/v1/` traffic at the same moment.
  runtimeNotFunction: {
    code: 'PN310',
    text: 'BUG: the edge-function runtime answered instead of the function',
  },
  // A call site's branches did not cover the answer it got — the mandatory
  // `else` at the end of an RPC call site, which fires only when the server
  // said something this caller was never taught to read.
  //
  // Its number is out of family on purpose: `max + 1` across the whole `PN`
  // class is what allocates a code (docs/envelopes.md → Allocating one), and
  // the 3xx block filled up with SQL raises long after 307–310 were taken.
  // Never filling gaps is the rule, so a bug report saying "PN488" can only
  // ever mean this.
  unhandledAnswer: {
    code: 'PN488',
    text: 'fell through to unhandled',
  },
  // One of OUR edge functions answered non-2xx with `{ error }` and no `code`.
  // A function that ran answers 200 with an envelope, and one that relays a
  // raise sends the SQLSTATE beside the message — so neither happened here, and
  // the failure would otherwise travel with nothing to key on. `edgeFnTransport`
  // stamps this at the one place that can tell it from a reply that was not
  // ours at all (which is `FE003`, not a bug of ours).
  //
  // Unreachable today, like `unreadable` and `noOutcome` above: no function
  // returns a non-2xx status. It covers the unconverted one somebody writes.
  edgeFnRefusedCodeless: {
    code: 'PN489',
    text: 'BUG: an edge function refused without naming a code',
  },
  // The database path's equivalent, and `faultEnvelope`'s required `ourCode`
  // for it. postgrest-js puts Postgres's SQLSTATE on every error it reports,
  // and the one case where it cannot — a rejected fetch — carries `status: 0`
  // and is routed to `nothingReachedUs` long before this. So it is unreachable
  // in the same way `unreadable` and `noOutcome` are: named because the type
  // requires a code and a caller that had to invent one would invent a worse
  // one.
  dbErrorNamedNoCode: {
    code: 'PN490',
    text: 'BUG: a database error arrived with no SQLSTATE',
  },
  // A signed-in session whose profile row is gone — `useProfile` reads zero
  // rows for its own `user_id`. Reachable, unlike the three above: a `db:reset`
  // under a live tab, or an account deleted mid-session, which is
  // `claim_username`'s PN018 arriving by another door.
  //
  // Its `text` is the code's MEANING, not the sentence the player reads: that
  // hook words its own ("Your profile is no longer on the server. Please
  // refresh."), the same way `unhandledAnswer`'s text is prefixed at its call
  // site rather than shown as it stands here.
  noProfileRow: {
    code: 'PN491',
    text: 'BUG: signed in with no profile row',
  },
} as const

/**
 * **Build an envelope for a failure the database didn't envelope itself** — a
 * raw Postgres error, or a reply no caller can read.
 *
 * Always `severity: fault`, because by construction nobody authored it. The
 * words are chosen HERE rather than when the fault is reported, so everything
 * downstream has an envelope and nothing downstream has to know what sort of
 * failure produced it.
 *
 * **`ourCode` is REQUIRED**, because a not-ok always carries a `dbcode` and this
 * is the only builder that could fail to produce one. Postgres's own SQLSTATE
 * still wins when the error has one — it is the more specific answer — so what
 * a caller names here is what this failure IS when nothing else said: the
 * unreadable body, the ok with no outcome, the read that answered with a value.
 * Several are unreachable, and naming one is still better than a shared tail:
 * a caller forced to say what it means says something true, where a builder
 * inventing a code for everybody says only "nobody knew".
 */
export function faultEnvelope(
  error: DbError,
  fallback: string,
  extra: string | undefined,
  ourCode: string,
): NotOkEnv {
  // Postgres's HINT is folded into `detail` rather than dropped. Our own raises
  // use HINT as an inter-function channel and never forward it — but a RAW
  // fault's hint is Postgres talking, and it is frequently the most useful
  // thing in the whole error ("Grant the required privileges to the current
  // role with: …"). The envelope has one debugging field, so it goes there.
  const parts = [error?.details, error?.hint, extra].filter(Boolean)
  const detail = parts.length ? parts.join(' — ') : undefined
  // EVERY KEY, null where there is nothing — the same nine an envelope from SQL
  // carries, so that a caller never has to ask whether a key is present before
  // asking what it holds (Joel, 2026-08-28).
  return {
    type: 'not-ok',
    data: null,
    outcome: null,
    severity: 'fault',
    message: error?.message ?? fallback,
    field: null,
    meta: null,
    dbcode: error?.code || ourCode,
    detail: detail ?? null,
  }
}

/**
 * **The envelope for a failure where OUR SERVER did not answer** — one of the
 * four `FE` codes, whichever the caller identified.
 *
 * **This is the only place any of those sentences is chosen**, which is the
 * whole point of it existing. The three wrappers call it to word the envelope
 * a call site reads AND the modal above it; `dbFetch` only names the situation,
 * as an `FE` code in `statusText`, and `situationFor` brings it back here.
 *
 * **Not `faultEnvelope`** for this path: it reaches for `error.message`, which
 * here is the browser's `"TypeError: Failed to fetch"` — a string no player
 * should be shown.
 *
 * `detail` is where the browser's string belongs: it is the only thing that
 * separates a dead socket from a TLS failure or a DNS miss, and it is worth
 * keeping — just not as the sentence a player reads.
 */
export function environmentalEnvelope(
  situation: { code: string; text: string },
  detail?: string,
): NotOkEnv {
  return {
    type: 'not-ok',
    data: null,
    outcome: null,
    severity: 'fault',
    message: situation.text,
    field: null,
    meta: null,
    dbcode: situation.code,
    detail: clampDetail(detail),
  }
}

/** The longest a `detail` may be. The same 120 the raw-body details in
 *  `dbResult` use; matching them matters more than the number does. */
const DETAIL_MAX = 120

/**
 * **Trim a detail that a server chose the length of.**
 *
 * On this path `detail` is frequently a body we could not parse — a captive
 * portal's whole HTML page, a gateway's error document — and it does not stay in
 * the console: `reportDbFault` puts the diagnostics line into the fault modal,
 * so an untrimmed one renders on screen.
 *
 * Only the environmental builder needs this. A raw fault's detail is Postgres
 * talking, which is bounded and worth in full.
 */
function clampDetail(detail: string | undefined): string | null {
  if (detail === undefined) return null
  return detail.length > DETAIL_MAX ? `${detail.slice(0, DETAIL_MAX)}…` : detail
}

/**
 * **Nothing reached us at all** — the two codes that `navigator.onLine` picks
 * between, which is the only thing we know when no `Response` exists.
 *
 * It reads the global ITSELF rather than taking a boolean. Two callers asking
 * the same global and passing the answer in is two chances to ask it
 * differently, and the value is ambient — reading it here is reading it at the
 * same moment either way.
 */
export function nothingReachedUs(detail?: string): NotOkEnv {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  const { offline: OFFLINE, unreachable: UNREACHABLE } = NO_ANSWER_TO_CODE_AND_TEXT
  return environmentalEnvelope(offline ? OFFLINE : UNREACHABLE, detail)
}

/**
 * The `[db]` fields for an envelope, merged with what the transport knows.
 *
 * **Where `null` becomes `undefined`, for every line that has an envelope.** An
 * envelope's keys are always present and often null; a `[db]` field is either
 * there or left out, and `DiagFields` accepts only the second spelling. Every
 * `?? undefined` below is that conversion. The only other place needing it is
 * `EnvelopeErrorPage`, which builds a line during render with no transport to
 * merge.
 */
export function envAndTransportToDiagFields(transport: TransportFacts, envelope: Envelope): DiagFields {
  // **Both details, joined — not the envelope's INSTEAD of the transport's.**
  // They answer different questions and neither substitutes for the other: the
  // envelope's is what the server said (Postgres's own details + hint, or a
  // raise's DETAIL), and the transport's is what the device knew (`online=`,
  // `hidden`). Overriding lost the second on every fault that carried the
  // first, which is exactly the pair you want on a gateway 502 — "the stack is
  // broken" and "this phone was on a train" are the same line apart.
  const details = [transport.detail, envelope.detail].filter(Boolean)
  return {
    ...transport,
    severity: envelope.type === 'not-ok' ? envelope.severity : undefined,
    outcome: envelope.outcome ?? undefined,
    dbcode: envelope.dbcode ?? undefined,
    field: envelope.type === 'not-ok' ? envelope.field ?? undefined : undefined,
    detail: details.length ? details.join(' — ') : undefined,
  }
}

/**
 * **What a caller may ask of a wrapper.** One question today, and the default
 * is the answer almost every site wants.
 *
 * `presentFaults: false` says *I will handle my own faults* — not *drop them*.
 * It exists because the alternative was a path test in `dbFetch` (`isPolled`),
 * which is all-or-nothing per endpoint: it could silence `tick_timer` entirely
 * but not silence its transport failures while still showing its `PN011`. A
 * wrapper holds the parsed envelope, so a caller that opts out can decide per
 * ANSWER (docs/envelopes.md → Presenting a fault).
 *
 * **Default ON is what keeps forgetting impossible.** A call site that ignores
 * its result entirely still surfaces the failure; only a site that has thought
 * about it passes the flag, and the flag is visible at the call rather than in
 * a list in another file.
 *
 * It lives HERE rather than with the wrappers because presenting is what it
 * controls, and presenting is this file's: `dbResult` imports `dbEnvelope`, so
 * the type could not travel the other way without a cycle.
 */
export type DbCallOptions = {
  // Default `true`. Pass `false` only with a plan for handling faults yourself —
  // `src/guards/callSiteShape.test.ts` checks that you have one.
  presentFaults?: boolean
}

/**
 * **Report a database failure**: write the `[db]` line, and put the modal up
 * unless the caller said it would show its own.
 *
 * It decides nothing about the WORDS. Whoever built the envelope already chose
 * them — `faultEnvelope` for a raw Postgres error, `environmentalEnvelope` for a
 * request that never completed, the RPC's own author for a declared fault — so
 * there is one path here and no taxonomy of failure kinds to keep in step with
 * the envelope's own.
 *
 * **The line is written either way.** Opting out of the modal is not opting out
 * of the record: a misclassified failure that stops being visible on screen must
 * not also stop being visible in the console.
 *
 * Takes the NOT-OK ARM rather than the union. Every caller has established
 * `severity: 'fault'` before reaching here, so the message is a `string` and
 * there is no null to hedge against — and typing the parameter wider than the
 * truth once forced a fallback sentence ("Something went wrong.") for a case no
 * caller can produce, a string that read like a choice and was really an
 * artifact of the signature.
 *
 * Returns nothing: by the time the caller resumes, the news is delivered.
 */
export function reportDbFault(
  transport: TransportFacts,
  envelope: NotOkEnv,
  opts?: DbCallOptions,
): void {
  const diagnostics = logDb('FAULT', envAndTransportToDiagFields(transport, envelope), envelope.message)
  if (opts?.presentFaults === false) return
  showFaultModal({ text: envelope.message, diagnostics })
}

/**
 * **A call site got an answer its branches do not cover** — the mandatory
 * `else` that ends every RPC call site.
 *
 * It fires only on a bug of ours: the server answered, `runRpc` read the
 * envelope and logged it as the perfectly good answer it was, and then the
 * caller had no branch for it. **That is why this needs its own report.** The
 * `[db]` line for the call itself says `OK`, so without this the only record
 * that anything went wrong is a modal — dismissible, capped at five, and
 * carrying no diagnostics line at all.
 *
 * **It takes the ANSWER, not just the name**, and that is the difference
 * between knowing there is a bug and knowing what it is: the useful fact about
 * a fall-through is what the server actually said — an `ok` whose `result` this
 * caller has no case for, an outcome nobody read — and that goes on the line as
 * `detail`.
 *
 * `call` stays a hand-written string. By the `else` branch the caller holds an
 * envelope, and an envelope does not carry the call's name.
 */
export function reportUnhandled(call: string, answer: Envelope): void {
  const { code, text } = OUR_BUG_TO_CODE_AND_TEXT.unhandledAnswer
  // **`status` is claimed only where it is known.** An `ok` arrived 200 on
  // every transport, so it says so. A `not-ok` may have arrived 200 (a declared
  // refusal) or 4xx (a raw fault), and the envelope does not carry which: the
  // wrapper knew, and logged it on the call's own `[db]` line one line up, but
  // that fact stops at the wrapper's `return`. So it is left off rather than
  // guessed — the one line where a blank `status=` means "not known here"
  // rather than "nothing answered". docs/deferred.md holds the change that
  // would make it known: the status in the envelope.
  //
  // Through `reportDbFault` rather than `showFaultModal` directly, which is the
  // whole point of this function: one line in the console and one modal with a
  // real `k=v` line under it, built by the same builder as every other fault.
  reportDbFault(
    { call, ...(answer.type === 'ok' ? { status: 200 } : {}) },
    faultEnvelope(
      null,
      `BUG: ${call} ${text}`,
      `answered ${JSON.stringify(answer)?.slice(0, 120)}`,
      code,
    ),
  )
}
