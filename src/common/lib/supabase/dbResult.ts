// cs-unmet

import { callEdgeFn } from './callEdgeFn'
import {
  envelopeFields, environmentalEnvelope, faultEnvelope, nothingReachedUs,
  OUR_BUG_TO_CODE_AND_TEXT, reportDbFault, situationFor, type DbError,
} from './dbEnvelope'
import { logDb, type LogLevel, type Transport } from './dbLog'
import type { Outcome } from '../outcomes'
import type { Envelope, NotOk, Severity } from './envelope'

/**
 * **The new server-result system.** Types, classification, the environmental
 * sentences, and the read wrapper — all of it, in one file on purpose.
 *
 * See `plans/error-system.md` for the design. The one-line version: a call
 * either reaches a decision and says what it was, or something is broken, and
 * a call site should never have to work out which.
 *
 * ─── One shape, always ───────────────────────────────────────
 * Everything the frontend receives is an ENVELOPE. The database returns one;
 * when it couldn't — a raw Postgres error, a request that never completed, a
 * direct table read — we build one in the same shape. There is no second type
 * and no special arm for failure.
 *
 * A call site reads `type` first:
 *
 *     ok                        use `data`
 *     not-ok / form-validation  show `message` under the control it names
 *     not-ok / race             show `message` in a pill — you lost the race
 *     not-ok / service-error    show `message` in a pill; wait and retry
 *     not-ok / fault            show `message` too — see below
 *
 * Faults are presented centrally — `reportDbFault`, from the three wrappers
 * below and from nowhere else — so no call site classifies a failure, words a
 * network problem, or reaches for `showFaultModal` itself. `dbFetch` classifies
 * and logs but never shows: all it knows is the URL, so the only rule it could
 * express was "this path never modals", which cannot serve a call that wants
 * quiet for one answer and a modal for another.
 *
 * A call site still SHOWS a fault's message, though: the modal is an escalation,
 * not a replacement, and nothing reads `severity` to decide whether to display
 * an answer — only how it reads. Why, in docs/envelopes.md → What a caller does
 * with one.
 */

// ─────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────

/**
 * **Did anything answer at all?**
 *
 * The one question separating the two kinds of failure, and the reason it gets
 * a name rather than an inline `=== 0`: it is asked at four call sites, and
 * getting it wrong is invisible — both answers produce an `Envelope<never>`,
 * so no type and no test notices the difference.
 *
 * `0` is not an HTTP status. postgrest-js sets it when the `fetch` REJECTED
 * (its `.catch` branch in `PostgrestBuilder`), and only then — anything that
 * actually replied carries a real status. `callEdgeFn` reports the same `0`
 * for the same case, so one predicate covers both transports.
 *
 * **Known limit:** an abort also arrives as `0`. Unreachable today (nothing in
 * `src/` uses `AbortController` or `.abortSignal()`), and postgrest-js does
 * distinguish it via `hint: 'Request was aborted…'`, so a fix exists the day
 * someone adds cancellation. plans/envelope-layering.md §6.
 */
export function nothingAnswered(status: number | undefined): boolean {
  return status === 0
}

/** A `not-ok`'s severity decides its `[db]` level, so a line's level and its
 *  severity can never disagree. Total by construction: a new severity is a
 *  compile error here, which is the point of the `Record`. A `fault` is not in
 *  the map because it never reaches this path — `reportDbFault` logs it. */
const SEVERITY_TO_LOGLEVEL: Record<Exclude<Severity, 'fault'>, LogLevel> = {
  'service-error': 'SERVICE_ERROR',
  'form-validation': 'FORM_VALIDATION',
  race: 'RACE',
}

/**
 * **The default appearance of each severity** — how a `not-ok` reads when its
 * author didn't say (docs/envelopes.md → Appearance).
 *
 * Three of the four are `error` and only `race` differs, which is the whole
 * point of having a race at all: it is not a losing move, but the move is not
 * being taken and you should notice, so it wears orange rather than red.
 *
 * Resolved HERE, once, rather than in SQL — which would repeat it at every
 * raise and mean editing all of them to change it — or at the call site, which
 * is the same problem one layer up.
 */
const SEVERITY_TO_OUTCOME: Record<Severity, Outcome> = {
  fault: 'error',
  'form-validation': 'error',
  'service-error': 'error',
  race: 'warning',
}

/**
 * **How a `not-ok` reads**: what its author asked for, or its severity's
 * default. The one place that question is answered, so fifteen boards can't
 * drift on it.
 *
 * Note what this does NOT do: it does not write the answer back into the
 * envelope. A caller reads the same envelope the server sent, and `outcome`
 * keeps meaning one thing — *the author overrode the default* — rather than
 * meaning "the default, filled in later" on the way past. So a blank `outcome=`
 * on a `[db]` line beside an orange pill is not a discrepancy to explain: it
 * says the author didn't override, and orange is what `race` looks like.
 */
