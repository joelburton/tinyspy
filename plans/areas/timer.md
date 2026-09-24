# Area: timer

The folders it reads: `timer`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-16, blessed.** Audited, worked, re-read and harvested
in one day; blessed on Joel's words the same day — *"mark files in this area as
blessed, then close the area"* — four files `cs-blessed-timer`. Roster agreed
and every file read. The clock's SQL half — `common.tick_timer`, `common.require_valid_timer`
and the `common.timers` table in `supabase/sql/common.sql` — is EVIDENCE, not
roster (Joel, 2026-09-16: *"use them for evidence"*); read in full, stamps
untouched.

## The roster

`src/common/timer/` — every file `cs-met-timer`:

- `useGameTimer.ts` — the clock hook (`formatTimerSeconds` sat beside it until
  F-3 moved it)
- `useGameTimer.test.ts`
- `timerLabel.ts` — the timer's words: the recap's "none · count-up · 2:30
  countdown", and M:SS
- `timerLabel.test.ts`
- `doc.md` (lede + `## Intro to area` + `## Details`, written at F-1) ·
  `todo.md` (empty)

Evidence, read and left:

- `supabase/sql/common.sql` → `common.tick_timer` (the clock's one writer),
  `common.require_valid_timer` (the setup shape, PN035–PN039), `reset_game`'s
  zeroing, and the two "pure pointer flip, no timer work" comments on the
  view-state RPCs; `supabase/migrations/20260615000000_common.sql` → the
  `common.timers` table (`game_id`, `ticks`, `last_tick`).
- The one caller of the hook, `game-page/useCommonGame.ts`, and the consumer
  of `expired`, `game-page/GamePage.tsx`'s `fireTimeoutOnExpiry`; the two
  importers of `formatTimerSeconds` (`GamePage.tsx`, `setup-form/SetupTimerSection.tsx`)
  and the two of `timerLabel` (`setup-form/setupRows.ts`, `SetupTimerSection.tsx`);
  `gamePageCtx.ts`'s `timer` slot; `manifest/gameManifest.ts`'s `TimerMode`.
- `docs/common.md` → the game-clock section (headed "Idle accounting" when the
  area opened, renamed at F-6) and the RPC table's two timer rows;
  `docs/win-lose.md` → "Clock fairness"; `docs/deferred.md`'s heartbeat item.

## What the folder is, in one paragraph

Two files with a job each. **The clock** — `useGameTimer` reads
`common.timers.ticks` once on mount and then, while the game is live, unpaused
and timed, calls `common.tick_timer` once a second; the server advances the
count by at most one per real second whoever asks, so the clock is a count of
seconds somebody was playing, and pause, idle and a dead tab cost nothing
because nobody asks. The hook returns the display number (up for countup, down
to a floor of 0 for countdown) and `expired`; the timeout-loss RPC is
`GamePage`'s to fire, on the rising edge. **The words** — `timerLabel` prints a
configured mode for the setup recap, and `formatTimerSeconds` prints a number
of seconds as M:SS for the header and the countdown input. The SQL half is the
`timers` table and `tick_timer`'s one conditional `UPDATE`, which is the whole
of dedup, pause and idle.

## Findings

### F-timer-1 · `intro-owed` · `doc.md` is "The game clock." and the folder's design sits in a docstring nobody reaches

The `## Intro to area` owed: the additive tick model as the reader meets it —
the clock only moves while someone asks, so a paused game, an idle game and a
killed tab all simply stop counting; the server's `now()` is the authority and
the client's interval only triggers the attempt; the display is derived from one
integer; and who consumes what (`useCommonGame` runs the hook, `GamePage` shows
the number and fires the timeout on the edge, the setup dialog and recap print
the words). `## Details`: the merge rule (forward-only against small backward
values, a large drop is a reset), the poll's four treatments of a not-ok and why
a once-a-second call decides per answer, and the SQL half by pointer. Most of
this is already written — in `useGameTimer`'s docstring (F-2) and in
`docs/common.md`'s "Idle accounting" section — so it moves rather than being
rewritten.

**WORKED 2026-09-16.** The lede names both halves (the integer and the words).
The intro is four narrative paragraphs: why an accumulator was never going to
hold (a crashed tab cannot record the gap it opened), the tick model that
replaces it, what falls out of it (nothing to maintain, ±1s around a pause),
and the derivation plus who consumes what. `## Details` takes the five sharp
things — `expired` is a level and why `GamePage` owns the edge, the merge rule,
the poll's four treatments, the SQL half, and M:SS written once after F-3.
`common/timer` is off `INTROS_OWED`; plant-verified by renaming the heading,
which fails `folderDocs.test.ts` with "0 sections, want exactly 1".

### F-timer-2 · `orphaned-essay` · The hook's docstring is attached to the wrong declaration, and three of its claims are wrong

Forty lines of `/** … */` at the top of `useGameTimer.ts`, immediately followed
by `type Ticked` with a docstring of its own — so the essay belongs to nothing,
and `useGameTimer` itself (line 67) has no docstring at all. Same shape
`feedback`'s F-6 and F-15 had. Of its content: the "additive tick model", "pause
and idle need no bookkeeping" and "why the server clock is the authority"
paragraphs are the intro (F-1); the "Returns" block is the contract and stays.
Three things are wrong today:

- "`expired` — true once a countdown reaches 0 (fires the timeout-loss RPC)."
  The hook fires nothing; `GamePage`'s `fireTimeoutOnExpiry` does, on the
  transition, for reasons its own comment gives.
- "(This replaced the old `now - startedAt - pause - idle` arithmetic and the
  `idle_since`/`total_idle_seconds` columns.)" — how it used to work.
