// cs-unmet

/**
 * THE ENVELOPE'S TYPE, and nothing else.
 *
 * Its own module because BOTH sides need it and only one of them can have
 * `dbResult.ts`: that file reaches the browser client and the fault store, so a
 * Deno edge function cannot import it. The type has no runtime at all, and
 * `outcomes.ts` — the one thing it depends on — imports nothing.
 *
 * Splitting it is what lets `supabase/functions/_shared/envelope.ts` be CHECKED
 * against the shape it builds, rather than assembling an object literal that
 * merely looks right. That matters for one specific reason: every key here is
 * required, so adding one is a compile error at every place that builds an
 * envelope. Without the check, a new key would arrive on the frontend's
 * builders and slip silently past Deno's — and the whole point of required keys
 * is that "considered and left null" cannot be confused with "never considered"
 * (Joel, 2026-08-28).
 */

import type { Outcome } from '../outcomes'

/**
 * What KIND of `not-ok` this is. Each meaning, and the default appearance each
 * carries, is in docs/envelopes.md → Severity.
 *
 *   fault            a bug, a broken server, or a request our FE didn't send
 *   race             the player lost a legitimate race
 *   form-validation  the form is invalid; the message belongs under a control
 *   service-error    something we depend on didn't answer
 *
 * A `fault` arrives like any other — one shape, always. Its modal has already
 * been raised centrally by the time a call site sees it, but the call site still
 * shows the `message`: the modal escalates, it does not replace.
 */
export type Severity = 'fault' | 'race' | 'form-validation' | 'service-error'

/**
 * **The envelope** — the one shape everything travels in.
 *
 * An RPC returns it. When the database did NOT give us one — a raw Postgres
 * error, a request that never completed, a direct table read — we construct one
 * in the same shape, so a call site has a single thing to read no matter what
 * happened. There is no second type and no special arm: if it reached the
 * frontend, it is an envelope.
 *
 * **Every key is always present, null where it has no value.** Nothing here is
 * optional in the "might not be there" sense, and that is the point: an envelope
 * has defined fields, so a caller reads one rather than first checking whether
 * it exists (Joel, 2026-08-28). The builders on both sides — `common.ok_envelope`
 * / `common.raised_envelope` in SQL, `faultEnvelope` and the `_shared/envelope.ts`
 * helpers here — emit the same nine keys.
 *
 * It also buys back a distinction a lookup needs. While SQL stripped its nulls,
 * `data: null` and no `data` key were the same JSON, so an RPC could not answer
 * "there is no next puzzle" as a VALUE. Now it can.
 */
export type Envelope<T = unknown> =
  | {
      type: 'ok'
      /** The payload. */
      data: T
      /** How it reads on screen. Never `error` in practice — a successful
       *  result does not read as a failure — which `raiseCodes.test.ts` pins on
       *  the SQL side, where the value is actually authored. */
      outcome: Outcome | null
      /** Always null on this arm — a severity belongs to a `not-ok`. It is
       *  declared because the WIRE carries it: nine keys travel whatever
       *  happened, so the type says nine. */
      severity: null
      /** Always null on this arm, for the same reason as `severity`. */
      field: null
      /** The player's sentence, or **null meaning "the frontend composes this
       *  one"** — because it needs a name and a color dot, a link, or local
       *  state. A server-written message may not say less than the sentence it
       *  replaces (docs/envelopes.md → Who writes the words, per answer). */
      message: string | null
      /** The additive slot: SQL can leave breadcrumbs with no frontend change. */
      meta: Record<string, unknown> | null
      /** The SQLSTATE, when the outcome came from a raise. Named `dbcode`
       *  because "code" is too broad for one specific thing. */
      dbcode: string | null
      /** PL/pgSQL's DETAIL — the debugging line, never shown to a player. */
      detail: string | null
    }
  | {
      type: 'not-ok'
      /** Always null on this arm — a `not-ok` carries no payload. Declared for
       *  the same reason `severity` is declared on the ok arm: the wire has
       *  nine keys either way. */
      data: null
      /** The appearance OVERRIDE. Null is the ordinary case and means "use the
       *  default this severity carries" — not "no appearance"
       *  (docs/envelopes.md → Appearance). */
      outcome: Outcome | null
      severity: Severity
      message: string
      /**
       * Which control a `form-validation` is about, from the raise's `COLUMN`.
       *
       *     'letters'   the message belongs under that field
       *     '_'         deliberately not about one field — the form's own line
       *     null        the raise didn't say; a SQL-side guard catches it
       *
       * `'_'` is a real value rather than a stand-in for nothing, and always
       * exactly one field: docs/envelopes.md → The keys. The form plumbing that
       * reads this isn't built yet.
       */
      field: string | null
      meta: Record<string, unknown> | null
      dbcode: string | null
      detail: string | null
    }
