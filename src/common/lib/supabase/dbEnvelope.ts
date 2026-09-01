// cs-unmet

import { showFaultModal } from '../fault/faultStore'
import { logDb, type DiagFields, type Transport } from './dbLog'
import type { Envelope, NotOk } from './envelope'

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
 * **Why the messages differ too.** They used to be two generic sentences, on
 * the rule that an environmental failure cannot tell you whether your move
 * landed — so it must not claim, and "refresh and try again" is the instruction
 * because refreshing reveals the real state before a retry can double-apply.
 * That rule survives; what changed is that we CAN say which of these happened,
 * and telling a player their network is at fault when our own upstream is down
 * sends them to fix a router that is working (Joel, 2026-08-31).
 */
export const NO_ANSWER_TO_CODE_AND_TEXT = {
  /** Nothing answered and the device already knew — `navigator.onLine` false.
   *  That ends the investigation. */
  offline: {
    code: 'FE001',
    text: 'You appear to be offline. Please refresh and try again.',
  },
  /** Nothing answered and the device thought it was connected: DNS, TLS, a
   *  refused connection, a socket that died. We know no more than that. */
  unreachable: {
    code: 'FE002',
    text: "You appear online, but the server didn't answer. Please refresh and try again.",
  },
  /** A non-2xx whose body PARSED but carried no SQLSTATE — Kong's own
   *  `{"message":"no Route matched…"}`, or any platform layer answering for us.
   *  Our gateway is up; the thing behind it is not — which is not a sentence a
   *  player needs. They need "our server is down"; the gateway's own words go
   *  to `detail`. "Later" as well as "refresh", because refreshing does not fix
   *  an upstream outage — but it is still what reveals whether the last move
   *  landed. */
  upstreamDown: {
    code: 'FE003',
    text: 'Our server appears to be down. Please refresh and try again later.',
  },
  /** A non-2xx on `/rest/v1/` whose body would not parse. PostgREST always
   *  speaks JSON, so a non-JSON body there means something that is NOT
   *  PostgREST answered — a captive portal, a proxy, an ISP error page. The one
   *  case where something IS on the player's side of the wire to check. */
  foreignResponder: {
    code: 'FE004',
    text: 'You reached a server other than ours. Please check your network connection.',
  },
} as const

/**
 * **Is this one of the four?** — the question a call site asks when it wants to
 * treat "our server did not answer" as one thing.
 *
 * It exists so that nothing has to enumerate the codes at a call site, and
 * because the alternative it replaced was worse: `useGameTimer` used to ask
 * `dbcode === null`, which was true for these AND for every bug the frontend
 * detects, since none of them carried a code at all. That is the whole reason
 * these codes exist.
 */
export function isEnvironmental(dbcode: string | null): boolean {
  return (
    dbcode !== null
    && Object.values(NO_ANSWER_TO_CODE_AND_TEXT).some((s) => s.code === dbcode)
  )
}


/**
 * **The bugs the frontend catches, as `PN` codes.**
 *
 * `PN`, not a class of their own, because the letter says what the code does to
 * `type` — `PA` becomes `ok`, `PN` becomes `not-ok` — and never who authored
 * it. That sequence already spans SQL raises and 64 Deno ones; TypeScript is a
 * third author of the same thing, and a call site testing `dbcode === 'PN307'`
 * does not care which layer noticed.
 *
 * All four are OURS, which is why every message opens `BUG:`. They are the
 * failures where something answered and the answer was wrong — as against the
 * `FE` codes above, where our server did not answer at all.
 */
export const OUR_BUG_TO_CODE_AND_TEXT = {
  /** A 2xx whose body is not one of our envelopes — an unconverted RPC, or a
   *  `null` from a branch that never decided. */
  unreadable: {
    code: 'PN307',
    text: 'BUG: an RPC answered with something no caller can read',
  },
  /** An `ok` carrying a message with no outcome. The type system rules this out
   *  at every TypeScript site that builds an envelope, so only a Deno JSON
   *  literal can reach it. */
  noOutcome: {
    code: 'PN308',
    text: 'BUG: an ok carried a message with no outcome',
  },
  /** `readRows` pointed at something that answers with a value, not rows — a
   *  `returns setof`, or a cast. */
  notRows: {
    code: 'PN309',
    text: 'BUG: a table read did not answer with rows',
  },
  /** The edge RUNTIME answered instead of the function — `Function not found`
   *  in `text/plain`, or a container that will not boot. Ours: a deploy
   *  failure, not a network one.
   *
   *  A captive portal intercepts everything, so a portal on a function call
   *  lands here too and blames us for a network problem. That is the safe
   *  direction to be wrong in, and the log corrects it: a portal produces
   *  `FE004`s on the concurrent `/rest/v1/` traffic at the same moment. */
  runtimeNotFunction: {
    code: 'PN310',
    text: 'BUG: the edge-function runtime answered instead of the function',
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
 * `ourCode` is what the envelope carries when the ERROR has none of its own —
 * because there is no error at all (a reply we could not read), or because what
 * failed was not Postgres. Postgres's own SQLSTATE always wins when there is
 * one: it is the more specific answer. Without this an envelope the frontend
 * built carried `dbcode: null`, and a call site that needed to tell one from
 * another had to identify it by an ABSENCE — true for reasons its condition
 * could not state, and false the day a new one was added.
 */
export function faultEnvelope(
  error: DbError,
  fallback: string,
  extra?: string,
  ourCode?: string,
): NotOk {
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
    dbcode: error?.code || ourCode || null,
    detail: detail ?? null,
  }
}

/**
 * **The envelope for a failure where OUR SERVER did not answer** — one of the
 * four `FE` codes, whichever the caller identified.
 *
 * **This is the only place any of those sentences is chosen**, which is the
 * whole point of it existing. `dbFetch` calls it to word the modal; the three
 * wrappers call it to word the envelope a call site reads. They used to answer
 * separately — `dbFetch` here and the wrappers via `faultEnvelope`, which
 * reaches for `error.message` and so handed back the browser's `"TypeError:
 * Failed to fetch"`. A player then got a modal and a pill disagreeing about one
 * event.
 *
 * `detail` is where the browser's string belongs: it is the only thing that
 * separates a dead socket from a TLS failure or a DNS miss, and it is worth
 * keeping — just not as the sentence a player reads.
 */
export function environmentalEnvelope(
  situation: { code: string; text: string },
  detail?: string,
): NotOk {
  return {
    type: 'not-ok',
    data: null,
    outcome: null,
    severity: 'fault',
    message: situation.text,
    field: null,
    meta: null,
    dbcode: situation.code,
    detail: detail ?? null,
  }
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
export function nothingReachedUs(detail?: string): NotOk {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  const { offline: OFFLINE, unreachable: UNREACHABLE } = NO_ANSWER_TO_CODE_AND_TEXT
  return environmentalEnvelope(offline ? OFFLINE : UNREACHABLE, detail)
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
 *
 * Takes the NOT-OK ARM, not the union. Every caller has already established
 * `severity: 'fault'` before reaching here, and typing the parameter wider than
 * the truth forced a fallback sentence ("Something went wrong.") for a case no
 * caller can produce — a string that read like a considered choice and was
 * really an artifact of the signature.
 */
export function reportDbFault(transport: Transport, envelope: NotOk): void {
  const diagnostics = logDb('FAULT', envelopeFields(transport, envelope), envelope.message)
  showFaultModal({ text: envelope.message, diagnostics })
}
