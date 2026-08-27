import { presentFault } from '../fault/faultStore'
import { logStamp } from './realtimeDiag'

/**
 * **The new server-result system.** Types, classification, the environmental
 * sentences, and the read wrapper — all of it, in one file on purpose.
 *
 * See `plans/error-system.md` for the design. The one-line version: a call
 * either reaches a decision and says what it was, or something is broken, and
 * a call site should never have to work out which.
 *
 * ─── What a call site sees ───────────────────────────────────
 * Exactly three things, and it has an opinion about all three:
 *
 *     ok               use the data
 *     validation       show `message` on the form's own error line
 *     error            show `message` in a pill; wait and retry
 *
 * It never sees a fault. Faults — ours, Postgres's, and the network's — are
 * presented centrally (see `presentDbFault` below, called from `dbFetch`), so
 * no call site classifies a failure, words a network problem, or reaches for
 * `presentFault` itself. What remains at a call site is a bail-out: notice you
 * didn't get data so you can clear a `busy` flag or unwind an optimistic write.
 */

// ─────────────────────────────────────────────────────────────
// The shapes
// ─────────────────────────────────────────────────────────────

/** How an `ok` result reads on screen. This is `GenericFeedbackTone` minus
 *  `error`: a real failure is a `not-ok` now and carries a `severity` instead,
 *  so `error` can never be an outcome. That is the line games.ts says isn't
 *  drawn yet, drawn structurally rather than by judgment. */
export type Outcome = 'won' | 'lost' | 'near' | 'warning' | 'neutral' | 'noted'

/** How bad a `not-ok` is. `fault` never reaches a call site — it is presented
 *  centrally — so a caller only ever branches on the other two. */
export type Severity = 'fault' | 'validation' | 'error'

/**
 * **What the database returns** — the JSONB an RPC hands back.
 *
 * Only an RPC produces one. A direct table read never does; `readRows` below
 * synthesizes the *call-site shape* for reads so every caller branches alike,
 * but no database returned it. Keep the two words apart: the ENVELOPE comes off
 * the wire, the CALL-SITE SHAPE is what a caller sees.
 */
export type Envelope = {
  type: 'ok' | 'not-ok'
  /** Required on `not-ok`; optional on `ok`, because plenty of results have
   *  nothing to say — a concede, an ordinary accepted move whose pill is built
   *  from `outcome` and `data`. */
  message?: string
  /** The additive slot. SQL can start leaving breadcrumbs here with no frontend
   *  change, which is why test assertions use containment, not equality. */
  meta?: Record<string, unknown>
  /** The SQLSTATE, when the outcome came from a raise. Named `dbcode` because
   *  "code" is too broad a word for one specific thing. A plain success that
   *  never raised has none. */
  dbcode?: string
  /** PL/pgSQL's DETAIL — the debugging line, never shown to a player. It rides
   *  along rather than being stripped: one shape all the way through is simpler
   *  than deciding per-field who deserves what. */
  detail?: string
  outcome?: Outcome
  data?: unknown
  severity?: Severity
}

/** What a call site branches on. `fault` is absent by construction: it was
 *  presented centrally before the caller resumed. */
export type DbResult<T> =
  | { type: 'ok'; data: T; outcome?: Outcome; message?: string; meta?: Record<string, unknown> }
  | { type: 'not-ok'; severity: 'validation' | 'error'; message: string }
  /** The call failed and a fault modal is already on screen. Nothing to render;
   *  unwind local state and return. */
  | { type: 'faulted' }

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
export function isOurCode(code: string | undefined | null): boolean {
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
 * **Present a fault, from the seam.** Called by `dbFetch` for the three things
 * a call site has no opinion about: the fetch never completed, the response was
 * a raw Postgres error, or the body was one of our declared faults.
 *
 * Logs at `console.error` and puts the modal up. Returns nothing — by the time
 * the caller resumes, the news has already been delivered.
 */
export function presentDbFault(args: {
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
  presentFault({ text, diagnostics })
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
 * **Run a direct table read and hand back the call-site shape.**
 *
 * A read is not an RPC and gets no envelope: an RPC has an authored judgment to
 * report and a read does not. Its only outcomes are rows, an error, or silence,
 * and none of those need a person to have written anything. So this synthesizes
 * the shape instead, and every call site — read or RPC — branches alike.
 *
 * **Zero rows is `ok`, deliberately.** At the protocol level an empty result is
 * a correct answer, and the server has no opinion about whether your read
 * *should* have found something. Only the caller knows that, so an invariant
 * like "every profile has a solo club" is a check at the call site with its
 * sentence written there.
 *
 * The failure arm is `faulted` and nothing else: a read cannot produce a
 * validation error or a wait-and-retry, and the modal is already up by the time
 * this returns, because `dbFetch` presented it at the seam.
 *
 *     const r = await readRows(db.from('clubs').select('handle, name'))
 *     if (r.type !== 'ok') { setLoad('failed'); return }
 *     setClubs(r.data)
 */
export async function readRows<Row>(query: QueryLike<Row[]>): Promise<DbResult<Row[]>> {
  let settled: { data: Row[] | null; error: DbError }
  try {
    settled = await query
  } catch {
    // A rejected fetch: `dbFetch` already logged it and put the modal up, and
    // then re-threw. postgrest-js normally converts that into an `error`, but
    // catching here means a throw from any layer lands in the same place.
    return { type: 'faulted' }
  }
  if (settled.error) return { type: 'faulted' }
  // `null` collapses to `[]`: PostgREST returns null rather than an empty array
  // in some shapes, and "no rows" is one answer, not two.
  return { type: 'ok', data: settled.data ?? [] }
}
