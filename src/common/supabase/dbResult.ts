// cs-unmet

import { edgeFnTransport } from './edgeFnTransport'
import {
  envAndTransportToDiagFields, environmentalEnvelope, faultEnvelope, nothingReachedUs,
  OUR_BUG_TO_CODE_AND_TEXT, reportDbFault, situationFor, type DbCallOptions, type DbError,
} from './dbEnvelope'
import { logDb, type DbLogKind, type TransportFacts } from './dbLog'
import type { Outcome } from '../outcomes/outcomes'
import type { Envelope, NotOkEnv, Severity } from './envelope'

/**
 * **The server-result wrappers.** Classification and the three wrappers —
 * `runRpc`, `runEdgeFn`, `readRows` — in one file on purpose. The envelope's
 * TYPE is `envelope.ts`; its builders and the sentences are `dbEnvelope.ts`.
 *
 * See `docs/envelopes.md` for the design. The one-line version: a call
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
 * Faults are presented centrally — `reportDbFault` — so no call site has to
 * classify a failure, word a network problem, or decide when a modal is due.
 * The three wrappers below call it for every fault they see, and the two places
 * that build an envelope by hand hand theirs over the same way (`reportUnhandled`,
 * and `useProfile`'s missing-row fault).
 *
 * **The exception is sanctioned and narrow**: a caller passing
 * `presentFaults: false` has promised to show its own, which is why three files
 * call `showFaultModal` directly (`HomePage`, `useGameTimer`, `useWordSubmit`) —
 * `src/guards/callSiteShape.test.ts` holds each of them to the promise.
 *
 * `dbFetch` classifies and logs but never shows: all it knows is the URL, so the
 * only rule it could express was "this path never modals", which cannot serve a
 * call that wants quiet for one answer and a modal for another.
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
 * a name rather than an inline `=== 0`: getting it wrong is invisible — both
 * answers produce an `Envelope<never>`, so no type and no test notices the
 * difference.
 *
 * `0` is not an HTTP status. postgrest-js sets it when the `fetch` REJECTED
 * (its `.catch` branch in `PostgrestBuilder`), and only then — anything that
 * actually replied carries a real status. `edgeFnTransport` reports the same `0`
 * for the same case, so one predicate covers both transports.
 *
 * **Known limit:** an abort also arrives as `0`. Unreachable today (nothing in
 * `src/` uses `AbortController` or `.abortSignal()`), and postgrest-js does
 * distinguish it via `hint: 'Request was aborted…'`, so a fix exists the day
 * someone adds cancellation — key on the hint rather than on the status alone.
 */
export function nothingAnswered(status: number | undefined): boolean {
  return status === 0
}

/** A `not-ok`'s severity decides its db log kind, so a line's kind and its
 *  severity can never disagree. Total by construction: a new severity is a
 *  compile error here, which is the point of the `Record`. A `fault` is not in
 *  the map because it never reaches this path — `reportDbFault` logs it. */
const SEVERITY_TO_DB_LOG_KIND: Record<Exclude<Severity, 'fault'>, DbLogKind> = {
  'service-error': 'SERVICE_ERROR',
  'form-validation': 'FORM_VALIDATION',
  'race': 'RACE',
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
  'fault': 'error',
  'form-validation': 'error',
  'service-error': 'error',
  'race': 'warning',
}

/**
 * **How a `not-ok` reads**: what its author asked for, or its severity's
 * default. The one place that question is answered, so no board can drift on
 * it.
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
 * **Log an answer that is NOT a fault** — a form-validation, a lost race, a
 * wait-and-retry service-error, or an `ok` carrying words. The line and nothing
 * else: `reportDbFault` is the path that also puts a modal up.
 *
 * The `service-error` half is the one that matters, and it is why "an expected
 * rejection is not worth logging" is the wrong rule: it makes a MISCLASSIFIED
 * bug completely silent. If "already deleted" starts firing on every click
 * because something is broken, nothing anywhere says so. Logging it at `warn`
 * costs one line and keeps that visible without putting a modal in anyone's way.
 */
function logDbNonFault(transport: TransportFacts, envelope: Envelope): void {
  logDb(dbLogKindFor(envelope), envAndTransportToDiagFields(transport, envelope), envelope.message)
}

/** Which db log kind an answer is written under — one case per line, in the
 *  order they are decided. */
