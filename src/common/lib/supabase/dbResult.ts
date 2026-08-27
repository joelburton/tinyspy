// cs-unmet

import { showFaultModal } from '../fault/faultStore'
import type { Outcome } from '../outcomes'
import { logStamp } from './realtimeDiag'

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
 *     ok                    use `data`
 *     not-ok / validation   show `message` on the form's own error line
 *     not-ok / error        show `message` in a pill; wait and retry
 *     not-ok / fault        nothing to do — the modal is already up
 *
 * Faults are presented centrally (`reportDbFault`, called from `dbFetch`), so
 * no call site classifies a failure, words a network problem, or reaches for
 * `showFaultModal` itself. Most callers never test `severity` at all: they bail
 * on anything that isn't `ok`, and only a form that shows validation text needs
 * to look closer.
 */

// ─────────────────────────────────────────────────────────────
// The shapes
// ─────────────────────────────────────────────────────────────


/** How bad a `not-ok` is. A `fault` still arrives — one shape, always — but the
 *  modal is already up by then, so a call site has nothing to render for it. */
export type Severity = 'fault' | 'validation' | 'error'

/**
 * **The envelope** — the one shape everything travels in.
 *
 * An RPC returns it. When the database did NOT give us one — a raw Postgres
 * error, a request that never completed, a direct table read — we construct one
 * in the same shape, so a call site has a single thing to read no matter what
 * happened. There is no second type and no special arm: if it reached the
 * frontend, it is an envelope.
 */
export type Envelope<T = unknown> =
  | {
      type: 'ok'
      /** The payload. */
      data: T
      /** How it reads on screen. */
      outcome?: Outcome
      /** Optional here, because plenty of results have nothing to say. */
      message?: string
      /** The additive slot: SQL can leave breadcrumbs with no frontend change. */
      meta?: Record<string, unknown>
      /** The SQLSTATE, when the outcome came from a raise. Named `dbcode`
       *  because "code" is too broad for one specific thing. */
      dbcode?: string
      /** PL/pgSQL's DETAIL — the debugging line, never shown to a player. */
      detail?: string
    }
  | {
      type: 'not-ok'
      severity: Severity
      message: string
      meta?: Record<string, unknown>
      dbcode?: string
      detail?: string
    }

// ─────────────────────────────────────────────────────────────
// The environmental messages
// ─────────────────────────────────────────────────────────────

/**
 * The whole frontend-authored message table — everything the server never got
 * to speak for.
 *
 * **Generic, and naming no action, on purpose.** A dropped connection cannot
 * tell you whether the move landed — the link can die on the way BACK, after
 * the write committed. So a sentence like "Your guess didn't send" would be a
 * confident false statement in the one moment a player most needs the truth.
 *
 * "Refresh and try again" is the right instruction for the same reason —
 * refreshing reveals the real state before a retry can double-apply.
 *
 * Which call it was rides in the diagnostics line instead, where `dbFetch`
 * already puts the method and path.
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

/** The k=v diagnostics line — the same string the `[db]` console line carries
 *  and the fault modal's third line shows. One builder so the screen and the
 *  log can never drift. */