- `formatTimerSeconds`: "the common timer display in the BoardScreen header" —
  there is no `BoardScreen`; the name survives only in codenamesduet's own
  `lib/phase.ts`. The header is `GamePage`'s.

Also for the marker pass: `running`'s `/** */` on a prop of the inline params
type takes `//`.

**WORKED 2026-09-16.** The orphaned block is gone, its three design paragraphs
into `doc.md`'s intro and its fourth (the merge rule) dropped as a second copy
of `mergeTicks`'s own docstring, which says it better. `useGameTimer` has a
docstring of its own now — twelve lines, a hover: what it does, the one
round-trip, the two returned fields, and `expired` labeled a LEVEL with the
edge named as `GamePage`'s `fireTimeoutOnExpiry`. The archaeology sentence is
deleted rather than moved. The "BoardScreen header" claim traveled with
`formatTimerSeconds` under F-3 and is now fixed where it landed, in
`timerLabel.ts`: it names `GamePage`'s header, the setup box and the countdown
arm beside it. `running`'s marker is `//`.

### F-timer-3 · `two-mss-formatters` · M:SS is written twice in a two-file folder, and the formatter lives in the hook's file

`formatTimerSeconds` (M:SS, in `useGameTimer.ts`) and `timerLabel`'s countdown
arm (`${m}:${String(s).padStart(2, '0')} countdown`) are the same six lines.
And the formatter is imported by `GamePage` and `SetupTimerSection` FROM THE
HOOK'S FILE — a component that only wants to print a number pulls in the
polling hook and its four supabase imports to get it. Options: (1) `timerLabel`
calls `formatTimerSeconds`, and the formatter moves to `timerLabel.ts` so that
file is "the timer's words" and the hook file is the hook — two import lines
move; (2) call it from `timerLabel` and leave it where it is; (3) leave both.
Recommend (1): the split by file is then the split by job, which is what the
one-paragraph summary above already had to say.

