// cs-unmet

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
 *     compile error at each of these four (Joel, 2026-08-28).
 *
 * The three strings are spelled `dbcode` / `severity` / `field` here where SQL
 * spells them `errcode` / `hint` / `column`. Same sequence of numbers, though —
 * `src/guards/raiseCodes.test.ts` reads both sources together so a code
 * allocated in Deno can't collide with a raise.
 */

import { json } from './http.ts'
import type { Envelope } from '../../../src/common/lib/supabase/envelope.ts'

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
 * A refusal nothing the player did explains: a value the form cannot produce, a
 * response shape that shouldn't exist, an environment that isn't there. Raises
 * the fault modal, and `detail` is the line the console audience reads.
 */
export const fault = (dbcode: string, message: string, detail?: string): Response =>
  json({
    type: 'not-ok',
    data: null,
    outcome: null,
    severity: 'fault',
    message,
    field: null,
    meta: null,
    dbcode,
    detail: detail ?? null,
  } satisfies Envelope)

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