function dbLogKindFor(envelope: Envelope): DbLogKind {
  // It worked. Whether it also carried words is `message`'s business, not the
  // kind's.
  if (envelope.type === 'ok') return 'OK'
  // `readEnvelope` — the one road here — routes a fault to `reportDbFault`
  // before this is reached, so it is unreachable at runtime. But `severity` is
  // still typed as the full union, and `SEVERITY_TO_DB_LOG_KIND` deliberately
  // omits `fault`, so the branch is what the map's own shape demands — and it
  // is the right answer besides, the day a second road forgets to filter.
  if (envelope.severity === 'fault') return 'FAULT'
  // Every remaining severity maps, and the `Record` makes that total: a new
  // severity is a compile error here rather than a silent fall-through.
  return SEVERITY_TO_DB_LOG_KIND[envelope.severity]
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
function envelopeForDbError(
  settled: { error: DbError; status?: number; statusText?: string },
  environmentalDetail: string | undefined,
  fallback: string,
  extra?: string,
): NotOkEnv {
  const situation = situationFor(settled.statusText)
  if (situation) return environmentalEnvelope(situation, environmentalDetail)
  if (nothingAnswered(settled.status)) return nothingReachedUs(environmentalDetail)
  return faultEnvelope(settled.error, fallback, extra, OUR_BUG_TO_CODE_AND_TEXT.dbErrorNamedNoCode.code)
}


/**
 * Is this parsed response body one of our envelopes?
 *
 * Deliberately strict, because plenty of things that are not envelopes arrive
 * on this path — a bare string, a number, a row array — and every one of them
 * must fall through cleanly rather than be half-read as one.
 *
 * **A `not-ok` must name a `dbcode`**, and that is now a thing this can insist
 * on rather than hope for: SQL writes the SQLSTATE unconditionally, Deno's
 * builders take the code as a required argument, and `edgeFnTransport` names every
 * failure it forwards. So a refusal with no code is not a refusal we can have
 * produced — it is a hand-built shape, and the loud answer is the right one.
 * An `ok` is unaffected: it carries a code only when a raise wrote one.
 */
export function _isEnvelope(body: unknown): body is Envelope {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const { type, dbcode } = body as { type?: unknown; dbcode?: unknown }
  if (type === 'not-ok') return typeof dbcode === 'string' && dbcode !== ''
  return type === 'ok'
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
  // `dbFetch`'s verdict when it had one — see `situationFor`.
  statusText?: string
}>

/**
 * **Read the envelope a server wrote** — the half of `runEdgeFn` and `runRpc`
 * that does not depend on which transport carried it. Everything up to the
 * parsed body is transport-specific and stays in each wrapper; everything
 * after it is this, once, so a check added here reaches both roads.
 *
 * Three steps, in the order they are decided:
 *
 * 1. **Is it an envelope at all?** A reply that isn't means the server
 *    answered with something no caller can read — an unconverted shape, or a
 *    null from a branch that never decided. Neither is actionable, and both
 *    are bugs rather than play, so it becomes a fault in the same shape as any
 *    other.
 * 2. **An `ok` that wrote words but not how they read** — see
 *    `hasMessageWithoutOutcome`.
 * 3. **The answer itself.** Everything a server decided arrives HTTP 200, so
 *    `dbFetch` — which only inspects a non-2xx body — has already moved on,
 *    and this is where the MEANING gets its own `[db]` line, at the level the
 *    severity names. A declared fault also gets the modal here, which is what
 *    makes `severity: 'fault'` mean the same thing however the fault arose.
 *
 * Not for `readRows`, which builds an envelope around rows nobody authored and
 * never receives one — `src/guards/dbCallShape.test.ts` guards that split.
 */
function readEnvelope<T>(transport: TransportFacts, body: unknown, opts?: DbCallOptions): Envelope<T> {
  if (!_isEnvelope(body)) {
    // `PN307` as the `dbcode` rather than null: the call SUCCEEDED, so there is
    // no SQLSTATE to carry — but "the frontend built this" is itself an answer,
    // and a call site should not have to identify it by an absence. The body
    // rides in `detail` rather than living only in the console line.
    const rawBody = `rawBody: ${JSON.stringify(body)?.slice(0, 120)}`
    const unreadable = faultEnvelope(
      null, OUR_BUG_TO_CODE_AND_TEXT.unreadable.text, rawBody,
      OUR_BUG_TO_CODE_AND_TEXT.unreadable.code,
    )
    reportDbFault(transport, unreadable, opts)
    return unreadable
  }
  if (hasMessageWithoutOutcome(body)) {
    const broken = faultEnvelope(
      null, OUR_BUG_TO_CODE_AND_TEXT.noOutcome.text,
      `an ok carried a message with no outcome: ${JSON.stringify(body)?.slice(0, 120)}`,
      OUR_BUG_TO_CODE_AND_TEXT.noOutcome.code,
    )
    reportDbFault(transport, broken, opts)
    return broken
  }
  if (body.type === 'not-ok' && body.severity === 'fault') {
    reportDbFault(transport, body, opts)
  } else {
    logDbNonFault(transport, body)
  }
  return body as Envelope<T>
}

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
 * When no envelope comes back at all, `edgeFnTransport` has already named which
 * of three things happened, and this turns its verdict into the same envelope
 * the database path would build: nothing reached us, a reply that was not our
 * function (an outage, `FE003`), or our own function refusing — the only one of
 * the three that is a fault of ours.
 */
export async function runEdgeFn<T>(
  fnName: string,
  body: Record<string, unknown>,
  opts?: DbCallOptions,
): Promise<Envelope<T>> {
  const started = performance.now()
  const { data, error } = await edgeFnTransport(fnName, body)
  // Built before the failure branch, not after, because these failures are
  // presented HERE now — and a presented fault needs the transport facts for
  // its diagnostics line.
  const transport = {
    call: `POST /functions/v1/${fnName}`,
    status: error?.status ?? 200,
    ms: Math.round(performance.now() - started),
  }
  if (error) {
    // The same three answers the database path decides between, in the same
    // order — `edgeFnTransport` is this transport's `dbFetch`, and it has already
    // named which happened. Nothing answered; something answered that was not
    // our function (`FE003`, read back by code exactly as `situationFor` reads
    // `dbFetch`'s verdict out of `statusText`); or our function itself refused.
    const situation = situationFor(error.code)
    const envelope =
      nothingAnswered(error.status) ? nothingReachedUs(error.message)
      : situation ? environmentalEnvelope(situation, error.message)
      : faultEnvelope(
        error, 'The server refused the request.', undefined,
        OUR_BUG_TO_CODE_AND_TEXT.edgeFnRefusedCodeless.code,
      )
    reportDbFault(transport, envelope, opts)
    return envelope
  }
  return readEnvelope<T>(transport, data, opts)
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
 */
function callLabel(call: unknown, fallback: string): string {
  // Defensive because `url` and `method` are `protected` on postgrest-js's
  // builder: they are there at runtime and have been for every version we have
  // used, but a rename upstream should cost a vaguer log line, not a crash.
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
  opts?: DbCallOptions,
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
    // UNREACHABLE TODAY, and kept as a guard rather than as a second road:
    // postgrest-js converts every rejection — AbortError included — into
    // `{ error, status: 0 }` before the await settles, and nothing here calls
    // `.throwOnError()`, which is the only switch that changes that. It reports
    // like every other failure so that if a version bump or a `.throwOnError()`
    // ever makes it reachable, it cannot be reachable AND silent.
    const envelope = nothingReachedUs(String(thrown))
    reportDbFault(
      { call: callLabel(call, 'rpc'), ms: Math.round(performance.now() - started) },
      envelope, opts,
    )
    return envelope
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
    const envelope = envelopeForDbError(settled, settled.error.message, 'The server refused the request.')
    reportDbFault(transport, envelope, opts)
    return envelope
  }
  return readEnvelope<T>(transport, settled.data, opts)
}

/**
 * **Run a direct table read and hand back an envelope.**
 *
 * A read never authors one of its own, so this builds it — same shape as an
 * RPC's, so every call site branches alike whatever it called. **Zero rows is
 * `ok`** and a failure is always a `fault`; both rules, and why, are in
 * docs/envelopes.md → Consumers.
 *
 * What that leaves a caller: the modal is already up (this wrapper presented
 * it), so its only job is to stop showing a stale answer.
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
  opts?: DbCallOptions,
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
    // Unreachable today, for the reason given on `runRpc`'s twin above, and
    // reporting for the same reason: a guard that fires silently is worse than
    // no guard.
    const envelope = nothingReachedUs(`${call} — ${String(thrown)}`)
    reportDbFault({ call, ms: Math.round(performance.now() - started) }, envelope, opts)
    return envelope
  }
  if (settled.error) {
    const envelope = envelopeForDbError(settled, `${call} — ${settled.error.message}`, 'The read failed.', call)
    reportDbFault({ call, status: settled.status, ms: Math.round(performance.now() - started) }, envelope, opts)
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
    reportDbFault(
      { call, status: 200, ms: Math.round(performance.now() - started) }, crossed, opts,
    )
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