**WORKED 2026-09-16**, as option (1). `formatTimerSeconds` now lives in
`timerLabel.ts` and the countdown arm is `` `${formatTimerSeconds(t.seconds)}
countdown` `` — six duplicated lines gone, and the two files are the hook and
the words. `GamePage.tsx`'s import retargets; `SetupTimerSection.tsx`'s two
become `import { formatTimerSeconds, timerLabel } from '../timer/timerLabel'`,
so neither printer reaches through the polling hook's module any more. The
`describe('formatTimerSeconds')` block moved to `timerLabel.test.ts` with the
function. Plant-verified: padding the seconds field to 1 fails BOTH the
formatter's own spec and `timerLabel`'s `1:05 countdown` case, which is the
proof the label really routes through the shared formatter. The predicted breaks
below all held; the docstring the function carried with it still says
"BoardScreen header", which is F-2's third bullet and still owed.

### F-timer-4 · `unnamed-effects` · Both effects are bare arrows

The seed read (line 86) and the driver (line 122) are each a dozen lines with a
header comment, which is the convention's own test for "deserves a name"
(code-conventions.md → the hook-callback rule). `seedFromTimersRow` and
`driveTheClock`, or near it. The inner `drive` is a named const already.

**WORKED 2026-09-16**, with those two names — **and the two `.then` callbacks
too**, `applySeedAnswer` and `applyTickAnswer`, which is the area's own
vocabulary ("this call decides per answer, and the branches below are that
decision"). The convention's rule had excluded promise chains by shape and said
so, so this was asked: Joel, *"if they're non-trivial, a name is useful"*. That
widened the rule for everyone, and code-conventions.md → the hook-callback rule
now says the test is the body rather than the call shape. The cleanups stay
arrows. The effect-name grep over every file the area touched is clean.

### F-timer-5 · `split-import` · `dbEnvelope` is imported on two lines

Line 6 takes `isEnvironmental`, line 9 takes `reportUnhandled`, both from
`'../supabase/dbEnvelope'`, with two other imports between them. One line.

**WORKED 2026-09-16.** `import { isEnvironmental, reportUnhandled } from
'../supabase/dbEnvelope'`.

### F-timer-6 · `stale-docs` · Four claims in `docs/` describe a clock the repo no longer has

- `docs/common.md` → the heading "Idle accounting (timer-state preservation)"
  names the old accumulator's problem, and the section's last paragraph — "The
  known leak: tab-kill … that gap is counted as wall-clock time. See
  `docs/deferred.md` → 'Timer-state preservation'" — describes a leak the
  additive model cannot have (nobody ticks, nothing counts) and cites a
  deferred.md section that does not exist. The section's own first paragraph
  says the opposite two sentences earlier ("robust by construction").
- `docs/common.md`'s RPC table, `common.require_valid_timer`: "Raises `P0001`
  with `setup.timer.*`-prefixed messages: `is required` …" — it raises
  PN035–PN039 as faults with `BUG:` messages and names its column, per the
  envelope sprint; the row predates it.
- `docs/win-lose.md` → Clock fairness: "today's timer is one game-level
  countdown anchored at `started_at`" — it is the additive count; nothing is
  anchored. The cost argument that follows (per-turn elapsed accounting for a
  player clock) still holds, for a different reason: a player clock would need
  a per-player tick, not a per-game one.
- The same "(This replaced …)" archaeology sentence sits in `common.md`'s
  section as in the docstring.

Fixed in passing where they stand: `common.md` and `win-lose.md` are docs, and
the rule is current state.

**WORKED 2026-09-16, and the re-read found a fifth.** `common.md`'s heading is
now "The game clock" — the old one named the accumulator's problem — with every
link to it retargeted (`common.md`'s own RPC row, and the timer sections of
psychicnum, codenamesduet and connections). The known-leak paragraph is gone;
what replaces it is a pointer to `src/common/timer/doc.md` for the FE half, and
the "robust by construction" sentence keeps the contrast without the archaeology
("the failure an accumulator cannot avoid"). The `require_valid_timer` row says
what it raises: five faults, PN035–PN039, naming the column `timer`, and why
they are faults. `win-lose.md`'s cost note no longer says "anchored at
`started_at`" and now gives the real reason a player clock is work — a
per-player tick, not a per-game one.

**The fifth:** `docs/states.md` carried the same "This replaced the old
subtractive `idle_since`/`total_idle_seconds` accumulator" sentence, a third
copy of the archaeology the docstring and `common.md` each had. Dropped; the
pointer-flip half of that sentence is true and stays, without the "now".

### F-timer-7 · `envelope-literal-seven-times` · The hook's test spells the full `ticked` envelope seven times

Seven `rpcMock.mockResolvedValue({ data: { type: 'ok', data: { result:
'ticked', ticks: N }, outcome: null, severity: null, … }, error: null })` lines,
each 200 characters, differing only in N. A `ticked(n)` helper beside the
existing `notOk(code)` one makes every spec read as what it pins. Also
`timerLabel.test.ts`'s docstring counts "Three of the four cases" over a file
with three specs — the count rots; say which case is the one worth having and
drop the tally.

**HALF WORKED 2026-09-16 — the prose half.** `timerLabel.test.ts`'s docstring
drops the tally ("Most of these just pin the arms of `TimerMode`"), covers the
formatter that moved in under F-3, and says what the doubled `0:05` assertion is
for: `padStart` is pinned through `formatTimerSeconds` directly AND through the
countdown arm that calls it, so a label that stopped sharing the formatter fails
here rather than drifting.

**WORKED 2026-09-16 — the code half.** `ticked(n)` sits at module scope, above
the `beforeEach` that needs it, with a docstring saying why the envelope is 200
characters (every key present is the contract — docs/envelopes.md) and that only
the count ever differs. `notOk` stays inside the `describe` where it is: its
docstring introduces the not-ok specs that follow it, and moving it beside
`ticked` would separate the two. **Eight call sites, not seven** — the audit
counted the specs and missed the default in `beforeEach`. Plant-verified: making
the helper report `n + 1` fails four specs, so it is load-bearing rather than
decoration.

### F-timer-8 · `expired-is-a-level` · `expired` is a level and every consumer wants an edge or a fact

`expired` is `mode.kind === 'countdown' && displaySeconds === 0`, recomputed
every render. `GamePage` needs the TRANSITION and builds it with a ref and a
twelve-line comment about why a level re-ends a replayed game. The games that
read it (`waffle`, `wordle`, `connections`, `psychicnum`, `stackdown`) use
it as a fact about a terminal game ("did the clock end this?"). Both are served
by the level as it is; recording this so the question is asked once: whether
the hook should hand back the edge (`justExpired`, true for one render) so the
ref and the comment leave `GamePage`. Options: (1) leave it — ~~`GamePage`'s
edge also gates on `paused`, which the hook does not know, so the ref would
move rather than go~~ **this reason was wrong, see below**; (2) add
`justExpired`; (3) hand back the edge and let
`GamePage` gate it. Recommend (1) and close: the hook's job is the number, and
`game-page` is closed with that comment blessed.

**WORKED 2026-09-16 as option (1) — leave it — on Joel's word, after the
re-verify overturned the reason.** The hook DOES know `paused`:
`useCommonGame.ts` computes one boolean and passes it both into `useGameTimer`
and out to `GamePage`, so the recorded rationale was flatly wrong and the
recommendation had to be re-argued.

The real reason the ref cannot leave is that **a hook cannot produce a
one-render edge safely.** The obvious shape computes it during render —
`const justExpired = expired && !prevRef.current; prevRef.current = expired` —
and StrictMode (`main.tsx`) double-invokes render: pass one returns true and
sets the ref, pass two computes false, and pass two is the result React keeps.
The timeout would silently never fire in development and fire in production.
`GamePage`'s ref is mutated inside an EFFECT, which runs once per commit, which
is why it works. The safe version of (2) is `useState` plus an effect to raise
the flag and a second render to lower it — the ref moves into the hook and
grows, while the `ended_at` check and the race logging stay in `GamePage`
regardless.

A fourth option was raised at the presentation and declined with the rest: an
`onExpired` callback, the only shape that yields an edge without a render-phase
ref. It is the only one that actually deletes something — but the hook would
start calling things, and "the hook fires nothing" is the sentence its docstring
now leads with.

And the level is what the five games want: `waffle`, `wordle`, `connections`,
`psychicnum` and `stackdown` read `timerExpired` into `buildOver` as a fact
about an already-terminal game, which survives a reload where an edge does not.

## The closing re-read (2026-09-16)

Every roster file in one sitting, then every file the five commits touched,
then the greps: the effect-name grep over the touched files (clean — the one
bare arrow, `GamePage`'s one-line menu cleanup, is the trivial case the rule
exempts), `.then(` in the folder (both named), the day's dates against
`git log` (all 2026-09-16, none ahead), the old clock's words repo-wide
(`BoardScreen`, `Idle accounting`, `idle_since`, `total_idle_seconds`,
`anchored at`, `This replaced`), and every prose mention of `useGameTimer`,
`formatTimerSeconds` and `timerLabel` outside the folder. Seven findings, all
worked the same day. Two are the area's own earlier findings recurring in a
sibling — which is what the re-read is for — and one is a recorded absence
that was never true.

### F-timer-9 · `overturned-reason-in-doc` · `doc.md` still gave F-8's overturned reason

`## Details` opened with "That edge stays with `GamePage` because the gate is
`GamePage`'s knowledge, not the hook's" — written at F-1, before F-8's
re-verify found that the hook takes `paused` and the reason was wrong. F-8's
commit touched only this file, so the doc kept the sentence the area had
struck. Same shape as `chat`'s re-read: yesterday's finding writes today's
stale claim.

**WORKED.** The paragraph now gives the reason that holds: the ref is mutated
inside an effect, which runs once per commit; computed during render,
StrictMode's second pass would find it set and return false, and the second
pass is what React keeps.

### F-timer-10 · `phantom-absence` · The Notes said `tick_timer` has no pgTAP; it has nine specs

`supabase/tests/common/tick_timer_test.sql` has existed since the clock was
built (2026-06-19) and pins exactly the conditional the note called
"exercised only by playing": no advance inside the first second, one advance
after it, the same-second dedup for one player and for two, a 60-second gap
costing +1, the persisted count, PN012 for a non-member and PA004 as
ok/noted. The note was written from a grep for `tick_timer` that was read as
an absence without opening the directory — the easiest wrong answer, and
this one had a handoff hanging off it.

**WORKED.** The note is corrected below and the handoff withdrawn. `doc.md`'s
SQL paragraph now names the test file and its trick (rewinding `last_tick`
by hand rather than sleeping), so the next reader does not re-derive it.

### F-timer-11 · `manifest-timer-docstring` · `TimerMode`'s docstring described the old clock

`manifest/gameManifest.ts`: "`countup` — display-only; ticks up from
game-creation time" (it counts seconds of play, not wall time since
creation), and "See docs/games/connections.md → 'Timer' for the browser-side
/ no-server-sync choice" (the clock is the server's, and the section it cites
says so and points at `common.md`). F-6's shape — prose describing the
accumulator — in the type the hook consumes, which the audit listed as
evidence and read past. `manifest` is closed and blessed; closed is not
locked for prose.