export function notOkOutcome(envelope: Envelope & { type: 'not-ok' }): Outcome {
  return envelope.outcome ?? SEVERITY_TO_OUTCOME[envelope.severity]
}

/**
 * **Log an outcome that is NOT a fault** — a form-validation, a lost race, a
 * wait-and-retry service-error, or an `ok` carrying words.
 *
 * The `service-error` half is the one that matters. `serverError.ts`'s rule was
 * "expected rejections are NOT logged", which makes a MISCLASSIFIED bug
 * completely silent: if "already deleted" starts firing on every click because
 * something is broken, nothing anywhere says so. Logging it at `warn` costs one
 * line and keeps that visible without putting a modal in anyone's way.
 */
function logDbOutcome(transport: Transport, envelope: Envelope): void {
  logDb(logLevelFor(envelope), envelopeFields(transport, envelope), envelope.message)
}

/** Which `[db]` level an answer is written at — one case per line, in the order
 *  they are decided. */
function logLevelFor(envelope: Envelope): LogLevel {
  // It worked. Whether it also carried words is `message`'s business, not the
  // level's.
  if (envelope.type === 'ok') return 'OK'
  // Both callers already routed a fault to `reportDbFault`, so this is
  // unreachable at runtime — but `severity` is still typed as the full union
  // here, and `SEVERITY_TO_LOGLEVEL` deliberately omits `fault`. So the branch
  // is what the map's own shape demands, and it is the right answer besides,
  // the day a third caller forgets to filter.
  if (envelope.severity === 'fault') return 'FAULT'
  // Every remaining severity maps, and the `Record` makes that total: a new
  // severity is a compile error here rather than a silent fall-through.
  return SEVERITY_TO_LOGLEVEL[envelope.severity]
}

/**
 * **The envelope for a call that came back with an error**, in the order the
 * three answers are decided.
 *
 * `dbFetch`'s verdict wins when it left one: it is the only layer that could
 * see whether the body parsed, and a wrapper receiving postgrest-js's flattened
 * `{ message: string }` cannot tell Kong's JSON from a captive portal's HTML.
 * Then "nothing answered at all", which the status alone identifies. Then
 * Postgres speaking for itself, which is the case that needs no help.
 */
function failureEnvelope(
  settled: { error: DbError; status?: number; statusText?: string },
  environmentalDetail: string | undefined,
  fallback: string,
  extra?: string,
): NotOk {
  const situation = situationFor(settled.statusText)
  if (situation) return environmentalEnvelope(situation, environmentalDetail)
  if (nothingAnswered(settled.status)) return nothingReachedUs(environmentalDetail)
  return faultEnvelope(settled.error, fallback, extra)
}

/**
 * **What a caller may ask of a wrapper.** One question today, and the default
 * is the answer almost every site wants.
 *
 * `presentFaults: false` says *I will handle my own faults* — not *drop them*.
 * It exists because the alternative was a path test in `dbFetch`
 * (`isPolled`), which is all-or-nothing per endpoint: it could silence
 * `tick_timer` entirely but not silence its transport failures while still
 * showing its `PN011`. A wrapper holds the parsed envelope, so a caller that
 * opts out can decide per ANSWER (docs/envelopes.md → Presenting a fault).
 *
 * **Default ON is what keeps forgetting impossible.** A call site that ignores
 * its result entirely still surfaces the failure; only a site that has thought
 * about it passes the flag, and the flag is visible at the call rather than in
 * a list in another file.
 */
export type CallOptions = {
  /** Default `true`. Pass `false` only with a plan for handling faults
   *  yourself — `src/guards/callSiteShape.test.ts` checks that you have one. */
  presentFaults?: boolean
}

/**
 * **Show a fault, unless the caller took the job.** The one place a wrapper
 * decides, so the rule is written once rather than at each of the seven sites
 * that used to call `reportDbFault` directly.
 *
 * Always LOGS, whoever presents: opting out of the modal is not opting out of
 * the record, and a misclassified failure that stops being visible on screen
 * must not also stop being visible in the console.
 *
 * Takes the NOT-OK ARM, like `reportDbFault` — every caller has established
 * `severity: 'fault'` before reaching here, so the message is a `string` and
 * there is no null to hedge against.
 */
