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
      /** How it reads on screen. */
      outcome: Outcome | null
      /** Always null on this arm — a severity belongs to a refusal. It is
       *  declared because the WIRE carries it: nine keys travel whatever
       *  happened, so the type says nine. */
      severity: null
      /** Always null on this arm, for the same reason as `severity`. */
      field: null
      /** Null here, because plenty of results have nothing to say. */
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
      /** Always null on this arm — a refusal carries no payload. Declared for
       *  the same reason `severity` is declared on the ok arm: the wire has
       *  nine keys either way. */
      data: null
      outcome: null
      severity: Severity
      message: string
      /**
       * Which FIELD a `validation` is about, from the raise's `COLUMN`.
       *
       *     'letters'   the message belongs under that field
       *     '_'         deliberately not about one field — the form's own line
       *     absent      the raise didn't say; a SQL-side guard catches it
       *
       * `_` is a real value, not a stand-in for nothing: an author who decides
       * a validation isn't about one field says so, and that reads differently
       * from having forgotten. It is also the form-level key in the form's
       * error object, so the same string serves SQL, the envelope and the form
       * (plans/areas/forms.md → F48).
       *
       * Always exactly one field, because a raise stops at the first failure —
       * which makes server validation incremental the way a form already is,
       * and never wrong about whose fault it is.
       *
       * The form plumbing that reads this isn't built yet.
       */
      field: string | null
      meta: Record<string, unknown> | null
      dbcode: string | null
      detail: string | null
    }
