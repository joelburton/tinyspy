# One rule, one author

**Status: proposed, nothing built.** Written 2026-08-31, mid-`error-system` sprint.
Revised the same day after the first draft's central move turned out to be
unjustified — see §9.

This plan does not change the envelope. The nine-key shape is the part that
worked: it took `!== 'ok'` from 25 call sites to 0 and gave every one of them an
exhaustive branch chain. What this plan fixes is **how many places decide what a
failure means, and how many of them get it wrong.**

## 1. The problem

**It lives on exactly one path.** `dbFetch` throws only at `dbFetch.ts:227`,
`if (!res) throw thrown` — when `fetch` itself rejected and nothing answered.
Every other failure returns normally, and on those the two authors already
agree: a 4xx has `dbFetch:222` parse the body and show `body.message`, while
postgrest-js parses the same body into `error.message` and the wrapper wraps it
— same string, both places.

So everything below is one of five paths through `dbFetch`, and the fix is
correspondingly narrow. Trace one offline read as it stands today:

| # | layer | what it makes |
|---|---|---|
| 1 | browser | `TypeError: "Failed to fetch"` — opaque by design |
| 2 | `dbFetch` | **the right envelope** ("You appear to be offline…"), shows the modal, then re-throws the raw error and drops the envelope |
| 3 | postgrest-js | `{ message: "TypeError: Failed to fetch", code: '', status: 0 }` |
| 4 | `readRows` | a second envelope, built from #3, carrying the raw string |
| 5 | `readFailure` | a third format, `{ text, diagnostics }` |

The player is then shown **two contradicting sentences at once**: the modal from
#2 says "You appear to be offline", and the pill or ErrorPage from #5 says
"TypeError: Failed to fetch". That is not a slip — `genericPills.ts` says a
fault gets a pill *as well as* the modal, on purpose.

### The measurements

- **13 frontend-authored sentences**, across five files. `docs/envelopes.md:989`
  says the number is two, and that they are "the only ones it authors at all".
- **Six different ways to say "nothing answered"**, of which the one that
  reaches the player is the browser's.
- **Five of those sentences can never fire.** `faultEnvelope`'s message is
  `RAW_FAULT_TEXT[code] ?? error?.message ?? fallback`; `RAW_FAULT_TEXT` is empty
  and every transport hands it an error that always has a `message`
  (postgrest-js builds one at `PostgrestBuilder.ts:446`, `callEdgeFn.ts:77`
  copies one). The `fallback` argument at `dbResult.ts` 512 / 584 / 587 / 650 /
  652 is decoration.
- **`readRows`' `try/catch` cannot fire.** postgrest-js swallows the rejection
  first. The comment at `dbResult.ts:646` says the opposite.
- **A failed edge-function call raises two modals.** `dbFetch.ts:222` reports it
  (a `/functions/v1/` path is not `isSupabaseInternal`), and then
  `dbResult.ts:513` reports it again. Each layer presents because it does not
  trust the other to have.

## 2. The actual defect

It is narrower than the list above makes it look, and it is not architectural.

**`readRows`, `runRpc` and `runEdgeFn` call `faultEnvelope` for "nothing
answered", and that is the wrong function.** `faultEnvelope` reaches for
`error.message`, which on that path is the browser's opaque string. The right
function already exists and already holds the right words —
`environmentalEnvelope`, which `dbFetch` calls at `dbFetch.ts:161`.

So the two authors are not disagreeing about a hard question, and they are not
disagreeing often. They disagree on **one branch** — the `!res` one, where
`fetch` rejected — and everywhere else they already say the same thing. One of
them is calling the wrong function on that branch, and nothing in the type
system or the tests notices, because both return `Envelope<never>`.

### What makes it invisible

`dbFetch` does two jobs: it is `fetch` (installed at `supabase.ts:84` for
PostgREST, edge functions **and auth**), and it is the app's failure author and
presenter. The first job's type is `typeof fetch`, which has no return channel
for the second — so the only way it can communicate is by side effect: a modal
and a console line. Nothing downstream can *receive* what it decided, so nothing
downstream is forced to agree with it, and the two drifted without a single test
going red.

That is worth naming, because it explains the shape of every finding in §1. But
it does not have to be re-plumbed to fix them — see §9.

## 3. The change

**One rule, stated once, called by everyone who needs it.**

Add one predicate and route to the function that already exists:

