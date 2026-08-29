// cs-unmet

import { showFaultModal } from '../fault/faultStore'
import { callEdgeFn } from './callEdgeFn'
import { logStamp } from './realtimeDiag'
import type { Outcome } from '../outcomes'
import type { Envelope, Severity } from './envelope'

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
 * Faults are presented centrally — `reportDbFault`, from `dbFetch` and from the
 * wrappers below — so no call site classifies a failure, words a network
 * problem, or reaches for `showFaultModal` itself.
 *
 * A call site still SHOWS a fault's message, though: the modal is an escalation,
 * not a replacement, and nothing reads `severity` to decide whether to display
 * an answer — only how it reads. Why, in docs/envelopes.md → What a caller does
 * with one.
 */

// ─────────────────────────────────────────────────────────────
// The environmental messages
// ─────────────────────────────────────────────────────────────

/**
 * The whole frontend-authored message table — the two sentences for a failed JS
 * fetch, which is everything the server never got to speak for.
 *
 * Both are generic and name no action, and that is a correctness rule rather
 * than a style: docs/envelopes.md → The environmental sentences.
 */
const ENVIRONMENTAL = {
  offline: 'You appear to be offline. Please refresh and try again.',
  unreachable: "The server didn't answer. Please refresh and try again.",
} as const

/**
 * Raw faults we have chosen to word better.
 *
 * **This should stay nearly empty, and there's a principle keeping it that
 * way:** if a raw fault deserves a written sentence, that is a signal it should
 * have been a DECLARED fault instead — anything we can anticipate well enough
 * to write for, we can anticipate well enough to raise with a `PN` code at the
 * site. Each entry here is a small admission, and the only permanent residents
 * are what we structurally cannot declare.
 *
 * Starting empty on purpose. The first one that actually shows up in front of
 * someone can argue for itself.
 */
const RAW_FAULT_TEXT: Record<string, string> = {}

// ─────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────

/** Does this SQLSTATE belong to us? `PA` = the raise becomes `type: ok`,
 *  `PN` = it becomes `type: not-ok`. Everything else — `23514` from a
 *  constraint, `40P01` from a deadlock, PL/pgSQL's own `P0001` — is a RAW
 *  FAULT: something nobody wrote a line of SQL for.
 *
 *  Note the class is what carries the meaning, not the digits. `P0` is
 *  PL/pgSQL's own class, which is why ours are `PA`/`PN` and why a code from
 *  anywhere else can never be mistaken for one of ours. */
export function isOurDbCode(code: string | undefined | null): boolean {
  return !!code && /^P[AN][0-9]{3}$/.test(code)
}

/** The `{code, message, details, hint}` shape PostgREST returns for an error.
 *  Structural, so a PostgrestError or a hand-built object both satisfy it. */
export type DbError = {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
} | null | undefined

// ─────────────────────────────────────────────────────────────
// The `[db]` line
// ─────────────────────────────────────────────────────────────

/**
 * What a `[db]` line is ABOUT, and how loudly. One word, six values, and it
 * decides the console method as well as the label — so a line's level and its
 * severity can never disagree.
 *
 *     FAULT            a bug
 *     SERVICE_ERROR    something we depend on didn't answer
 *     SLOW             a call over the threshold that still worked
 *     RACE             a race the player lost
 *     FORM_VALIDATION  the values you sent
 *     OK               it worked
 *
 * **Four of the six are a severity, spelled the same way.** A level named for
 * what it is about would drift from the severity it prints beside — a bare
 * `ERROR` on a line whose `severity=service-error` invites the reader to wonder
 * which of the two they are looking at, and `error` is the word this system
 * exists to stop using loosely. `SLOW` and `OK` are the exceptions because they
 * are `dbFetch` narrating transport, where no envelope reached a decision.
 *
 * Why each sits at the console method it does — including why `RACE` is `warn`
 * when nothing is wrong — is in docs/envelopes.md → the `[db]` line.
 */
export type LogLevel =
  'FAULT' | 'SERVICE_ERROR' | 'SLOW' | 'RACE' | 'FORM_VALIDATION' | 'OK'

/** Which function on `console` writes a line at each level — the values are
 *  literally its method names, called as `console[…]`, which is why the browser's
 *  own level filter is the only volume control this needs. */