function reportFault(transport: Transport, envelope: NotOk, opts?: CallOptions): void {
  if (opts?.presentFaults === false) {
    logDb('FAULT', envelopeFields(transport, envelope), envelope.message)
    return
  }
  reportDbFault(transport, envelope)
}

/**
 * Is this parsed response body one of our envelopes?
 *
 * Deliberately strict, because plenty of things that are not envelopes arrive
 * on this path — a bare string, a number, a row array — and every one of them
 * must fall through cleanly rather than be half-read as one.
 */
export function _isEnvelope(body: unknown): body is Envelope {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const t = (body as { type?: unknown }).type
  return t === 'ok' || t === 'not-ok'
}

/**
 * **An `ok` that wrote words but not how they read.** A non-null message means
 * "render this", and the outcome is how it renders — so without one a call site
 * has nothing to do but guess, and a guess turns a server bug into a pill
 * nobody questions (docs/envelopes.md → Who writes the words).
 *
 * The TYPE rules this out at every place that builds an envelope, and two
 * guards rule it out in SQL. What is left for this to catch is what neither
 * sees: an edge function's JSON literal, and anything hand-built at runtime.
 */
function hasMessageWithoutOutcome(envelope: Envelope): boolean {
  return envelope.type === 'ok' && envelope.message !== null && envelope.outcome === null
}

// ─────────────────────────────────────────────────────────────
// The read wrapper
// ─────────────────────────────────────────────────────────────

/** What a PostgREST query builder resolves to. Structural, so a schema-scoped
 *  builder satisfies it without importing its generics.
 *
 *  `status` is optional because it is absent from a hand-built test double, not
 *  because it is absent at runtime — postgrest-js always sets it, and `0` is
 *  the signal `nothingAnswered` reads. */
type QueryLike<T> = PromiseLike<{
  data: T | null
  error: DbError
  status?: number
  /** `dbFetch`'s verdict when it had one — see `situationFor`. */
  statusText?: string
}>

/**
 * **Call an edge function and hand back its envelope** — `runRpc`'s twin, for
 * the calls that reach Postgres through Deno instead of PostgREST.
 *
 * The two exist separately because the transports differ, not because the
 * results do. A setup edge function builds a board and then hands off to the
 * same `create_game` an RPC-path game calls directly, so what comes back is the
 * same envelope and every caller reads it the same way.
 *
 * The status says whether the function RAN, not what it decided
 * (docs/envelopes.md → How edge functions build one), so everything with an
 * envelope arrives 200 and the modal for a declared fault is raised HERE.
 *
 * A function that has not been converted yet still answers `{ error: key }`
 * with a 4xx; that arrives as a transport-shaped `CallError` and becomes a
 * fault envelope, which is the right treatment for a shape no caller can read.
 */
export async function runEdgeFn<T>(
  fnName: string,
  body: Record<string, unknown>,
  opts?: CallOptions,
): Promise<Envelope<T>> {
  const started = performance.now()
  const { data, error } = await callEdgeFn(fnName, body)
  // Built before the failure branch, not after, because these failures are
  // presented HERE now — and a presented fault needs the transport facts for
  // its diagnostics line.
  const transport = {
    call: `POST /functions/v1/${fnName}`,
    status: error?.status ?? 200,
    ms: Math.round(performance.now() - started),
  }
  if (error) {
    // NOTHING ANSWERED, or something answered that was not our function — a
    // gateway's HTML, a shape from before the conversion. `callEdgeFn` has
    // recovered whatever message there was.
    const envelope = nothingAnswered(error.status)
      ? nothingReachedUs(error.message)
      : faultEnvelope(error, 'The server refused the request.')
    reportFault(transport, envelope, opts)
    return envelope
  }
  if (!_isEnvelope(data)) {
    const rawBody = `rawBody: ${JSON.stringify(data)?.slice(0, 120)}`
    const unreadable = faultEnvelope(
      null, OUR_BUG_TO_CODE_AND_TEXT.unreadable.text, rawBody,
      OUR_BUG_TO_CODE_AND_TEXT.unreadable.code,
    )
    reportFault(transport, unreadable, opts)
    return unreadable
  }
  if (hasMessageWithoutOutcome(data)) {
    const broken = faultEnvelope(
      null, OUR_BUG_TO_CODE_AND_TEXT.noOutcome.text,
      `an ok carried a message with no outcome: ${JSON.stringify(data)?.slice(0, 120)}`,
      OUR_BUG_TO_CODE_AND_TEXT.noOutcome.code,
    )
    reportFault(transport, broken, opts)
    return broken
  }
  if (data.type === 'not-ok' && data.severity === 'fault') {
    reportFault(transport, data, opts)
  } else {
    logDbOutcome(transport, data)
  }
  return data as Envelope<T>
}