```ts
/** Did anything answer at all? The one signal each transport gives for it. */
function nothingAnswered(status: number | undefined): boolean {
  return status === 0        // postgrest-js's fetch-rejection path, and only it
}
```

Then in each wrapper, a failure is one of two things rather than one:

```ts
if (settled.error) {
  return nothingAnswered(settled.status)
    ? environmentalEnvelope(navigator.onLine === false, detail)
    : faultEnvelope(settled.error, …)
}
```

That is the whole of it. The words stop being chosen in four places; they are
chosen where they always were, and the wrappers stop overriding them with the
browser's string.

### The three supporting edits

- **`QueryLike` and `runRpc`'s parameter widen to carry `status`.** It is on the
  resolved value at runtime and simply is not in the type today.
- **`callEdgeFn` must distinguish "no response" from "a response that wasn't
  ours."** Line 77 collapses them, so a gateway 502 (which *is* an answer)
  looks identical to a dead socket. It already carries an `answered` marker for
  the other direction; this is the same idea for the status.
- **`runEdgeFn` stops calling `reportDbFault`** on the transport path.
  `dbFetch` has already presented it — that is the double modal in §1.

## 4. How it works after

### a. `runRpc`

```
runRpc(db.rpc('submit_word', …))
  └─ postgrest-js ──► dbFetch
                        ├─ fetch
                        ├─ writes the [db] line
                        └─ nothing answered? ─► show the modal, re-throw
  ◄── { data, error, status }
  ├─ error + status 0             ──► environmentalEnvelope   ← the right words
  ├─ error                        ──► faultEnvelope (Postgres spoke)
  ├─ an envelope?                 ──► return it UNCHANGED, log the outcome
  ├─ ok with message, no outcome? ──► fault (a server bug)
  └─ anything else                ──► fault: unreadable body
```

### b. an edge function

```
runEdgeFn('wordiply-build-board', …)
  └─ callEdgeFn ──► functions-js ──► dbFetch   [same fetch as (a)]
  ◄── { data, error }        error carries `answered` + `status`
  ├─ never answered               ──► environmentalEnvelope, NO second modal
  ├─ answered, not our shape      ──► faultEnvelope
  ├─ an envelope?                 ──► return it UNCHANGED
  └─ …the rest identical to (a)
```

### c. `readRows`

```
readRows(db.from('games_state').select(…).eq('id', id))
  └─ postgrest-js ──► dbFetch   [same as (a)]
  ◄── { data, error, status }
  ├─ error + status 0  ──► environmentalEnvelope
  ├─ error             ──► faultEnvelope
  └─ rows              ──► ok, data = rows   (zero rows included)
```

All three read the same two lines for a failure, and a hook holds what comes
back without translating it.

## 5. What gets deleted

- **`ReadFailure` and `readFailure`**, and the hand-rolled copy at
  `connections/hooks/useGame.ts:271`. A hook holds `Envelope | null` — the same
  thing every call site in the app already knows how to read — and `ErrorPage`
  gains an `envelope` prop, building its own diagnostics line from the pure
  `diagnosticsLine` it is already documented as being able to call. One
  component's props, not a third data format.
- five fallback sentences that cannot fire
- `readRows`' dead `try/catch`
- `RAW_FAULT_TEXT` — an empty table kept for a case that has not happened. It
  can come back when one does.
- `runEdgeFn`'s duplicate `reportDbFault`
- four of the six ways to say "nothing answered"

## 6. What this does NOT fix

Worth stating, so the plan is not read as bigger than it is:

1. **`dbResult.ts` is still two subsystems in one 685-line file.** Thirteen of
   its twenty-six declarations are the `[db]` logging framework (`LogLevel`,
   three maps, `DiagFields`, `Transport`, `diagnosticsLine`, `logDb`, `logSlow`,
   `logDbOutcome`, `envelopeFields`, `callLabel`, `fieldValue`, `quotedText`).
   Splitting that out is a pure move with no behavior change, and it is worth
   doing, but it is not this.
2. **A fault still gets a modal AND a pill.** With one sentence instead of two
   contradicting ones that may well be right; it is a separate ruling.
3. **`dbFetch` still cannot be received from.** The structural point in §2
   stands. This plan makes the two authors agree; it does not merge them.
4. **An abort would read as "offline".** `dbFetch` stays deliberately silent for
   an `AbortError` — we cancelled ourselves, nobody is owed a modal — but
   postgrest-js reports an abort as `status: 0` too, so a wrapper keying on that
   alone cannot tell the two apart. Unreachable today: nothing in `src/` uses
   `AbortController` or `.abortSignal()` (checked, zero hits). It becomes live
   the moment anyone adds cancellation, and postgrest-js does distinguish it
   (`hint: 'Request was aborted…'`), so the fix exists — it is just stringly,
   and not worth writing against a case that cannot happen yet.

