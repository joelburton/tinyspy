// cs-unmet

import { showFaultModal } from '../fault/faultStore'
import { logDb, type DiagFields, type Transport } from './dbLog'
import type { Envelope } from './envelope'

/**
 * **Building an envelope for a failure that never had one, and presenting it.**
 *
 * The database answers in an envelope; when it could not — a raw Postgres
 * error, a request that never completed — one is built here, in the same shape,
 * so nothing downstream has to know which sort of failure produced it.
 *
 * Sits between `dbLog` and its two consumers. `dbFetch` calls these to word and
 * show a transport failure; `dbResult`'s wrappers call the same builders for
 * the same failures, which is the whole point — two authors of one sentence is
 * how the modal and the pill came to disagree (plans/envelope-layering.md).
 */

/** The `{code, message, details, hint}` shape PostgREST returns for an error.
 *  Structural, so a PostgrestError or a hand-built object both satisfy it. */
export type DbError = {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
} | null | undefined

/**
 * The whole frontend-authored message table — the two sentences for a failed JS
 * fetch, which is everything the server never got to speak for.
 *
 * Both are generic and name no action, and that is a correctness rule rather
 * than a style: docs/envelopes.md → The environmental sentences.
 */
const ENVIRONMENTAL_TO_TEXT = {
  offline: 'You appear to be offline. Please refresh and try again.',
  unreachable: "The server didn't answer. Please refresh and try again.",
} as const

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
    message: error?.message ?? fallback,
    field: null,
    meta: null,
    dbcode: error?.code ?? null,
    detail: detail ?? null,
  }
}

/**
 * **The envelope for a request nothing answered** — the one failure where the
 * server never spoke, so no author could have written for it.
 *
 * **This is the only place either sentence is chosen**, which is the whole point
 * of it existing. `dbFetch` calls it to word the modal; the three wrappers call
 * it to word the envelope a call site reads. They used to answer separately —
 * `dbFetch` here and the wrappers via `faultEnvelope`, which reaches for
 * `error.message` and so handed back the browser's `"TypeError: Failed to
 * fetch"`. A player then got a modal and a pill disagreeing about one event.
 *
 * It reads `navigator.onLine` ITSELF rather than taking a boolean. Two callers
 * asking the same global and passing the answer in is two chances to ask it
 * differently, and the value is ambient — reading it here is reading it at the
 * same moment either way.
 *
 * `detail` is where the browser's string belongs: it is the only thing that
 * separates a dead socket from a TLS failure or a DNS miss, and it is worth
 * keeping — just not as the sentence a player reads.
 */
export function environmentalEnvelope(detail?: string): Envelope<never> {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  return {
    type: 'not-ok',
    data: null,
    outcome: null,
    severity: 'fault',
    message: offline ? ENVIRONMENTAL_TO_TEXT.offline : ENVIRONMENTAL_TO_TEXT.unreachable,
    field: null,
    meta: null,
    dbcode: null,
    detail: detail ?? null,
  }
}

/** The `[db]` fields for an envelope, merged with what the transport knows. */
export function envelopeFields(transport: Transport, envelope: Envelope): DiagFields {
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
    outcome: envelope.outcome,
    dbcode: envelope.dbcode,
    field: envelope.type === 'not-ok' ? envelope.field : undefined,
    // `null` rather than `''` when neither said anything, so it prints like
    // every other empty field.
    detail: details.length ? details.join(' — ') : null,
  }
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
export function reportDbFault(transport: Transport, envelope: Envelope): void {
  const text = envelope.type === 'not-ok' ? envelope.message : 'Something went wrong.'
  const diagnostics = logDb('FAULT', envelopeFields(transport, envelope), text)
  showFaultModal({ text, diagnostics })
}