const LOGLEVEL_TO_CONSOLE_LOG_METHOD: Record<LogLevel, 'error' | 'warn' | 'debug'> = {
  FAULT: 'error',
  SERVICE_ERROR: 'warn',
  SLOW: 'warn',
  RACE: 'warn',
  FORM_VALIDATION: 'debug',
  OK: 'debug',
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
 * Everything a `[db]` line can carry. **Every field prints, every time**, empty
 * after the `=` when there is nothing to say — so the same fact is always in the
 * same position whether you are reading one line or scanning fifty, and a blank
 * is itself information (no `dbcode` means nothing raised; no `status` means the
 * server never answered).
 */
export type DiagFields = {
  /** `METHOD /path`. The one field that is never blank. */
  call: string
  // `| null` because an envelope's are always PRESENT and null when empty, and
  // this reads them straight through. The formatter already treats the two
  // alike (`fieldValue` returns '' for either), so this only lets the type say so.
  severity?: Severity | null
  outcome?: string | null
  dbcode?: string | null
  status?: number
  /** Round-trip milliseconds. Known where the fetch happens, not after it. */
  ms?: number
  /** The raise's COLUMN, on a form-validation. */
  field?: string | null
  /** The debugging line: the raise's DETAIL, Postgres's details + hint, or the
   *  thrown JS error. Never shown to a player. */
  detail?: string | null
}

/** A field's value for the `[db]` line: itself, or **empty** when it has nothing
 *  to say. Both "absent" and "explicitly null" print as nothing, because the
 *  line's promise is that a blank means the same thing wherever you see one —
 *  an envelope's keys are always present and often null, while the transport's
 *  are simply missing, and a reader should not have to know which they are
 *  looking at. */
const fieldValue = (x: unknown) => (x === undefined || x === null ? '' : String(x))

/** The same, for **free text**, wrapped in quotes so its spaces and `|` cannot
 *  be mistaken for the line's own delimiters — and with its own quotes escaped,
 *  since Postgres routinely hands back a hint like `Perhaps you meant
 *  "clubs.name"` and an unescaped one makes the line unparseable exactly where
 *  it is most worth parsing. An empty string prints as nothing rather than as
 *  `""`, so it reads like every other empty field. */
const quotedText = (x: unknown) =>
  x === undefined || x === null || x === '' ? '' : `"${String(x).replace(/"/g, '\\"')}"`

/**
 * **The diagnostics line** — every field, in a fixed order, empty after the `=`
 * when there is nothing to say. The same fact is always in the same position,
 * and a blank is itself information: no `dbcode` means nothing raised, no
 * `status` means the server never answered.
 *
 * Pure, so a surface can build one during render — an `<ErrorPage>` showing a
 * failure that was already logged where it happened.
 */
export function diagnosticsLine(level: LogLevel, f: DiagFields): string {
  return [
    logStamp(),
    level,
    f.call,
    `severity=${fieldValue(f.severity)}`,
    `outcome=${fieldValue(f.outcome)}`,
    `dbcode=${fieldValue(f.dbcode)}`,
    `status=${fieldValue(f.status)}`,
    `ms=${fieldValue(f.ms)}`,
    `field=${fieldValue(f.field)}`,
    `detail=${quotedText(f.detail)}`,
  ].join(' | ')
}

/**
 * **A call took too long.** The one `[db]` line that is about the REQUEST rather
 * than about an answer — it says how long, and nothing about what came back.
 *
 * It carries fewer fields than every other line, on purpose. The fixed list is a
 * promise that a blank means something: no `dbcode` means nothing raised, no
 * `status` means nothing answered. This line is written before the body is read,
 * so it can keep neither — printing `dbcode=` would say the response carried no
 * code, when the truth is that nobody looked. Omitted beats empty.
 */
export function logSlow(f: { call: string; ms?: number; detail?: string }): void {
  console[LOGLEVEL_TO_CONSOLE_LOG_METHOD.SLOW](
    `[db] ${[logStamp(), 'SLOW', f.call, `ms=${fieldValue(f.ms)}`, `detail=${quotedText(f.detail)}`].join(' | ')}`,
  )
}

/**
 * **Write one `[db]` line, and hand back its diagnostics half.**
 *
 * The console gets the whole line; the returned string is the same thing minus
 * the trailing `msg=`, which is what the fault modal and `<ErrorPage>` show
 * under the message — no point printing the message twice on a surface that
 * already leads with it.
 *
 * Built ONCE and shared, so the screen and the log carry the same timestamp as
 * well as the same fields. Two `logStamp()` calls would drift immediately.
 *
 * `[db]` is its own console channel, beside `[rt]` (realtime) and `[ui]`, so
 * filtering to it gives every database call and nothing else.
 */
export function logDb(level: LogLevel, f: DiagFields, message?: string | null): string {
  const diagnostics = diagnosticsLine(level, f)
  // `null` as well as `undefined`: an `ok` envelope always CARRIES a `message`
  // key and it is usually null, so "nothing to say" arrives both ways.
  console[LOGLEVEL_TO_CONSOLE_LOG_METHOD[level]](
    `[db] ${diagnostics}${message === undefined || message === null ? '' : ` | msg=${quotedText(message)}`}`,
  )
  return diagnostics
}

/**
 * **Build an envelope for a failure the database didn't envelope itself** — a
 * raw Postgres error, or a reply no caller can read.
 *
 * Always `severity: fault`, because by construction nobody authored it. The
 * words are chosen HERE rather than when the fault is reported, so everything
 * downstream has an envelope and nothing downstream has to know what sort of
 * failure produced it.
 */
export function faultEnvelope(error: DbError, fallback: string, extra?: string): Envelope<never> {
  // Postgres's HINT is folded into `detail` rather than dropped. Our own raises
  // use HINT as an inter-function channel and never forward it — but a RAW
  // fault's hint is Postgres talking, and it is frequently the most useful
  // thing in the whole error ("Grant the required privileges to the current
  // role with: …"). The envelope has one debugging field, so it goes there.
  const parts = [error?.details, error?.hint, extra].filter(Boolean)
  const detail = parts.length ? parts.join(' — ') : undefined
  // EVERY KEY, null where there is nothing — the same nine an envelope from SQL
  // carries. It used to omit them, to match a SQL builder that stripped its own
  // nulls; neither does now, so that a caller never has to ask whether a key is
  // present before asking what it holds (Joel, 2026-08-28).
  return {
    type: 'not-ok',
    data: null,
    outcome: null,
    severity: 'fault',
    message: RAW_FAULT_TEXT[error?.code ?? ''] ?? error?.message ?? fallback,
    field: null,
    meta: null,
    dbcode: error?.code ?? null,
    detail: detail ?? null,
  }
}

/**
 * The envelope for a request that never completed — the one failure where the
 * server never spoke, so no author could have written for it.
 *
 * Which of the two sentences applies is decided here, at the point of failure,
 * for the same reason as above: downstream sees an envelope, not a taxonomy.
 */
export function environmentalEnvelope(offline: boolean, extra?: string): Envelope<never> {
  return {
    type: 'not-ok',
    data: null,
    outcome: null,
    severity: 'fault',
    message: offline ? ENVIRONMENTAL.offline : ENVIRONMENTAL.unreachable,
    field: null,
    meta: null,
    dbcode: null,
    detail: extra ?? null,
  }
}

/** What the LAYER THAT MADE THE REQUEST knows and the envelope cannot: which
 *  call it was, what the server answered, how long it took. `ms` matters more
 *  than it looks — an instant reject is a dead connection and a 30-second one is
 *  a timeout on a live connection, and they arrive with the same message. */
export type Transport = { call: string; status?: number; ms?: number }

/** The `[db]` fields for an envelope, merged with what the transport knows. */
function envelopeFields(t: Transport, envelope: Envelope): DiagFields {
  return {
    ...t,
    severity: envelope.type === 'not-ok' ? envelope.severity : undefined,
    outcome: envelope.outcome,
    dbcode: envelope.dbcode,
    field: envelope.type === 'not-ok' ? envelope.field : undefined,
    detail: envelope.detail,
  }
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
export function logDbOutcome(t: Transport, envelope: Envelope): void {
  const level: LogLevel =
    envelope.type === 'ok' ? 'OK'
    : envelope.severity === 'fault' ? 'FAULT'
    : SEVERITY_TO_LOGLEVEL[envelope.severity]
  logDb(level, envelopeFields(t, envelope), envelope.message)
}

/**
 * **Report a database failure**: write the `[db]` line, then put the modal up.
 *
 * It decides nothing. Whoever built the envelope already chose the words —
 * `faultEnvelope` for a raw Postgres error, `environmentalEnvelope` for a
 * request that never completed, the RPC's own author for a declared fault — so
 * there is one path here and no taxonomy of failure kinds to keep in step with
 * the envelope's own.
 *
 * Returns nothing: by the time the caller resumes, the news is delivered.
 */
export function reportDbFault(t: Transport, envelope: Envelope): void {
  const text = envelope.type === 'not-ok' ? envelope.message : 'Something went wrong.'
  const diagnostics = logDb('FAULT', envelopeFields(t, envelope), text)
  showFaultModal({ text, diagnostics })
}

/**
 * Is this parsed response body one of our envelopes?
 *
 * Deliberately strict, because plenty of things that are not envelopes arrive
 * on this path — a bare string, a number, a row array — and every one of them
 * must fall through cleanly rather than be half-read as one.
 */
export function isEnvelope(body: unknown): body is Envelope {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const t = (body as { type?: unknown }).type
  return t === 'ok' || t === 'not-ok'
}

// ─────────────────────────────────────────────────────────────
// The read wrapper
// ─────────────────────────────────────────────────────────────

/** The `{ data, error }` a PostgREST query builder resolves to. Structural, so
 *  a schema-scoped builder satisfies it without importing its generics. */
type QueryLike<T> = PromiseLike<{ data: T | null; error: DbError }>

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
): Promise<Envelope<T>> {
  const started = performance.now()
  const { data, error } = await callEdgeFn(fnName, body)
  const t = {
    call: `POST /functions/v1/${fnName}`,
    status: error?.status ?? 200,
    ms: Math.round(performance.now() - started),
  }
  if (error) {
    // Either the function never ran, or it answered in a shape from before the
    // conversion. Both are faults; `callEdgeFn` has already recovered whatever
    // message there was.
    const envelope = faultEnvelope(error, 'The request never reached the server.')
    reportDbFault(t, envelope)
    return envelope
  }
  if (!isEnvelope(data)) {
    const rawBody = `rawBody: ${JSON.stringify(data)?.slice(0, 120)}`
    const unreadable = faultEnvelope(null, 'The server answered with an unreadable result.', rawBody)
    reportDbFault(t, unreadable)
    return unreadable
  }
  if (data.type === 'not-ok' && data.severity === 'fault') {
    reportDbFault(t, data)
  } else {
    logDbOutcome(t, data)
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
export async function runRpc<T>(call: PromiseLike<{ data: unknown; error: DbError }>): Promise<Envelope<T>> {
  // Timed here because `dbFetch` stays quiet on an RPC's 2xx — the answer
  // inside it is this function's to read, and one line per call beats a `OK`
  // sitting above a `FAULT` about the same request. So this line carries the
  // duration as well as the meaning.
  const started = performance.now()
  let settled: { data: unknown; error: DbError }
  try {
    settled = await call
  } catch (thrown) {
    return faultEnvelope(thrown as DbError, 'The request never reached the server.')
  }
  const t = { call: callLabel(call, 'rpc'), status: 200, ms: Math.round(performance.now() - started) }
  if (settled.error) return faultEnvelope(settled.error, 'The server refused the request.')
  const body = settled.data
  // A reply that isn't an envelope means the RPC answered with something no
  // caller can read — an unconverted shape, or a null from a branch that never
  // decided. Neither is actionable, and both are bugs rather than play, so it
  // becomes a fault in the same shape as any other.
  if (!isEnvelope(body)) {
    const rawBody = `rawBody: ${JSON.stringify(body)?.slice(0, 120)}`
    const unreadable = faultEnvelope(null, 'The server answered with an unreadable result.', rawBody)
    reportDbFault(t, unreadable)
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
  if (body.type === 'not-ok' && body.severity === 'fault') {
    reportDbFault(t, body)
  } else {
    logDbOutcome(t, body)
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
export async function readRows<Row>(query: QueryLike<Row[]>): Promise<Envelope<Row[]>> {
  let settled: { data: Row[] | null; error: DbError }
  try {
    settled = await query
  } catch (thrown) {
    // A rejected fetch: `dbFetch` already logged it and put the modal up, and
    // then re-threw. postgrest-js normally converts that into an `error`, but
    // catching here means a throw from any layer lands in the same place.
    return faultEnvelope(thrown as DbError, 'The request never reached the server.')
  }
  if (settled.error) return faultEnvelope(settled.error, 'The read failed.')
  // `null` collapses to `[]`: PostgREST returns null rather than an empty array
  // in some shapes, and "no rows" is one answer, not two.
  return {
    type: 'ok',
    data: settled.data ?? [],
    outcome: null,
    severity: null,
    field: null,
    message: null,
    meta: null,
    dbcode: null,
    detail: null,
  }
}