5. **The `OK` line for a successful read still comes from `dbFetch`**, and its
   reason has gone stale. `dbFetch.ts:187` writes `OK` for anything that is not
   an RPC, because "a read has no such layer" to speak for the answer —
   `readRows` is now exactly such a layer, and simply does not log.

   Moving it there is worth doing and is not blocked by much. `ms` is not a
   reason to stay: `runRpc` already times itself with `performance.now()` and
   `readRows` can do the same. Nor are the unconverted raw `db.from()` sites —
   those are the roster's to-do list, and building the logging around them would
   be designing for code we are deleting.

   The one real constraint is **auth**: the `OK` line at `:187` has no
   `isSupabaseInternal` gate, so a successful auth call gets one, and no wrapper
   will ever see those. So `dbFetch` keeps narrating what nothing else covers,
   and `readRows` takes the reads.

   The prize is a better line, not a tidier one: `readRows` knows the row count
   and `dbFetch` deliberately refuses to parse the body for it ("rows are not
   worth the cost"). `OK … rows=3` beats a bare `OK`. Left out of this plan
   because it is a separate change with its own argument, not because it is
   wrong.

### A deviation from §1's finding

`readRows`' and `runRpc`'s `try/catch` are **kept**, not deleted. They are
unreachable via postgrest-js, which is what §1 says — but a throw means nothing
answered, which is now a case with a correct answer rather than a wrong one. The
catch stops being dead weight and becomes the same branch by another road. What
gets deleted is the comment claiming it catches the rejected fetch.

## 7. The guard

The reason this drifted is that nothing could see it, so the fix ships with the
thing that would have caught it. A test that plants a rejected fetch and asserts
the envelope each wrapper hands back carries `ENVIRONMENTAL.offline` — not the
browser's string. Verify it by planting: make one wrapper call `faultEnvelope`
again and confirm it goes red.

Second, cheaper guard: no `faultEnvelope` call may pass a `fallback` that is
unreachable. Once the five are deleted, a grep-style guard keeps them gone.

## 8. Sequence

1. Widen `QueryLike` + `runRpc`'s parameter to carry `status`; teach
   `callEdgeFn` to report `status` when a response existed.
2. Add `nothingAnswered`; route the three wrappers to `environmentalEnvelope`.
   Write the §7 guard first and watch it fail.
3. Drop `runEdgeFn`'s duplicate `reportDbFault`.
4. Delete the dead sentences, `RAW_FAULT_TEXT`, and the dead `try/catch`.
5. Delete `ReadFailure`; convert the fifteen hooks to hold `Envelope | null` and
   give `ErrorPage` its `envelope` prop.
6. Fix `docs/envelopes.md`'s count of frontend-authored sentences, which is
   wrong today either way.

## 9. Considered and rejected: inverting `dbFetch`

The first draft's central move was to have `dbFetch` stop throwing and instead
**answer with the envelope it had already built**, as a 200 JSON body — the
contract the server already follows. Every wrapper's failure handling would have
collapsed to "if the body is an envelope, return it unchanged."

It would have worked. Auth was already fenced off by `isSupabaseInternal`, so
supabase-js's own token refresh never sees the synthetic response, and the
objection that killed it was not risk.

**It was rejected because it buys nothing.** The wrappers already have
everything they need — `status === 0` plus `navigator.onLine` fully determines
the case. Inverting a standard contract to hand a layer information it can read
for itself is cost with no purchase: every future reader, and every future
direct-`fetch` consumer, would have to learn that this `fetch` sometimes resolves
for a request that never happened.

Recorded rather than deleted because it is the obvious idea, and the next person
to look at this will have it too.

## 10. Relationship to the running sprint

`plans/error-system.md` §7 has 77 call sites left. **This plan does not block
them and they do not block it** — a converted call site reads `type` and `data`
and is indifferent to who built the envelope.

One interaction: the sixteen `PlayArea` surfaces that were about to grow an
`if (failure)` line should grow it against an envelope instead, so that work
waits for step 5 rather than being done twice. The hook half of that sweep
(`plans/envelope-rollout.md` sweep 2, commit A) is already in the working tree
and stays — converting the reads to `readRows` is right under either plan.