/**
 * **`METHOD /path` for a query builder** — the same identifier `dbFetch` puts on
 * every line it writes, so a fault reads the same wherever it was reported.
 *
 * A builder carries the request it is going to make (`POST`, `/rest/v1/rpc/…`)
 * from the moment it is constructed, which is why nothing here has to be told
 * the RPC's name or the table's. That matters most for the faults we DECLARE:
 * they arrive HTTP 200, so `dbFetch` never sees them, and without this they
 * would be the only faults in the app that could not say which call they came
 * from — the ones we authored and wrote sentences for.
 *
 * Defensive because `url` and `method` are `protected` on postgrest-js's
 * builder: they are there at runtime and have been for every version we have
 * used, but a rename upstream should cost a vaguer log line, not a crash.
 */
function callLabel(call: unknown, fallback: string): string {
  const c = call as { url?: unknown; method?: unknown }
  if (!(c?.url instanceof URL)) return fallback
  const method = typeof c.method === 'string' ? c.method : 'GET'
  return `${method} ${c.url.pathname}`
}

/**
 * **Run an RPC and hand back its envelope.**
 *
 * The RPC's own envelope passes through untouched. When there isn't one — the
 * call errored, never completed, or answered with something unreadable — one is
 * built in the same shape, so a caller has a single thing to read either way.
 *
 *     const r = await runRpc<Word[]>(db.rpc('anagrams', { letters }))
 *     if (r.type !== 'ok') {
 *       setError(r.severity === 'form-validation' ? r.message : null)
 *       return
 *     }
 *     setResults(r.data)
 */
export async function runRpc<T>(
  call: PromiseLike<{ data: unknown; error: DbError; status?: number; statusText?: string }>,
  opts?: CallOptions,
): Promise<Envelope<T>> {
  // Timed here because `dbFetch` stays quiet on an RPC's 2xx — the answer
  // inside it is this function's to read, and one line per call beats a `OK`
  // sitting above a `FAULT` about the same request. So this line carries the
  // duration as well as the meaning.
  const started = performance.now()
  let settled: { data: unknown; error: DbError; status?: number; statusText?: string }
  try {
    settled = await call
  } catch (thrown) {
    // A throw IS "nothing answered". postgrest-js normally converts a rejected
    // fetch into `{ error, status: 0 }` before it reaches here, so what this
    // actually catches is a throw from some other layer — the same case by
    // another road, not a different one.
    return nothingReachedUs(String(thrown))
  }
  // Built before the failure branch, not after: these failures are presented
  // HERE now, and a presented fault needs the transport facts for its
  // diagnostics line.
  const transport = {
    call: callLabel(call, 'rpc'),
    status: settled.status ?? 200,
    ms: Math.round(performance.now() - started),
  }
  if (settled.error) {
    const envelope = failureEnvelope(settled, settled.error.message, 'The server refused the request.')
    reportFault(transport, envelope, opts)
    return envelope
  }
  const body = settled.data
  // A reply that isn't an envelope means the RPC answered with something no
  // caller can read — an unconverted shape, or a null from a branch that never
  // decided. Neither is actionable, and both are bugs rather than play, so it
  // becomes a fault in the same shape as any other.
  if (!_isEnvelope(body)) {
    const rawBody = `rawBody: ${JSON.stringify(body)?.slice(0, 120)}`
    const unreadable = faultEnvelope(
      null, OUR_BUG_TO_CODE_AND_TEXT.unreadable.text, rawBody,
      OUR_BUG_TO_CODE_AND_TEXT.unreadable.code,
    )
    reportFault(transport, unreadable, opts)
    // No `dbcode` to carry — the call SUCCEEDED (a 200 with an unreadable
    // body), so there is no Postgres error. What we do know is the body, and
    // it goes into `detail` rather than living only in the console line.
    return unreadable
  }
  // Everything the RPC decided arrives HTTP 200, so `dbFetch` — which only
  // inspects a non-2xx body — has already written its line and moved on. This
  // is where the MEANING gets its own, at the level the severity names.
  //
  // A declared fault also gets the modal here, which is what makes
  // `severity: 'fault'` mean the same thing however the fault arose.
  if (hasMessageWithoutOutcome(body)) {
    const broken = faultEnvelope(
      null, OUR_BUG_TO_CODE_AND_TEXT.noOutcome.text,
      `an ok carried a message with no outcome: ${JSON.stringify(body)?.slice(0, 120)}`,
      OUR_BUG_TO_CODE_AND_TEXT.noOutcome.code,
    )
    reportFault(transport, broken, opts)
    return broken
  }
  if (body.type === 'not-ok' && body.severity === 'fault') {
    reportFault(transport, body, opts)
  } else {
    logDbOutcome(transport, body)
  }
  return body as Envelope<T>
}

