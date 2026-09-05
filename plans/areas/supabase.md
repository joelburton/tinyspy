# Area: supabase

The folders it reads: `supabase`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN (2026-09-05).**

## The roster

Agreed 2026-09-05 — every file of `src/common/supabase/`, plus the two Deno
files that carry the same envelope on the server side of the wire:

| file | what it is | stamp |
|---|---|---|
| `src/common/supabase/supabase.ts` | the client | `cs-met-supabase` |
| `src/common/supabase/db.ts` | the DB handle | `cs-met-supabase` |
| `src/common/supabase/envelope.ts` | the envelope shape; Deno imports it too | `cs-met-supabase` |
| `src/common/supabase/dbEnvelope.ts` | envelope-side helpers | `cs-met-supabase` |
| `src/common/supabase/dbResult.ts` | the wrappers — `runRpc`, `readRows`, `runEdgeFn` | `cs-met-supabase` |
| `src/common/supabase/dbResult.test.ts` | their contract | `cs-met-supabase` |
| `src/common/supabase/dbFetch.ts` | the fetch layer under the wrappers | `cs-met-supabase` |
| `src/common/supabase/dbFetch.test.ts` | its contract | `cs-met-supabase` |
| `src/common/supabase/edgeFnTransport.ts` | the edge-function transport | `cs-met-supabase` |
| `src/common/supabase/edgeFnTransport.test.ts` | its contract | `cs-met-supabase` |
| `src/common/supabase/dbLog.ts` | the `[db]` console line | `cs-met-supabase` |
| `supabase/functions/_shared/envelope.ts` | the Deno envelope builders | `cs-met-supabase` |
| `supabase/functions/_shared/dbResult.ts` | the Deno `runRpc` | `cs-met-supabase` |
| `src/common/supabase/doc.md` | lede at open: the client, the DB handle, and the wrappers. No Design | (no stamp — markdown) |
| `src/common/supabase/todo.md` | empty under all four headings at open | (no stamp — markdown) |

**Decided at the opening, and why:**

- **`faults/` is out.** The `common-hosts` row already names it, so the fault
  sink's store and modal are read there. The areas-table sentence saying the
  sink's function is read here is superseded by this.
- **`common.sql` is out; two of its functions are evidence.** `common.ok_envelope`
  and `common.raised_envelope` are read here because they are the SQL half of
  the envelope, but the file holds everything common and a stamp is per file.
  Where `common.sql` gets a row is an open question for the areas table.
- **`docs/supabase.md` and `docs/envelopes.md` are evidence, not roster.** Both
  stay as they are; they get reconciled later, not now. A forward fix to either
  happens only where a claim is directly about this folder's files. The area's
  own doc is the folder's `doc.md`.
- `supabase/functions/_shared/http.ts` and `startGame.ts` were not placed; they
  sit in the same folder as the two mirrors and belong to no row yet.

## Findings

*(`F-supabase-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to the folder's `doc.md`
or `todo.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
