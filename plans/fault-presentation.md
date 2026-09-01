# Who shows a fault

**Status: DONE — all of §5.** Kept until the roster empties, because §4's
note about the raw sites is the live half. Written 2026-09-01, mid-`error-system` sprint.

Move fault PRESENTATION from `dbFetch` to the three wrappers, and give a call
site a way to take the job itself.

Nothing else moves. Logging stays where it is, classification stays where it is,
the envelope does not change.

## 1. Why

`dbFetch` decides whether to show a modal, and **all it knows is the URL**. So
the only rule anyone can write is *"calls to this path never show a modal"* —
which is `isPolled`, and it is all-or-nothing.

The case that broke it: `useGameTimer` polls once a second, and wants

> quiet when the network dropped, **but a modal when the player is signed out**

One call, two treatments, decided by what came back. `dbFetch` cannot express
that, because to it both are "a request to `tick_timer` failed".

It is also enforced by halves today. A fault the server DECLARED arrives HTTP
200, so `dbFetch` never sees it and `runRpc` presents it instead — two
presenters, and `isPolled` reaches only one (docs/deferred.md → "Faults are
presented from two places").

## 2. What each layer knows — measured, 2026-09-01

The research that decides the shape. Everything here was checked against
postgrest-js and functions-js in `node_modules`, not assumed.

**Only `dbFetch` knows two things:**

- **did the response body PARSE.** postgrest-js's non-2xx path does
  `try { error = JSON.parse(body) } catch { error = { message: body } }` —
  so Kong's `{"message":"no Route matched…"}` and a captive portal's
  `<html>502</html>` both arrive as `{ message: string }` with no `code`,
  structurally identical. This is the one bit the wrapper cannot recover.
- **the thrown error's `name`** — needed to tell an `AbortError` from a real
  network failure. postgrest-js keeps only a flattened `${name}: ${message}`.

**Everything else is available to a wrapper**, and I had several of these wrong
before Joel corrected them:

| | why the wrapper can get it |
|---|---|
| `ms` | `runRpc`, `readRows` and `runEdgeFn` already time themselves |
| `navigator.onLine` | a global, readable anywhere; `nothingReachedUs` already reads it directly |
| `document.visibilityState` (the `hidden` flag) | also a global |
| the path | `callLabel(query)` off the builder's own `url`; `runEdgeFn` builds it from the function name |
| `status` | postgrest-js forwards it — `nothingAnswered(status)` is already built on it |

**Edge functions need no help at all.** functions-js throws
`FunctionsHttpError(response)` — the context IS the `Response`, unconsumed, and
`this.fetch` is our `dbFetch`, so it is the exact object we returned.
`callEdgeFn` already reads `error.context`, already calls `ctx.json()` in a
`try`, and can therefore answer both questions itself. **`PN310` is currently
decided in the wrong file.**

**A channel exists on the DB path if we want one.** `statusText` survives
postgrest-js untouched (it is returned beside `status` and never inspected), and
a reconstructed `Response` is accepted — verified by running it. So `dbFetch`
can carry its one bit forward without inverting `fetch`'s contract the way the
rejected synthetic-200 design would have (see the note in `dbFetch`'s docstring).

## 3. The change

1. **`dbFetch` stops calling `showFaultModal`; it keeps logging.** Every case it
   handles today still gets its `[db]` line via `logDb('FAULT', …)` — which it
   already does for aborts and Supabase-internal calls.
2. **The three wrappers present.** `runRpc`, `readRows`, `runEdgeFn` call
   `reportDbFault` for any `not-ok` with `severity: 'fault'`, whatever built it.
   One presenter; a rule is written once.
3. **`presentFaults` — an opt-out argument, default ON.** A site that has
   thought about it passes `{ presentFaults: false }` and handles its own:

   ```ts
   runRpc<Ticked>(commonDb.rpc('tick_timer', …), { presentFaults: false })
   ```

   Default-on is what keeps forgetting impossible: a call site that ignores its
   result entirely still surfaces the failure. Opting out is visible at the call,
   cannot be aimed at the wrong endpoint, and is typed — three things
   `isPolled`, a path string in another file, is not.
4. **`isPolled` is deleted.** The timer opts out and decides per answer: silent
   for `FE001`–`FE004`, `showFaultModal` itself for `PN011`/`PN012`.
5. **`PN310` moves to `callEdgeFn`**, which has the Response and the parse
   attempt already.
6. **The DB path's one bit.** Either `dbFetch` keeps classifying `FE003`/`FE004`
   and passes the verdict in `statusText`, or it keeps presenting those two
   alone. **Undecided — pick when we get there**, with the code in front of us.

## 4. What it costs

**~114 call sites go quiet until converted** — 72 raw `.rpc()` and 42 raw
`.from()` reads with no wrapper between them and `dbFetch`. Accepted (Joel,
2026-09-01): the roster converts them over the next day or two, and a
not-yet-converted part not working is the plan, not a regression.

**The modal's diagnostics line loses the `hidden` flag** unless the wrapper
re-reads `document.visibilityState`. It stays in the `[db]` line regardless.

### The two passes, which are different jobs

They were one item in an earlier draft, which made this plan look bigger than it
is and put the verification dangerously late (Joel, 2026-09-01).

- **The mechanical sweep (5.6) — right after the machinery, not at the end.**
  The 69 already-converted files inherit `presentFaults: true`, so they keep
  behaving exactly as they do now. The pass asks two questions per file: does it
  still present what it should, and does any of them WANT to opt out. It belongs
  immediately after the wrappers change, because the whole roster is about to
  land on top of this machinery and it should not land on unverified machinery.
- **The roster conversion — not part of this plan at all.** The ~114 raw sites
  are already scheduled in [error-system.md](error-system.md). Nothing here adds
  to that work; it only means each site is written knowing the opt-out exists.

## 5. Steps

- [x] **5.1** `presentFaults` on all three wrappers, default on; they present
      every `severity: 'fault'`. DONE 2026-09-01. `CallOptions` + a `reportFault`
      helper, the one place a wrapper decides — opting out still LOGS.
      `runRpc` and `runEdgeFn` both built `transport` AFTER their error branch,
      so those failures had no diagnostics to present with; both build it first
      now. `readRows` never presented anything at all.

      Also here, from a question Joel asked about the code: `reportDbFault` and
      the three envelope builders take/return `NotOk` rather than the union,
      which deleted `'Something went wrong.'` — a player-facing sentence that
      existed only because the parameter was typed wider than any caller could
      pass.
- [x] **5.2** `dbFetch` stops showing and keeps logging; `isPolled` deleted.
      DONE 2026-09-01. A `logFault` helper writes the line for a failure this
      layer classified and stops. Two branches simplified as a result: the
      nothing-answered case was `if (abort || internal || polled) log else
      present` and is now one `logDb`; the answered-with-a-failure case lost its
      poll check.

      Its test file's `presenting faults` describe is now `classifying faults`,
      and every assertion reads the `[db]` line instead of the modal queue. The
      three poll tests became one — their subject was `isPolled`.

      **The gap 5.5 has to close is now live.** For a non-2xx on the DB path,
      `dbFetch` logs `FE004` / "You reached a server other than ours" while the
      wrapper builds its own envelope from postgrest-js's flattened error — so
      the MODAL shows the raw body where the LINE shows the classification.
      Noted in `dbFetch` where the classification happens.
- [x] **5.3** `useGameTimer` opts out and decides per answer — the case that
      motivated this, and the proof it works. DONE 2026-09-01. Two treatments
      for one call, which no path test could express: silent for the four `FE`
      codes, `showFaultModal` for `PN011`/`PN012`. Verified by planting —
      removing `presentFaults: false` turns the silent-when-offline test red.
- [x] **5.4** `PN310` moves into `callEdgeFn`. DONE 2026-09-01. Its `catch` on
      `ctx.json()` was a one-line "fall through"; that catch IS the case — the
      runtime answered instead of the function. It now returns the `BUG:` and
      the code, with the content-type in `details`.

      `dbFetch` lost the branch and `targetsEdgeFunction` with it: a path test
      that existed only to guess at something the layer holding the Response
      knows outright.
- [x] **5.5** Decide the DB path's parse bit (§3.6). DONE 2026-09-01 — the
      verdict rides in `statusText`, and `dbFetch` stops logging faults a
      wrapper will speak for.

      The decision was easier than §3.6 assumed, because the alternative is
      worse than it looked: if `dbFetch` kept PRESENTING `FE003`/`FE004` alone,
      the wrapper would still build its own envelope from the flattened error
      and present THAT — two modals, one of them raw HTML — and even suppressed,
      the envelope a call site reads would still carry the markup. It fixes the
      modal at best and leaves the data wrong.

      So: `dbFetch` reads the body as text once, classifies, and re-emits a
      `Response` with the code in `statusText`. Everything either library
      touches survives — `ok`, `status`, `statusText`, `text()`, `headers`.
      `situationFor` reads it back; `failureEnvelope` in `dbResult` decides in
      three lines, verdict first. Verified by planting: ignoring the verdict
      turns two tests red.

      **And `dbFetch` no longer logs faults on our endpoints** (Joel: going dark
      on the raw sites is fine, every one is covered this sprint). It keeps
      logging what no wrapper will ever speak for — auth, aborts, unrecognized
      paths — which is the rule it already applied to its `OK` lines. That
      closes the double-log 5.2 opened. `logFault` is gone: this layer builds no
      envelopes at all now.
- [x] **5.6** **The mechanical sweep** — the 69 converted files. DONE
      2026-09-01, and it needed **no code changes**, which is what default-ON
      was for: every converted site inherited the behavior `dbFetch` was giving
      it. Verified rather than assumed — only the timer passes `presentFaults`;
      the 33 files that call `showFaultModal` are almost all calling their
      `BUG: … fell through` scream, which is mutually exclusive with the wrapper
      having presented; the three that branch on `severity` still get their
      modal, from a different layer.

      What it DID find: 26 comments across 26 files claiming `dbFetch` raised
      the modal. All swept — `dbFetch` now appears nowhere in `src/` outside
      `lib/supabase/`.

      (The original text follows.) The 69 converted files. Does each still
      present what it should; does any want to opt out. **And specifically: is
      any of them relying on `dbFetch` presenting FOR it** — a site that shows
      nothing itself because a modal appeared anyway. Those still work under the
      new default, but they are the ones most likely to be wrong if someone
      later opts them out, and this is the cheapest moment to find them.
- [x] **5.7** A guard: a file passing `presentFaults: false` must contain a
      `showFaultModal` or a `console.error`. Opting out is a promise to handle
      it, not a license to drop it. DONE 2026-09-01, in
      `src/guards/callSiteShape.test.ts` beside the scream guard. Both arms
      verified by planting: stripping the timer's `showFaultModal` names that
      file, and a new file that opts out with no handling names itself.

      Why a modal OR a `console.error` counts: the point is that somebody
      thought about it, not that they picked a particular surface. The wrapper
      still writes the `[db]` line either way — what an unhandled opt-out loses
      is the PLAYER, which is the half no diff shows.
- [x] **5.8** Delete the two now-answered `docs/deferred.md` entries — "Where
      should a fault modal be raised from?" and "Faults are presented from two
      places". DONE 2026-09-01. Both are answered by this plan: the wrappers
      raise it, and there is one presenter rather than two.

      A third entry needed refreshing rather than deleting — "A disconnected
      player is the one person who is not told" cited `isPolled` and said the
      modals were "about to be silenced". They are silenced; the gap it
      describes is now real rather than imminent.

## 6. Deliberately not in scope

- **Pills.** A wrapper knows the answer but not the surface, so "present as a
  pill instead of a modal" stays a call-site decision via `getNotOkFeedback`.
  `presentFaults` is a boolean, not a mode.
- **Moving the `[db]` logging.** The split — `dbFetch` narrates the REQUEST, the
  wrappers narrate the ANSWER — is right and unchanged.
- **`x-relay-error`.** functions-js distinguishes a relay failure
  (`FunctionsRelayError`) from a function that threw, and `callEdgeFn` currently
  treats them alike. Found while researching this; a separate question.