/**
 * **Run a direct table read and hand back an envelope.**
 *
 * A read never authors one of its own, so this builds it — same shape as an
 * RPC's, so every call site branches alike whatever it called. **Zero rows is
 * `ok`** and a failure is always a `fault`; both rules, and why, are in
 * docs/envelopes.md → Consumers.
 *
 * What that leaves a caller: the modal is already up (`dbFetch` presented it),
 * so its only job is to stop showing a stale answer.
 *
 *     const r = await readRows(db.from('clubs').select('handle, name'))
 *     if (r.type !== 'ok') { setLoad('failed'); return }
 *     setClubs(r.data)
 *
 * `Row` is inferred from the query builder, so the rows stay typed even though
 * the envelope's `data` is generic.
 */
export async function readRows<Row>(
  query: QueryLike<Row[]>,
  opts?: CallOptions,
): Promise<Envelope<Row[]>> {
  // Timed here, exactly as `runRpc` times itself: a postgrest builder is LAZY,
  // so `await query` is what fires the request, and wrapping it captures the
  // whole round trip. `dbFetch` no longer speaks for a successful read — the
  // layer that knows what came back does — so this is where the duration for
  // that line has to come from.
  const started = performance.now()
  // **WHICH read this is, resolved before the await and used on every path.**
  // A builder carries its URL from the moment it is constructed, so this costs
  // nothing here, and the failure envelopes below need it: a hook makes several
  // reads, and the sentence a player sees is generic by design ("You appear to
  // be offline"). Without this, the envelope a hook keeps says a read failed and
  // cannot say which — the one fact nobody can recover afterwards.
  const call = callLabel(query, 'read')
  let settled: { data: Row[] | null; error: DbError; status?: number; statusText?: string }
  try {
    settled = await query
  } catch (thrown) {
    // A throw IS "nothing answered". postgrest-js converts a rejected fetch
    // into `{ error, status: 0 }` before it reaches here, so this catches a
    // throw from some OTHER layer — the same case by another road.
    return nothingReachedUs(`${call} — ${String(thrown)}`)
  }
  if (settled.error) {
    const envelope = failureEnvelope(settled, `${call} — ${settled.error.message}`, 'The read failed.', call)
    reportFault({ call, status: settled.status, ms: Math.round(performance.now() - started) }, envelope, opts)
    return envelope
  }
  // **This wrapper is for QUERIES.** Pointed at an RPC, what comes back is a
  // single value rather than rows — most often one of our own envelopes — and
  // wrapping that as `data` would bury its real `type`, `severity` and `dbcode`
  // a level down where no call site looks for them. So it faults instead, the
  // mirror of `runRpc`'s unreadable-body check above.
  //
  // TypeScript blocks most of the mistake already (an RPC resolves to
  // `data: T | null`, which is not `Row[]`) — but not a `returns setof` one,
  // and not a cast. `src/guards/dbCallShape.test.ts` is the compile-time half
  // of this pair; this is the half that runs.
  if (settled.data !== null && !Array.isArray(settled.data)) {
    const what = _isEnvelope(settled.data) ? 'an RPC envelope' : `a ${typeof settled.data}`
    const crossed = faultEnvelope(
      null, OUR_BUG_TO_CODE_AND_TEXT.notRows.text,
      `readRows received ${what}: ${JSON.stringify(settled.data)?.slice(0, 120)}`,
      OUR_BUG_TO_CODE_AND_TEXT.notRows.code,
    )
    reportFault({ call, status: 200 }, crossed, opts)
    return crossed
  }
  // `null` collapses to `[]`: PostgREST returns null rather than an empty array
  // in some shapes, and "no rows" is one answer, not two.
  const rows = settled.data ?? []
  // The read's own `[db]` line, and a better one than `dbFetch` could write:
  // this knows the ROW COUNT, which `dbFetch` deliberately does not parse the
  // body to learn ("rows are not worth the cost"). It rides in `detail` rather
  // than as a new column, because the line's fixed field list is a promise that
  // a blank means something, and one caller's extra fact does not get to move
  // every other line's shape.
  logDb('OK', {
    call,
    status: settled.status ?? 200,
    ms: Math.round(performance.now() - started),
    detail: `rows=${rows.length}`,
  })
  return {
    type: 'ok',
    data: rows,
    outcome: null,
    severity: null,
    field: null,
    message: null,
    meta: null,
    dbcode: null,
    detail: null,
  }
}