**WORKED.** The four arms say what they are today, `countdown` names
`GamePage` as the firer on the edge, and the pointer is `src/common/timer/doc.md`.

### F-timer-12 · `stale-link-text` · `connections.md`'s link table names the hook by its pre-reorg path

"The browser-side timer" → `src/common/hooks/game/useGameTimer.ts` as the
visible text, over a href that resolves. `docs/common-folders.md` says these
prose paths are corrected as each folder's `doc.md` is harvested, which is
this step; the row's label was also the stale claim of F-11 in three words.

**WORKED.** "The timer hook" → `src/common/timer/useGameTimer.ts`. The other
pre-move texts in that table (`pause.ts`, `PauseOverlay.tsx`,
`PauseBoundary.tsx`) belong to `pause-suspend`'s harvest and are left.

### F-timer-13 · `archaeology-in-test` · The hook's test carried two "used to" sentences

F-2 deleted the archaeology sentence from `useGameTimer.ts`; the test beside
it kept two — `notOk`'s docstring ("It used to drop every one, which is what
hid the interesting half") and a spec title ("— a bug it used to swallow").

**WORKED.** The docstring says why the split matters in the present tense
("Dropping every one would hide the interesting half …"); the spec is
`SCREAMS for a code it never declared`.

### F-timer-14 · `padding-claim` · `timerLabel.test.ts`'s docstring made two claims F-3 falsified