function faultDiagnostics(where: string, bits: Record<string, unknown>): string {
  const parts = Object.entries(bits)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${typeof v === 'string' && v.includes(' ') ? `"${v}"` : v}`)
  return `${where} — ${parts.join(' ')} — ${logStamp()}`
}

/**
 * **Report a database failure**, from the seam. Called by `dbFetch` for the
 * three things a call site has no opinion about: the fetch never completed, the
 * response was a raw Postgres error, or the body was one of our declared
 * faults.
 *
 * Three steps, which is why it is a REPORT rather than a show: it picks the
 * words for the kind of failure this is, builds the `k=v` diagnostics line, and
 * only then hands both to `showFaultModal` for the modal. It also writes the
 * `[db] … FAULT` console line, so the screen and the log always say the same
 * thing.
 *
 * Returns nothing — by the time the caller resumes, the news is delivered.
 */
export function reportDbFault(args: {
  where: string
  kind: 'offline' | 'unreachable' | 'raw' | 'declared'
  error?: DbError
  envelope?: Envelope
  extra?: Record<string, unknown>
}): void {
  const { where, kind, error, envelope, extra } = args

  const text =
    kind === 'offline' ? ENVIRONMENTAL.offline
      : kind === 'unreachable' ? ENVIRONMENTAL.unreachable
        : kind === 'declared' ? (envelope?.message ?? 'Something went wrong.')
          : (RAW_FAULT_TEXT[error?.code ?? ''] ?? error?.message ?? 'Something went wrong.')

  const diagnostics = faultDiagnostics(where, {
    kind,
    dbcode: envelope?.dbcode ?? error?.code,
    detail: envelope?.detail ?? error?.details ?? undefined,
    hint: error?.hint ?? undefined,
    ...extra,
  })

  console.error(`[db] ${logStamp()} FAULT on ${where}: ${text} (${diagnostics})`)
  showFaultModal({ text, diagnostics })
}

/**
 * **Build an envelope for a failure the database didn't envelope itself** — a
 * raw Postgres error, or a request that never completed.
 *
 * Always `severity: fault`, because by construction nobody authored it. The
 * seam has already presented and logged it; this exists so the call site still
 * receives the one shape rather than a special case.
 */
export function faultEnvelope(error: DbError, fallback: string, extra?: string): Envelope<never> {
  // Postgres's HINT is folded into `detail` rather than dropped. Our own raises
  // use HINT as an inter-function channel and never forward it — but a RAW
  // fault's hint is Postgres talking, and it is frequently the most useful
  // thing in the whole error ("Grant the required privileges to the current
  // role with: …"). The envelope has one debugging field, so it goes there.
  const parts = [error?.details, error?.hint, extra].filter(Boolean)
  const detail = parts.length ? parts.join(' — ') : undefined
  return {
    type: 'not-ok',
    severity: 'fault',
    message: error?.message ?? fallback,
    // Absent keys rather than keys holding `undefined`, so an envelope we build
    // has the same shape as one from SQL — which strips its nulls
    // (`jsonb_strip_nulls`). Otherwise the two would compare unequal over
    // fields neither of them has.
    ...(error?.code ? { dbcode: error.code } : {}),
    ...(detail ? { detail } : {}),
  }
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
 * **Run an RPC and hand back its envelope.**
 *
 * The RPC's own envelope passes through untouched. When there isn't one — the
 * call errored, never completed, or answered with something unreadable — one is
 * built in the same shape, so a caller has a single thing to read either way.
 *
 *     const r = await runRpc<Word[]>(db.rpc('anagrams', { letters }))
 *     if (r.type !== 'ok') {
 *       setError(r.severity === 'validation' ? r.message : null)
 *       return
 *     }
 *     setResults(r.data)
 */
export async function runRpc<T>(call: PromiseLike<{ data: unknown; error: DbError }>): Promise<Envelope<T>> {
  let settled: { data: unknown; error: DbError }
  try {
    settled = await call
  } catch (thrown) {
    return faultEnvelope(thrown as DbError, 'The request never reached the server.')
  }
  if (settled.error) return faultEnvelope(settled.error, 'The server refused the request.')
  const body = settled.data
  // A reply that isn't an envelope means the RPC answered with something no
  // caller can read — an unconverted shape, or a null from a branch that never
  // decided. Neither is actionable, and both are bugs rather than play, so it
  // becomes a fault in the same shape as any other.
  if (!isEnvelope(body)) {
    const rawBody = `rawBody: ${JSON.stringify(body)?.slice(0, 120)}`
    reportDbFault({
      where: 'rpc',
      kind: 'raw',
      error: { message: 'The server answered with an unreadable result.' },
      extra: { rawBody },
    })
    // No `dbcode` to carry — the call SUCCEEDED (a 200 with an unreadable
    // body), so there is no Postgres error. What we do know is the body, and
    // it goes into `detail` rather than living only in the console line.
    return faultEnvelope(null, 'The server answered with an unreadable result.', rawBody)
  }
  return body as Envelope<T>
}

/**
 * **Run a direct table read and hand back an envelope.**
 *
 * A read never produces one of its own — an envelope carries an authored
 * judgment about a move, and a read has no move to judge. Its only outcomes are
 * rows, an error, or silence, and none of those needs a person to have written
 * anything. So one is built here, in the same shape as an RPC's, and every call
 * site branches alike whatever it called.
 *
 * **Zero rows is `ok`, deliberately.** At the protocol level an empty result is
 * a correct answer, and the database has no opinion about whether your read
 * *should* have found something. Only the caller knows that. So an invariant
 * like "every profile has a solo club" stays a check at the call site, with its
 * sentence written there — the same rule as the RPC side, with the frontend as
 * author because the frontend is what knows the invariant.
 *
 * A failure is always `severity: fault` and never anything else: a read can't
 * produce a validation error (nothing was submitted to validate) or a
 * wait-and-retry. By then the modal is already up, because `dbFetch` presented
 * it at the seam — so a call site's only job is to stop showing a stale answer.
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
  return { type: 'ok', data: settled.data ?? [] }
}
