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
| `src/common/supabase/supabase.ts` | the client | `cs-audited-supabase` |
| `src/common/supabase/db.ts` | the DB handle | `cs-audited-supabase` |
| `src/common/supabase/envelope.ts` | the envelope shape; Deno imports it too | `cs-audited-supabase` |
| `src/common/supabase/dbEnvelope.ts` | envelope-side helpers | `cs-audited-supabase` |
| `src/common/supabase/dbResult.ts` | the wrappers — `runRpc`, `readRows`, `runEdgeFn` | `cs-audited-supabase` |
| `src/common/supabase/dbResult.test.ts` | their contract | `cs-audited-supabase` |
| `src/common/supabase/dbFetch.ts` | the fetch layer under the wrappers | `cs-audited-supabase` |
| `src/common/supabase/dbFetch.test.ts` | its contract | `cs-audited-supabase` |
| `src/common/supabase/edgeFnTransport.ts` | the edge-function transport | `cs-audited-supabase` |
| `src/common/supabase/edgeFnTransport.test.ts` | its contract | `cs-audited-supabase` |
| `src/common/supabase/dbLog.ts` | the `[db]` console line | `cs-audited-supabase` |
| `supabase/functions/_shared/envelope.ts` | the Deno envelope builders | `cs-audited-supabase` |
| `supabase/functions/_shared/dbResult.ts` | the Deno `runRpc` | `cs-audited-supabase` |
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

Audited 2026-09-05. Every file read in one sitting; every cross-file claim
below was checked against the tree, not taken from the docstring. The code
holds up well — the envelope's shape, the three-wrappers split, the
classify-here/present-there line between `dbFetch` and `dbResult` all read as
designed. What drifted is the prose about it and, in two places, a claim that
a guard exists.

## F-supabase-1 · `db-handle-docstring-paths` · `db.ts` shows two import spellings nobody writes

Its docstring says a `common/` file imports the handle as `'../db'` and a game
file as `'../../common/supabase/db'`. Neither is true: the seventeen common
callers write `'../supabase/db'`, and the three game callers write
`'@/common/supabase/db'` (`codenamesduet/hooks/useGame.ts` is the one that
aliases to `commonDb`, exactly as the docstring describes, but through the
alias). Worse, `'../db'` from a game folder IS an import — of that game's own
`db.ts` — so the example teaches the wrong handle. Fix: show the two real
spellings.

## F-supabase-2 · `not-ok-called-refusal` · Ten places call a not-ok envelope a "refusal"