Written in the prose pass, after F-3 had moved the formatter: "Nobody would
catch `0:5` until a game was played on a short countdown and its recap
printed" — but the header now prints through the same formatter, so an
unpadded field shows for ten seconds of every minute of every timed game. And
"It is asserted twice on purpose — through `formatTimerSeconds` directly" —
the formatter's spec asserts `0:09` and `0:00`, not `0:05`; what is asserted
twice is the padding.

**WORKED.** The docstring says where the game would show it (the header, ten
seconds a minute) and that the PADDING is what both specs pin.

### F-timer-15 · `browser-side-clock` · `codenamesduet.sql`'s `submit_timeout` header calls the clock browser-side

"The FE clock is browser-side (count-down ticks locally)" and "the rationale
on FE-driven clock" — the same stale claim as F-11, found by grepping for its
words. The file is `cs-unmet`; the two sentences are this area's truth and
are fixed in passing.

**WORKED**, the two clock sentences only. The same header's "raises P0001
'game is not active'. The FE swallows that" (and its twin in
`psychicnum.sql`'s `submit_timeout` header, and a third at codenamesduet's
`end_game`) predates the envelope sprint and is left for those games' areas
to read with the RPC open — it is an envelope claim, not a timer one, and
what each raises today was not verified here.

## Notes

