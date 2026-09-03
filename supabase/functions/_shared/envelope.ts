// cs-blessed-deep

/**
 * THE ENVELOPE, WRITTEN IN DENO — the same shape `common.ok_envelope` and
 * `common.raised_envelope` build in SQL, for what an edge function decides on
 * its own. The contract is docs/envelopes.md → How edge functions build one:
 * **everything here answers 200**, faults included, because the status says
 * whether the function RAN and the envelope says what it decided.
 *
 * **Every builder is TYPED as `Envelope`, and writes all nine keys out.**
 * Neither is decoration:
 *
 *   - The type comes from `src/common/lib/supabase/envelope.ts`, the same one
 *     the frontend uses. Deno can reach that file because it holds a type and
 *     nothing else; `dbResult.ts` would drag in the browser client.
 *   - The keys are spelled out at each call rather than spread from a shared
 *     `EMPTY` constant. A spread compiles forever: add a tenth key and every
 *     builder here keeps working while silently omitting it, so "considered and
 *     left null" becomes indistinguishable from "never considered" — the exact
 *     ambiguity required keys exist to prevent. Written out, a new key is a
 *     compile error at each of these four (Joel, 2026-08-28). `fault` is the
 *     one that delegates, to `faultEnvelope` — the compile error still lands,
 *     one line further down, and the alternative was writing the fault's nine
 *     keys twice so the inbound path could have them as a value.
 *
 * The three strings are spelled `dbcode` / `severity` / `field` here where SQL
 * spells them `errcode` / `hint` / `column`. Same sequence of numbers, though —
 * `src/guards/raiseCodes.test.ts` reads both sources together so a code
 * allocated in Deno can't collide with a raise.
 */

import { json } from './http.ts'
import type { Envelope } from '../../../src/common/lib/supabase/envelope.ts'

/**
 * **Is this an envelope?** — for a function that calls a converted RPC and
 * relays whatever it answers.
 *
 * Deliberately strict, like its frontend twin: plenty of things that are not
 * envelopes arrive on that path (a row array, a scalar, a `null` from a branch
 * that never decided), and each must fall through cleanly rather than be
 * half-read as one.
 *
 * **A type predicate, like that twin too.** Returning a bare `boolean` would
 * leave the caller's value `unknown` after the check, so the cast that follows
 * would be from `unknown` — which accepts anything, including the shapes this
 * function exists to reject. Narrowing means the cast only has to add `T`.
 */
export const isEnvelope = (body: unknown): body is Envelope =>
  !!body
  && typeof body === 'object'
  && !Array.isArray(body)
  && ((body as { type?: unknown }).type === 'ok'
    || (body as { type?: unknown }).type === 'not-ok')

/** The function answered, and here is what the caller asked for. */
export const ok = <T>(data: T): Response =>
  json({
    type: 'ok',
    data,
    outcome: null,
    severity: null,
    message: null,
    field: null,
    meta: null,
    dbcode: null,
    detail: null,
  } satisfies Envelope<T>)

/**
 * A refusal the PLAYER caused and can fix, routed to the field it is about —
 * the form puts the sentence under that control and turns it red.
 *
 * For a board-builder that means the narrow class the setup form cannot rule
 * out from the values alone: whether a board actually EXISTS at the chosen
 * settings. Anything the form's own controls already constrain is a fault, not
 * this — if the form prevents it and it arrives anyway, something is broken.
 */
export const formValidation = (
  dbcode: string,
  field: string,
  message: string,
  detail?: string,
): Response =>
  json({
    type: 'not-ok',
    data: null,
    outcome: null,
    severity: 'form-validation',
    message,
    field,
    meta: null,
    dbcode,
    detail: detail ?? null,
  } satisfies Envelope)

/**
 * A fault as a VALUE rather than a response — for `runRpc`, which hands its
 * caller an envelope to branch on instead of a `Response` to return blindly.
 *
 * It is the only builder here with a value form, and only because the inbound
 * path needs one: an edge function reading an RPC's answer has to be able to
 * ask "did this fail?" of the same object whether the failure was the RPC's or
 * the transport's. The outbound builders never need that — an edge function
 * that has decided something is done deciding.
 */
export const faultEnvelope = <T = unknown>(
  dbcode: string,
  message: string,
  detail?: string,
): Envelope<T> =>
  ({
    type: 'not-ok',
    data: null,
    outcome: null,
    severity: 'fault',
    message,
    field: null,
    meta: null,
    dbcode,
    detail: detail ?? null,
    // Generic in `T` although a not-ok carries `data: null` whatever T is: the
    // caller's `Envelope<T>` is one union, and a value has to be assignable to
    // the whole of it, not to the arm it happens to be in.
  } satisfies Envelope<T>)

/**
 * A refusal nothing the player did explains: a value the form cannot produce, a
 * response shape that shouldn't exist, an environment that isn't there. Raises
 * the fault modal, and `detail` is the line the console audience reads.
 */
export const fault = (dbcode: string, message: string, detail?: string): Response =>
  json(faultEnvelope(dbcode, message, detail))

/**
 * SOMETHING WE DEPEND ON DIDN'T ANSWER — an outside service down or refusing us.
 *
 * The narrowest of the three, and the one that is nobody's fault in either
 * direction: the player did nothing wrong and neither did we. NYT unreachable,
 * the Guardian timing out, a pasted cookie the site no longer accepts. It reads
 * as "try again later" rather than as a bug, and unlike a fault it does not
 * claim something is broken here.
 */
export const serviceError = (dbcode: string, message: string, detail?: string): Response =>
  json({
    type: 'not-ok',
    data: null,
    outcome: null,
    severity: 'service-error',
    message,
    field: null,
    meta: null,
    dbcode,
    detail: detail ?? null,
  } satisfies Envelope)

/* There is deliberately no `race` builder. A race needs shared state changing
 * underneath the player, and only a game has any — an edge function here builds
 * a board or asks a model a question, with nothing to lose a race against. If
 * one ever belongs here, that is worth looking at twice before adding it. */

/**
 * The catch-all: an exception nobody expected, wrapped so even a crash comes
 * back envelope-shaped rather than as a bare 500 the frontend can only guess at.
 * The raw message rides as the detail — it is for the log, and showing it
 * verbatim in the fault modal is right, because it announces "bug".
 */
export const crash = (fnName: string, e: unknown): Response =>
  fault(
    'PN111',
    `BUG: ${fnName} threw`,
    `${fnName}: ${String(e instanceof Error ? e.message : e)}`,
  )