`NotOkEnv`'s docstring ("The refusal arm on its own", "renders a refusal"),
Deno `runRpc` ("relay the refusal", "the RPC's own refusal", "Not a refusal —
a refusal arrives as a 200", "no refusal to relay"), Deno `formValidation` and
`fault` ("A refusal the PLAYER caused", "A refusal nothing the player did
explains"), `reportUnhandled` ("a declared refusal"), `_isEnvelope` ("a
refusal with no code"). The word collides with docs/envelopes.md's game-rule
refusal, which is an `ok`. Fix: say not-ok, or the severity. NOT in scope:
"refused connection", "a rejected fetch", and `edgeFnRefusedCodeless` — those
are about HTTP and the socket, not the envelope — and the player sentence
`'The server refused the request.'`, which is text.

## F-supabase-3 · `stale-guard-claims` · Two comments name a guard that no longer exists

`envelope.ts`, on `field`: "`null` — the raise didn't say; a SQL-side guard
catches it." `common.sql`, in the preamble above `ok_envelope`: "(no column) —
an oversight; the guard in serverErrorKeys.test.ts fails it", and two lines on,
a cite to `plans/areas/forms.md`. `serverErrorKeys.test.ts` was deleted when
the error sprint closed and the area file with it; `raiseCodes.test.ts` checks
codes and hints, not COLUMN, and no pgTAP file does either. So today nothing
catches a form-validation raise that forgot its COLUMN — every form lands the
null on its own line via `?? FORM_ERROR_KEYNAME`, silently. Two fixes, Joel's
pick: (a) write the check into `raiseCodes.test.ts`, which already parses every
raise's `using` clauses, and make both comments point at it; (b) say
truthfully that nothing checks it and the form's default is what catches it.
`common.sql`'s stamp stays where it is either way; the edit is to two comment
lines.

**Resolved 2026-09-05 — (a), Joel's ruling ("do it").** A new `it` in
`raiseCodes.test.ts`, `names a column on every form-validation raise`: every
SQL raise whose `using` carries `hint = 'form-validation'` must also carry
`column =`. SQL only, because the Deno `formValidation` builder takes the field
as a required argument. Passed on day one (all 24 such raises carry one) and
went red when one was planted without it. Both comments now name that file;
the `plans/areas/forms.md` cite in the same `common.sql` paragraph became
docs/envelopes.md → The keys. `raiseCodes.test.ts` is `cs-unmet` under the
guards area; a forward fix, stamp untouched.

## F-supabase-4 · `envelopeerrorpage-ghost` · Two docstrings name a component that does not exist

`dbEnvelope.ts` (`envAndTransportToDiagFields`) and `dbLog.ts` (`DiagFields`)
both say the only other place converting null to undefined is
`EnvelopeErrorPage`, "which builds a line during render". No such file. What
exists is seven callers of `diagnosticsLine` outside the folder — `App.tsx`,
`ClubPage` (three), `HomePage`, `panic.ts`, `ErrorPage`,
`PlayAreaErrorBoundary`. Fix: name the condition ("a surface that renders a
failure it did not itself log") rather than a file, or name `ErrorPage`.

## F-supabase-5 · `stale-counts-in-prose` · Six counts and tallies that have rotted or will

- `OUR_BUG_TO_CODE_AND_TEXT`'s docstring: "four carry it in their text" —
  seven do; only `unhandledAnswer` is prefixed at its call.
- `noProfileRow`: "Reachable, unlike the three above" — `unhandledAnswer`,
  directly above, fires on every scream-`else` and is the most reachable code
  in the file.
- `NO_ANSWER_TO_CODE_AND_TEXT`: "the forty-odd SQL exception handlers".
- `dbResult.ts` header: names the three files that call `showFaultModal`
  directly. True today (`HomePage`, `useGameTimer`, `useWordSubmit`), and
  `callSiteShape.test.ts` is what holds it — the docstring's copy is the one
  that will rot.
- `dbResult.test.ts`: "The half the 94 call sites lack today."
- Deno `dbResult.ts`: "a boundary written thirteen times is a boundary spelled
  thirteen ways" — archaeology about the pre-wrapper functions.

Fix: the condition, never the number — the routing rule.

## F-supabase-6 · `docs-stale-paths` · Five link texts write the pre-reorg path for this folder's files

docs/supabase.md writes `src/common/lib/supabase/supabase.ts` and
`src/common/db.ts`; docs/envelopes.md writes `src/common/lib/supabase/…`
three times (`dbResult.ts` twice, `envelope.ts` once). Every href is already
right; the visible text is not. Directly about this folder's files, so fixed
here. Seen alongside and NOT this folder's: docs/deferred.md and
docs/realtime-lost-events.md write `common/lib/supabase/postgresAttached.ts` /
`realtimeDiag.ts`, which live in `realtime/` — two more one-word path fixes,
same edit if Joel says so.

## F-supabase-7 · `dbresult-test-spy-hygiene` · Console spies leak between tests, and three tests explain it instead of fixing it

`dbResult.test.ts` spies on `console.warn` and `console.error` per test and
never restores; three later tests each carry a paragraph on why they call
`mockClear()` first, and one calls `spy.mockRestore()` by hand. Its two sibling
specs have `afterEach(() => vi.restoreAllMocks())`. Fix: the same `afterEach`,
and the three paragraphs and the manual restore go.

## F-supabase-8 · `dbfetch-test-doubled-comment` · The same paragraph twice, one of them archaeology

`dbFetch.test.ts` above "marks an unparseable body with a verdict": two
versions of one comment, back to back, both saying what the failure "used to"
be. Fix: one paragraph, present tense.

## F-supabase-9 · `typeof-window-guards` · Five guards for a case that cannot happen

`supabase.ts` (`typeof window`), `dbEnvelope.ts` (`typeof navigator`),
`dbFetch.ts` (`typeof navigator`, `typeof document`, `typeof location`).
docs/code-conventions.md → "`window` is always there": this is a Vite SPA and
jsdom provides all four globals, so each guard costs a reader a moment
deciding whether this file is special. Fix: use them bare. The tests already
depend on `navigator` being present (`vi.spyOn(navigator, 'onLine', 'get')`).

## F-supabase-10 · `settled-shape-written-four-times` · One response shape, spelled in four places

`{ data; error: DbError; status?; statusText? }` is `QueryLike<T>` for
`readRows`, written inline as `runRpc`'s parameter type, and written again as
the `settled` local's annotation in both wrappers; `envelopeForDbError` takes a
fifth partial spelling. Fix: one named type the three read, and the locals
inferred.

## F-supabase-11 · `dbfetch-path-computed-twice` · `isSupabaseInternal` re-derives the path `dbFetch` already has

`dbFetch` builds `call` (`METHOD /path`) once, then calls
`isSupabaseInternal(input, init)`, which runs `getMethodPathClean` again from
the raw input — up to twice per request. Fix: `isSupabaseInternal(path)` off
the `call` already built, computed once beside it.

## F-supabase-12 · `deno-isenvelope-looser-than-twin` · Deno's `isEnvelope` claims parity it does not have

Its docstring says "Deliberately strict, like its frontend twin", but
`_isEnvelope` also refuses a `not-ok` with no `dbcode` and Deno's accepts one.
Harmless today — every not-ok that reaches it was built by SQL, which writes
the SQLSTATE unconditionally — but the claim is false and the reason the
frontend insists (a codeless not-ok is not one we can have produced) holds on
this side too. Fix: match the twin, one line; or say the difference.

## F-supabase-13 · `notokenv-abbreviation` · `NotOkEnv` abbreviates the one word this folder never abbreviates

The type is `Envelope`; every neighbor spells it out — `faultEnvelope`,
`environmentalEnvelope`, `readEnvelope`, `ok_envelope`. `Env` also reads as
"environment" two lines from `environmentalEnvelope`. Rename to
`NotOkEnvelope`: 69 mentions across 24 files, a mechanical sweep with no
stamps moving.

**Resolved 2026-09-05 — renamed, Joel's ruling ("do it").** Every code
mention, plus docs/envelopes.md (a type name is a claim about this folder's
file) and plans/error-system.md (so a grep of the closed sprint's record still
lands). The old spelling survives only in this file's findings, which record
what was read. No stamps moved; `tsc -b` is the check.

## F-supabase-14 · `plan-cited-from-code` · A spec cites "the plan"

`dbResult.test.ts`, above `runRpc — one shape, always`: "the plan's rule is
that one shape travels all the way through." The plan is the closed error
sprint; the rule is docs/envelopes.md's. Fix: cite the doc.

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to the folder's `doc.md`
or `todo.md` instead; a note here never stands in for either)*

Considered and not raised: `faultEnvelope`'s four positional parameters, three
of them strings, which every caller fills as `null, text, detail, code`. Six
callers, all in this folder, all read fine in place. Noted so the question is
not re-asked.

## Predicted test breaks

- F-supabase-7 edits `dbResult.test.ts` itself; nothing else asserts on the
  spies.
- F-supabase-13 (`NotOkEnvelope`) is a compile break swept in the same commit;
  no spec names the type as a string.
- F-supabase-9, -10, -11, -12: none predicted. The Deno `isEnvelope` has no
  spec of its own.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