- **A forward-fix at the listing, 2026-09-16, before the roster was agreed.**
  Listing the folder's importers showed bananagrams' `PlayArea.tsx` reaching in
  for `timerLabel` — the only game to. Joel: *"is there any real reason
  bananagrams is different?"* There was none: its info column rendered a
  hand-kept `<li>` list from before the shared recap existed, while its
  `lib/setupSummary.ts` fed only the PDF — and the two disagreed, the PDF
  printing `dump_to_bag` the wrong way round. Fixed on *"fix this"*: the
  disclosure maps `summaryRows` like every other game, the summary reads the
  dialog back in its own order and words, the dump row is the right way
  round, and `lib/setupSummary.test.ts` (new) plus a `PlayArea.test.tsx` spec
  pin it, plant-verified. `timerLabel`'s docstring ("two places print it") is
  true again without being touched. bananagrams' files keep `cs-unmet`; this
  folder's were not read.
- **A stale fixture field in `game-page`, found by the prose pass's sweep.**
  `useCommonGame.test.ts`'s `GAME_ROW` set `total_idle_seconds: 0` — a column
  the accumulator took with it; nothing in the schema has it. Recorded rather
  than deleted, because subtracting from another area's blessed fixture is
  Joel's call; he made it (*"do it"*) and it is gone. The suite is green without
  it, which is the proof nothing read it.
- **`tick_timer` IS pinned by pgTAP** — `supabase/tests/common/tick_timer_test.sql`,
  nine specs, the conditional exercised by rewinding `last_tick` by hand. An
  earlier version of this note said the opposite and handed the gap to the
  area that reads `common.sql`'s functions; F-timer-10 (`phantom-absence`)
  retracts both. Nothing is owed. The file stays `cs-unmet`: it was read as
  evidence, not audited.
