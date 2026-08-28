// cs-unmet

/**
 * THE ENVELOPE, WRITTEN IN DENO — the same result shape `common.ok_envelope`
 * and `common.raised_envelope` build in SQL (plans/error-system.md), for the
 * refusals an edge function decides on its own.
 *
 * Everything here answers **200**, faults included, and that is the whole point.
 * The HTTP status says whether the function RAN — not what it decided. A
 * function that answers 400 for "that difficulty has no buildable board" is
 * making the status carry two unrelated jobs, and the frontend then can't tell
 * a refusal it should show under a field from a container that never woke up.
 * `runEdgeFn` reads the envelope for the verdict and the status for nothing but
 * "did this reach the function at all".
 *
 * **Every builder is TYPED as `Envelope`, and writes all nine keys out.**
 * Neither is decoration:
 *
 *   - The type comes from `src/common/lib/supabase/envelope.ts`, the same one
 *     the frontend uses. Deno can reach that file because it holds a type and
 *     nothing else; `dbResult.ts` would drag in the browser client.
 *   - The keys are spelled out at each call rather than spread from a shared
 *     `EMPTY` constant. A spread compiles forever: add a tenth key and every
 *     builder here keeps working while silently omitting it — which is the
 *     ambiguity required keys exist to prevent, since "considered and left
 *     null" would again be indistinguishable from "never considered". Written
 *     out, a new key is a compile error at each of these four and somebody has
 *     to decide what it holds (Joel, 2026-08-28).
 *
 * The three strings a refusal carries are spelled `dbcode` / `severity` /
 * `field` here where SQL spells them `errcode` / `hint` / `column`. Same
 * sequence of numbers, though — `src/guards/raiseCodes.test.ts` reads both
 * sources together so a code allocated in Deno can't collide with a raise.
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
export const validation = (
  dbcode: string,
  field: string,
  message: string,
  detail?: string,
): Response =>
  json({
    type: 'not-ok',
    data: null,
    outcome: null,
    severity: 'validation',
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
export const environmental = (dbcode: string, message: string, detail?: string): Response =>
  json({
    type: 'not-ok',
    data: null,
    outcome: null,
    severity: 'error',
    message,
    field: null,
    meta: null,
    dbcode,
    detail: detail ?? null,
  } satisfies Envelope)

/**
 * The catch-all: an exception nobody expected, wrapped so even a crash comes
 * back envelope-shaped rather than as a bare 500 the frontend can only guess at.
 * The raw message rides as the detail — it is for the log, and showing it
 * verbatim in the fault modal is right, because it announces "bug".
 */
export const crash = (fnName: string, e: unknown): Response =>
  fault(
    'PN111',
    'Something went wrong building the game.',
    `${fnName}: ${String(e instanceof Error ? e.message : e)}`,
  )
