# Area: timer

The folders it reads: `timer`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: AUDITED 2026-09-16.** Roster agreed and stamped `cs-met-timer`; every
file read. The clock's SQL half — `common.tick_timer`, `common.require_valid_timer`
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
here rather than drifting. **Still owed: the `ticked(n)` helper** in
`useGameTimer.test.ts` — seven 200-character envelope literals differing only in
N. That is a code change, not prose.

### F-timer-8 · `expired-is-a-level` · `expired` is a level and every consumer wants an edge or a fact

`expired` is `mode.kind === 'countdown' && displaySeconds === 0`, recomputed
every render. `GamePage` needs the TRANSITION and builds it with a ref and a
twelve-line comment about why a level re-ends a replayed game. The games that
read it (`waffle`, `wordle`, `connections`, `psychicnum`, `stackdown`) use
it as a fact about a terminal game ("did the clock end this?"). Both are served
by the level as it is; recording this so the question is asked once: whether
the hook should hand back the edge (`justExpired`, true for one render) so the
ref and the comment leave `GamePage`. Options: (1) leave it — `GamePage`'s
edge also gates on `paused`, which the hook does not know, so the ref would
move rather than go; (2) add `justExpired`; (3) hand back the edge and let
`GamePage` gate it. Recommend (1) and close: the hook's job is the number, and
`game-page` is closed with that comment blessed.

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
- **`tick_timer` has no pgTAP of its own.** The functions that touch
  `common.timers` in `supabase/tests/` are the replay tests (the zeroing) and
  codenamesduet's create test (the seed row). The conditional that IS the
  design — one tick per real second however many ask, `last_tick` renewed, a
  read-back when the WHERE misses, PA004 for a deleted game — is exercised only
  by playing. SQL is evidence here by Joel's ruling, so this is a handoff: it
  belongs to whichever area reads `common.sql`'s functions, recorded here so
  the question is asked with the file open.
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

- [ ] the whole area re-read in one sitting after the last group — with the
      effect-name grep over every file touched
- [ ] the folder's `doc.md` intro written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