- **`docs/deferred.md`'s heartbeat item** ("`tick_timer` is the heartbeat we
  already have and don't use") is true today and out of this area's scope: it
  is a presence/disconnect design, filed deliberately. Left where it is.
- The hook's call-site shape — `presentFaults: false` on both calls, four
  treatments decided per answer — is the model `guards/callSiteShape.test.ts`
  cites, and it checked out against `docs/envelopes.md`: silent for the
  environmental codes, shown for PN011/PN012, moot for PA004, a scream for
  anything else. The seed read's comment explains why it matches the driver.
- `mergeTicks`'s threshold (`server < prev - 2`) is a hand-tuned number with
  its reason beside it (reordering differs "by a tick or two"; a reset differs
  by the whole count). Read and left.
- Every e2e fixture sets `timer: { kind: 'none' }` on purpose (a countdown
  could end a game mid-spec); `e2e/gallery/timeOut.ts` is the one screenshot of
  a timed-out state. No e2e drives the clock.

## Predicted test breaks

If F-3 moves `formatTimerSeconds`: `useGameTimer.test.ts` imports it from the
hook file (its `describe('formatTimerSeconds')` block moves with the function
to `timerLabel.test.ts`); `useCommonGame.test.ts` mocks `'../timer/useGameTimer'`
with only `useGameTimer` and would have failed if `GamePage` still took the
formatter from there — it will not, once the import moves. If F-4 names the
effects: nothing asserts on effect names.

## Closing

- [x] the whole area re-read in one sitting after the last group — with the
      effect-name grep over every file touched (2026-09-16, seven findings)
- [x] the folder's `doc.md` intro written; its row off `INTROS_OWED` (F-1;
      `## Details` harvested again at the re-read)
- [x] `todo.md` holds everything still owed; nothing durable left in this file
      (nothing is owed — `todo.md` is empty on purpose)
- [x] every file on the roster blessed, or its stamp says why not — **DONE
      2026-09-16**, on Joel's words (*"mark files in this area as blessed, then
      close the area"*): the folder's four `.ts` files read `cs-blessed-timer`.
      The SQL half keeps `cs-unmet` — evidence, not roster, by Joel's ruling at
      the opening.

## Closing summary

Moved here from `plans/app-audit.md` (its "Where to start" notes and its row in
the areas table) when that file was trimmed to the process, 2026-09-23.

**CLOSED 2026-09-16, blessed** (Joel: *"mark files in this area as blessed, then close the area"*): four files `cs-blessed-timer`. The game clock — one integer counting seconds of play, and the words a configured timer is described in. The SQL half (`common.tick_timer`, `require_valid_timer`, the `timers` table) was EVIDENCE by Joel's ruling, read and left `cs-unmet`. Fifteen findings in `plans/areas/timer.md`, all worked: eight from the reading, seven from the closing re-read. What changed the app: M:SS is written once, in `timerLabel.ts`, and the hook file is the hook (no printer reaches through the poller); the hook's orphaned essay became `doc.md`'s intro and a twelve-line docstring that says the hook fires nothing; `ticked(n)` in the test; five stale doc claims about the old accumulator gone from `common.md`, `win-lose.md`, `states.md`, and after the re-read from `gameManifest.ts` and `codenamesduet.sql` too. Two decisions that outlive it: the hook-callback rule now tests the BODY, not the call shape (Joel: *"if they're non-trivial, a name is useful"*), and `expired` stays a level because a hook cannot hand back a one-render edge under StrictMode — F-8's recorded reason was wrong and the re-verify found the real one. The re-read's lesson, for the seventh area running: a finding that overturns a reason has to chase every file that wrote it (`doc.md` still had F-8's struck rationale), and a NOTE can have a false premise too — "no pgTAP for `tick_timer`" handed off a gap that a nine-spec file had covered since June
