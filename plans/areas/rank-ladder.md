# Area: rank-ladder

The folders it reads: `shared/rank-ladder`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — opened 2026-09-21.** Roster agreed the same day; seven files
`cs-met-rank-ladder` plus the two markdown ones, which carry no stamp. Baseline
at the opening: 20 of 20 green in the folder, lint clean, `tsc -b` clean.

## The roster

`src/shared/rank-ladder/` — every code file `cs-met-rank-ladder`:

- `rankLadder.ts` · `rankLadder.test.ts` — the ladder: `RANKS`, `GENIUS_AT`,
  `rankThreshold`, `rankPoints`, `currentRankIndex`. Its spec is the only place
  the FE↔SQL lockstep is written down
- `RankBar.tsx` · `RankBar.module.css` · `RankBar.test.tsx` — the seven-square
  bar. The stylesheet is the folder's largest file
- `Stats.tsx` · `Stats.module.css` — the two-cell Score/Words grid
- `doc.md` (a one-line lede; the `## Intro to area` is OWED — `shared/rank-ladder`
  is on `INTROS_OWED` in `src/guards/folderDocs.test.ts`) · `todo.md` (empty)

**Two things were agreed AS EVIDENCE rather than roster, at the opening:**

- **boggle's `components/Stats.tsx`** (Joel: *"examine boggle as evidence"*) —
  it imports `Stats.module.css` and nothing else from here, to draw its own
  four-cell grid. Read, reported below, not stamped.
- **the SQL twin `<schema>._rank_idx`** (Joel: *"examine and report in this
  area"*) — `supabase/sql/spellingbee.sql:156` and `wordwheel.sql:156`. Read and
  reported here rather than left to the two game areas; not stamped, since the
  files are each game's.

Evidence, to be read but NOT on the roster: both bee games' `InfoCol.tsx`,
`BoardCol.tsx`, `manifest.ts`, `SetupForm.tsx`, `lib/setupSummary.ts` and
`PlayArea.tsx` — nineteen import sites across the two — plus `docs/mobile.md`
and the five places `docs/games/spellingbee.md` cites the ladder.

## What the opening already established

**The FE↔SQL lockstep HOLDS, verified numerically rather than argued.**
`rankLadder.ts` fixes float drift in `rankPoints` (its docstring names the
failing case, `63.00000000000001`) and leaves `currentRankIndex` on float
division, while claiming all three implementations agree. The FE bar fill was
compared against the SQL integer win-check over **4,004,000 pairs** — totals
1..2000, scores 0..2×total, plus total=0 — with **zero disagreements**. The
algebra in the docstring is right, and the closing re-read does not need to
redo this.

**The `folderDocs` guard was red on a clean tree for this sprint's last several
areas, and it was not code.** `src/common/lib/game/trie.ts/` and
`src/common/lib/util/mulberry32.ts/` were empty DIRECTORIES named after files —
untracked, created 2026-09-20 17:23 by something that made the destination a
directory instead of moving into it. The real files are
`src/shared/dict-trie/trie.ts` (`cs-unmet`, its area unopened) and
`src/common/utils/mulberry32.ts` (`cs-blessed-utils`); both were verified
present and tracked before anything was removed. Five empty directories deleted
with `rmdir`, which refuses a non-empty directory — so the command succeeding is
the proof they held nothing. **`src` is now 3367 of 3367 green.** Nothing was
committed, because git tracked none of it.

## Findings

*(`F-rank-ladder-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

### The audit's findings — 2026-09-21

**Eleven findings, F-rank-ladder-1 to -11; nothing in the code moved at the
read.** Shipped since: F-8, and F-7 with it. Every roster file read end to end, plus the evidence: both bee games'
nineteen import sites, boggle's `Stats.tsx`, the two `_rank_idx` copies,
`docs/mobile.md` and the five spellingbee-doc cites. Baseline `tsc -b` clean,
lint clean, 20 of 20 green.

What the folder IS: three exports and two stylesheets. `rankLadder.ts` is the
seven tiers, the 70% Genius mark, and three functions over them — the fraction
that unlocks a tier, the absolute score that unlocks it, and the tier a score
has reached. `RankBar` draws seven squares and fills the reached ones; `Stats`
is a two-cell Score/Words grid. There is no data model, which is why any game
with a ladder can take it — and one game takes only the stylesheet.

**The maths held up, and the opening proved it numerically** (4,004,000 pairs,
zero disagreements between the FE bar fill and the SQL win-check). The care in
`rankPoints` is real: `Math.ceil((i * 7 * total) / 60)` exists because
`rankThreshold(i) * total` can land at `63.00000000000001`, and the docstring
names that case. The tab-order decision is right and the spec that pins it is
one of the better ones in the repo.

**What has drifted is everything around the maths.** Three docstrings roster the
two games and explain what the code used to be; one gives the WRONG REASON for
the lockstep the opening just proved; the SQL's own comment points at a file
that does not exist. And under that: the bar's central behavior has no spec at
all, `Stats` has no spec at all, and the two stylesheets carry twenty
unconverted literals.

### F-rank-ladder-1 · `doc-md` · The intro is owed

**SHIPPED, 2026-09-21** (Joel: *"do it"*). The intro is written and
`shared/rank-ladder` is off `INTROS_OWED`; `folderDocs`'s in-shape case passes
and `docLinks` is green.

It opens on the fact everything else follows from — Genius is a FRACTION of a
board's maximum, not a score — and then carries the four things this area
decided, none of which existed in writing a day ago: why the ladder is computed
twice and that **algebra rather than shared code** is what holds the halves
together (with the exhaustive check as the evidence, and the real constraint
named: preserve the equivalence, which is stronger than leaving the constants
alone); that a tier is a READOUT, which is one idea with two consequences that
look arbitrary apart — nothing focusable, and the tooltip host's three timings
reversed; why the type is relative where the ramp is absolute; and why the
ladder's colors are shared while `--rank-text` is not.

`## Details` carries the call tree — including boggle taking `Stats.module.css`
alone, and `submit_word` → `common._rank_idx` — the twice-per-page shape, the
tight `12/93` rule and where it belongs, and the bespoke lengths.

**The guard caught the first draft, and it is the SECOND area running that it
caught the same way:** four intro paragraphs opened with a bold claim, which is
a Details item wearing an intro's clothes. `found-words` F-1 made exactly this
mistake and the lesson was recorded there — and it did not transfer, because
the rule is easy to agree with and easy to not notice yourself breaking. The
four now open narratively.

`doc.md` is one sentence — *"The rank ladder, the bar that draws it, and the
stat grid beside it. There is no data model behind it, so any game with a
ladder can take it."* — and `shared/rank-ladder` is on `INTROS_OWED`. The lede
is good and its second clause is the folder's whole justification, so the intro
builds on it rather than replacing it. What it owes: **why there are two
implementations of one ladder and why that is not duplication** (the FE needs a
fraction to place a square, the SQL needs an integer to decide a win, and
`(score * 60) / (total * 7)` is the algebraic rearrangement that lets them agree
without sharing code — with the 4,004,000-pair result as the evidence that they
do); **why `rankPoints` does integer arithmetic** where `currentRankIndex` does
not; and **the readout rule** — a tier is not focusable, which is a decision
with a scar behind it (F-5). `## Details` carries the call tree and the fact
that the bar renders twice per game.

### F-rank-ladder-2 · `achieved-unpinned` · Which squares fill has no spec, and the plant is clean

**SHIPPED, 2026-09-21** (Joel: *"do it"*). One case, 2 → 3, no production code
touched. Start alone at 0/40, three squares at 12/40, all seven at a full
clear. The plant that had been green all session — `i <= idx` → `false` — now
fails it, as does an off-by-one.

**Selected through the stylesheet's own export, after checking rather than
assuming.** I wrote it against a literal `.achieved` on the strength of a memory
note saying vitest CSS modules are proxies; the case failed, and a probe showed
the class lands **hashed** (`_achieved_f92464`). `vite.config.ts`'s `css: false`
skips PARSING, it does not stub the names. So the selector is
`` `.${styles.achieved}` `` — which is also the honest one, since a literal
would have passed only by accident. (The memory's substance still holds:
indexing a stylesheet for a key that no longer exists yields `undefined`, which
`cls()` drops silently. It is the word "proxy" that is loose.)

**And a third plant caught an overclaim in my own comment** — the third time
this session that planting AFTER writing has found the prose wrong rather than
the code. I had labeled the full-clear assertion "the CLAMP", and an unclamped
index passes it: `i <= idx` caps at seven whatever `idx` is, because there are
seven squares. The clamp belongs to `currentRankIndex` and
`rankLadder.test.ts:138` already pins it. The comment now says what the
assertion earns and points at the real home.

The bar's entire job is unpinned. Planted:

```
i <= idx && styles.achieved   →   false && styles.achieved
```

**20 of 20 pass.** No square fills, for any score, and nothing notices.

The spec's two cases are the tab-order rule and the text content, and the text
case incidentally catches two OTHER regressions — planting `isTarget = false`
fails it (the `· target` bubble), and an off-by-one on `idx` fails it (the
label). So the file is not weakly tested; it simply never asserts the one thing
a reader would assume it asserts first: that a square at or below the current
rank is filled and the rest are hollow.

No decision in it. `container.querySelectorAll` already gives the spec the list
items, so the case is the count of `.achieved` against `currentRankIndex` at a
couple of scores, including 0 (only Start) and a full clear (all seven, clamped).

### F-rank-ladder-3 · `stats-untested` · `Stats` has no spec at all

**SHIPPED, 2026-09-21** (Joel: *"do it"*). A new `Stats.test.tsx`, three cases,
no production code touched — and the file joins the roster as
`cs-met-rank-ladder` (created files join the roster), so the census is ten.

Each case pins a decision that was broken or disagreed with before it was
written down: the pair is written TIGHT (boggle's grid on the same stylesheet
wrote it with spaces until F-9 the same day), the denominator wears `.muted`
(what makes the pair read as one figure), and every size is RELATIVE (today's
ruling — the grid tracks `--font-size-packed` in the status bar).

The third is a STATIC read of the stylesheet, not a render assertion: `css:
false` means nothing computes a size under vitest. It asserts the UNIT rather
than the numbers — every `font-size` ends in `em` — which is the shape
`TooltipHost.test.tsx` uses to check `utilities.css` still carries the rule only
CSS can carry.

All three planted: spaces round the slash fails two of them, unmuting the
denominator fails one, and putting a single size back on the rem ramp fails the
static one.

**The americanSpelling guard caught me twice in one commit** — `labelled` in
this file and `neighbour` in the new spec. Both are in prose I wrote today, and
CLAUDE.md's first prior is that the rule holds in comments and docs as much as
in identifiers.

There is no `Stats.test.tsx`. The component derives nothing, so what is worth
pinning is narrow but real: the tight `12/93` format — which is a DECISION with
a stated reason (*"the pair is one figure, and the spaces cost width the mobile
status area doesn't have"*) and which boggle's copy disagrees with (F-9) — and
that the denominator wears `.muted` so it reads as the denominator. Two
assertions.

### F-rank-ladder-4 · `roster-archaeology` · Three docstrings roster the two games and date themselves to a refactor

Each says who shares the file and what the code used to be:

- `RankBar.tsx:17–18` — *"shared by spellingbee + wordwheel (their per-game
  `RankBar` copies were identical bar the accent token)."*
- `Stats.tsx:13–14` — *"Shared by spellingbee + wordwheel (their per-game
  `Stats` copies were identical bar the text token)."*
- `rankLadder.ts:4–5` — *"shared by the found-words rank-ladder games
  (spellingbee + wordwheel — both ports of the NYT-Bee-style `*-ws`
  originals)."*

The parentheticals are how it used to work, which the comment rule excludes, and
the rosters are wrong the moment a third game takes the ladder — which has
already happened for the stylesheet, since boggle takes `Stats.module.css`
(F-9). The condition is in the lede already: a game with a rank ladder. The
`*-ws` provenance is worth keeping ONCE, and `doc.md` is where (F-1).

### F-rank-ladder-5 · `tabindex-story-twice` · One scar, told twice at length, with a count in three places

The `tabIndex={0}` incident of 2026-08-16 is told in ten lines at
`RankBar.tsx:56–65` and told again in sixteen lines at `RankBar.test.tsx:9–25`.
Both accounts are good; two are one too many, and the comment is the wrong one
to keep — a comment explains the code in front of the reader, and what is in
front of them is `<li>` with no `tabIndex`, which needs one sentence. **The
spec's header is the right home**: it exists to explain why those assertions
exist, which is exactly the scar.

The count rides along in three places: *"fourteen in the DOM"*
(`RankBar.tsx:52`), *"fourteen dead tab stops"* (`RankBar.test.tsx:24`), and
*"renders TWICE per game… in both spellingbee and wordwheel"* (`:22–23`). Two
games × two mounts is a number that rots on the next game to take the bar; the
durable fact is that the bar renders more than once per page, so a tab stop in
it multiplies.

### F-rank-ladder-6 · `false-lockstep-reason` · The right claim with the wrong reason

`RankBar.tsx:31–33`: *"Pure derivation from `score` + `total` via
`currentRankIndex`; the FE never disagrees with the SQL `_rank_idx` because both
compute from the same constants."*

The claim is TRUE — the opening proved it over four million pairs. **The reason
is false, and it is the kind of false reason that invites the break.** They do
not compute from the same constants: `currentRankIndex` walks float
thresholds (`ratio >= rankThreshold(i)`), `_rank_idx` does one integer division
(`least(6, (score * 60) / (total * 7))`). They agree because the second is an
algebraic rearrangement of the first, which is what `rankLadder.ts:11–14` says
properly. A reader who believes "same constants" will feel free to change the
loop, since the constants would be untouched.

Say the real reason or point at `rankLadder.ts`, which already has it.

### F-rank-ladder-7 · `sql-cites-a-missing-file` · The SQL comment names `ranks.ts`, which does not exist

`supabase/sql/spellingbee.sql:150–154` and `wordwheel.sql`'s twin: *"Why integer
math: avoiding floating point makes the result bit-for-bit reproducible across
implementations (the FE port of this in `ranks.ts` uses the same expression)."*

Two faults. **There is no `ranks.ts` anywhere in the repo** — the file is
`src/shared/rank-ladder/rankLadder.ts`; `ranks.js` is the name in the
`spellingbee-ws` original, which is not in this repo either. And *"uses the same
expression"* is not true: the FE uses float thresholds, and the reason the two
agree is the rearrangement, not sameness. The integer-math rationale itself is
worth keeping — it is the best statement of it anywhere.

Both files are `supabase/sql/`, so this is an in-place edit forever
(CLAUDE.md → Schema vs code), not a migration.

### F-rank-ladder-8 · `sql-twin-duplicated-and-untested` · One function, two copies, no pgTAP

**RULED (1) AND SHIPPED, 2026-09-21** (Joel: *"q1. common._rank_idx / q2: both
at once"*). One `common._rank_idx`, beside `common.wordle_colors` whose shape it
follows exactly — same `immutable`, same `revoke execute … from public`, called
from more than one game's SQL, pinned by a pgTAP per consumer. Both per-schema
definitions are deleted and **20 call sites** rewritten (10 per game). Both
files are `supabase/sql/`, re-applied in full on every deploy, and nothing in
`supabase/migrations/` referenced the old names, so there is no migration and
nothing to back-fill.

**F-7 shipped with it.** The `ranks.ts` cite lived inside the two definition
blocks this move deleted; the new comment points at
`src/shared/rank-ladder/rankLadder.ts`, which exists. The only surviving
`ranks.js` is `docs/games/spellingbee.md:540`, citing the `spellingbee-ws`
ORIGINAL outside this repo — provenance, not a dead path.

`supabase/tests/{spellingbee,wordwheel}/rank_idx_test.sql`, 11 cases each: the
zero-total guard, score 0, five rank boundaries from both sides, the 63/108
threshold, and the clamp. **Both join the roster** as `cs-met-rank-ladder`
(created files join the roster), which is why the census is nine files rather
than seven. 181 files / 2545 tests green.

**A correction I had to make to my own work, and it is the useful part.** The
tests' header — and the comment I wrote on the moved function — claimed integer
math prevents a float implementation from landing a rank boundary a whole point
off. **Planting the float form passed both tests**, so I searched for a
`(score, total)` where a float form of THIS expression disagrees with the
integer form: **none in 4,004,000 pairs.** The float trap `rankLadder.ts`
documents is in the other direction — `rankPoints`, where `Math.ceil` over
63.00000000000001 costs a point — and I had transplanted it onto a function it
does not apply to. Both headers now say integer math here is determinism by
construction rather than a fix for an observed bug, and say what the assertions
actually earn: the ladder's clamp, guard and boundaries.

Three real regressions DO fail them, each verified: raising the clamp to 7,
shifting the ladder (60 → 61), and dropping the `total <= 0` guard (which dies
on the division, which is the guard's whole point).

**Correction to the finding as recorded:** it said 12 call sites per game. It is
10 — `grep -c` counted the `create or replace` and `revoke` lines too.

**THE MOVE WAS INCOMPLETE, and a `gen-types` run is what found it
(2026-09-21).** Deleting a `create or replace` from `supabase/sql/` does NOT
remove the function from a database that already has it — that file is
**re-applied, not diffed**. So `spellingbee._rank_idx` and
`wordwheel._rank_idx` were still live in the local database after the move, and
would have stayed live on prod through every future deploy: two orphaned
functions nothing called and nothing would ever drop.

It surfaced because the regenerated `db.ts` listed `_rank_idx` **three** times —
`common`, `spellingbee`, `wordwheel` — and `pg_proc` confirmed all three
existed. Both games' SQL now carries `drop function if exists
<schema>._rank_idx(int, int);` with a note saying why a retired signature has to
say so, which is what the other sixteen SQL files already do (every one of them
has drops; `common.sql` has nineteen). After re-applying, `pg_proc` returns
`common._rank_idx` alone.

**No migration.** The drop lives in `supabase/sql/`, re-applied in full on every
deploy, so an ordinary `gmake deploy` retires them on prod — nothing to
back-fill and no shape change.

**The lesson is about what a regen is for.** `db.ts` had been flagged as merely
stale, cosmetic, "nothing calls it". It was the evidence of a live defect in the
database, and reading its diff was what turned a bookkeeping chore into the
find. 181 pgTAP files / 2545 green after the drops; 3372 FE green.

`_rank_idx` is **byte-identical** in `spellingbee.sql:156` and
`wordwheel.sql:156` apart from the schema name and its `search_path`. And
**nothing asserts it**: `_rank_idx` appears in `supabase/tests/` exactly once,
in `wordwheel/setup.psql`, as fixture setup. So the integer half of the ladder —
the half that decides a compete WIN — is pinned only by a TypeScript test that
re-implements it (`rankLadder.test.ts:106`'s `sqlIdx`), which pins the FE
against a copy of the SQL rather than against the SQL.

Reported here at Joel's word rather than left to the two game areas. The
decision is whose the function is: a `common._rank_idx` both schemas call, two
copies with a pgTAP each, or two copies and one shared pgTAP. Each game's
`submit_word` calls its own today.

### F-rank-ladder-9 · `stats-format-disagreement` · Two readers of one stylesheet disagree about the figure it exists to draw tightly

**RULED (1) AND SHIPPED, 2026-09-21** (Joel: *"i'll take your recs"*). boggle
goes tight: its four `sub` literals lose the space after the slash and the span
that renders them loses its leading space, so every grid built on
`Stats.module.css` writes `12/93`. Eight characters reclaimed in the narrowest
place the grid appears.

**And the rule moved to where it is actually shared** (Joel's yes to Q2). The
shared `Stats` docstring had stated the format as its own, while the stylesheet
it sits on has a second reader with different cells — so the component now says
what IT is (the two-cell grid for a game with a ladder, and that a game needing
different cells builds on the stylesheet instead, which is what boggle does),
and **`Stats.module.css`'s `.muted` carries the format rule** for every grid
built on the file. Adding the sentence there was forced by the docstring
change: saying "that belongs to the stylesheet" and then not writing it there
would have left it belonging to nothing.

The docstring also lost its roster and its archaeology while open — *"Shared by
spellingbee + wordwheel (their per-game `Stats` copies were identical bar the
text token)"* — which is F-4's fault at one of its three sites.

**This change is pinned by nothing, and that is worth saying.** boggle has no
`Stats` spec and neither does this folder (F-3), so there is no test to plant
against: the format is held by two comments and a code review. F-3's spec, when
it is ruled, pins it for the shared component's two cells; boggle's own copy
stays unpinned until the boggle area writes one. 416 green across boggle, this
folder and the guards; `tsc -b` and lint clean.

**Correction to the finding as recorded:** it says boggle renders *"a space
before the slash AND after it."* Only one of those was boggle's own — the `sub`
literal carried `/ 93` and the span added the leading space, so the rendered
string was `12 / 93` from two separate sources, which is why the fix needed both
edits.

`Stats.tsx:16–20` states a decision: each cell is written *"tight as `12/93` (no
spaces around the slash — the pair is one figure, and the spaces cost width the
mobile status area doesn't have)."*

boggle's `components/Stats.tsx:45` writes its denominator as `/ <count>` and
renders it as `<span className={styles.muted}> {sub}</span>` — a space before
the slash AND after it, so `12 / 93`. It is in the mobile status bar too
(`boggle/components/BoardCol.tsx:253`), with **four** cells where the shared one
has two, and its own docstring says the labels are stacked on two lines because
*"four cells side by side are narrow — narrower still in the mobile status bar."*
So boggle spends the width the shared component says is not there, at twice the
cell count, and nothing in `docs/games/boggle.md` records the choice.

The stylesheet KNOWS about boggle — `.percent` is documented as *"an OPTIONAL
third line… Only boggle passes one today"* and `.stats` as *"boggle swings
between 2 and 4"* — so this is not accidental coupling. Only the format
disagrees, and only this area can see both readers.

### F-rank-ladder-10 · `css-literals` · Twenty values on eleven pending rows

**FULLY WORKED, 2026-09-21.** Groups A, B and C all ruled, and the folder's
eleven pending rows are down to **three**: `.tier`'s radius, `.target`'s goal
outline and `.cell`'s gap, each with its reason written beside it and in the
guard row.

**Group B ended somewhere better than it started, and the reasoning is Joel's.**
It first went onto the type ramp where a step was close (`14px` and `13px` both
landing on `--font-size-2`, which is also what answered the 1px-apart question).
Then, working Group C, I argued the headline figure should be a bespoke `rem`
because an `em` would draw 18px in the info column and 17.1px inside
`<MobileStatusBar>`'s `.bar`, which sets `--font-size-packed`. **Joel: that is
the point** — *"the status info on mobile on the main page SHOULD be smaller on
mobile; that's the whole point of font-size-packed."* My premise was backwards:
I had treated the ancestor's packed size as a hazard when it is the design.

So every size in the readout is an em now — `0.75em` label and percent,
`0.85em` denominator and rank name, `1.125em` figure — and the whole grid scales
by the packed ratio on a phone (12.0/13.6/18.0px in the info column,
11.4/12.9/17.1px in the bar) with its proportions intact. **The ramp could not
express this**: its steps are rem, so they would have held their size while the
figure beside them shrank, and the grid would have half-tracked. That reverses
Group B's conversion for four values, and `em` is *allowed outright* by the
font-size vocabulary rather than excused — which is that vocabulary's own
rationale (*"a size RELATIVE to something… which a rem token cannot express and
should not replace"*), so **the folder now has no font-size row at all**.
`line-height` (unitless) and `--letter-spacing-label` (0.03em) already tracked.

**Group C was mostly exact matches** — `8px`, `0.5rem`, `12px`, `0.25rem` and
two `1px` borders all had a token and took it, moving nothing. Two rulings in
it: **padding does not answer to the spacer ladder** (Joel — the same ruling
`found-words` F-12 made, so `padding: 10px` became a bespoke `0.625rem`), and
`.cell`'s `2px` gap stays bespoke because the ramp's smallest step reads as a
break between a label and the figure it belongs to.

**A mistake of mine inside Group A, corrected on Joel's word.** I framed the
square's *"four lengths"* as tuned against each other and he ruled them bespoke
on that framing — but `.tier`'s `border: 2px` is exactly
`--border-width-line-thick`, so one of the four was never bespoke at all. Raised
rather than quietly converted, since his ruling rested on it; converted at his
*"fix .tier's border with the named size"*. The `.tier` note and the guard row
now separate the BOX (bespoke) from the EDGE (the app's thick line), and the row
lists only `.target`'s `3px`, which has no step and is defined relative to that
edge.

That fix immediately made a sibling inconsistent, which is worth recording as
the pattern rather than the incident: the new note said the track's connecting
rule *"is the same line drawn as a height"*, and `.track::before` was still a
literal `2px`. Either the comment was wrong or the height had to follow. It
follows (Joel's word) — `height: var(--border-width-line-thick)`, with the
reason that a pseudo-element draws its rule as a filled box rather than a
border, so the shared NAME is what keeps the two from being changed apart.
Nothing governs `height`, so no guard would ever have said so.

**GROUP A's remainder, ruled bespoke** (Joel: *"group A: keep as bespoke"*) —
the seven-square indicator's own geometry: `.tier`'s `14px` box and `2px`
radius, its `2px` edge and `.target`'s `3px`, and the track's `280px` cap.
Recorded in both places the next reader looks: a `.tier` note in the
stylesheet, and *"RECORDED, not unconverted"* comments on the two
`vocabularies` rows that still list them, the same shape `word-list`'s `7px`
got. **Groups B (type) and C (spacing) are still open** — Joel: *"we'll walk
through groups B and C after the listed changes are done."*

**The 80ms duration is gone rather than ruled, and F-11 with it** — see the
tooltip move below, which deleted the rule that held both.

### F-rank-ladder-12 · `hand-rolled-tooltip` · The bar drew its own bubble beside the app's one tooltip renderer

**RAISED BY JOEL AND SHIPPED, 2026-09-21**, out of F-10's duration question:
*"why would the tooltip here be any different from other tooltips?"* — and the
answer was that it should not be.

The app has one renderer, `common/tooltips/TooltipHost`, and opting in is a
`data-tooltip` attribute with nothing imported. RankBar instead had 40 lines of
its own: a `.tooltip` span per square, a `.tier:hover` rule, and a
`@media (--mobile)` block flipping the bubble below the squares. **That media
query is the failure `core-css/utilities.css` already names as the reason the
shared host exists** — *"a pure-CSS bubble cannot measure the viewport, so it
overflows at the edges and clips under overflow-hidden ancestors"* — rediscovered
locally and worked around locally. The hand-rolled version still had no
horizontal clamp: a `Genius · 76 pts · target` bubble centered on a 14px square
at the end of a 280px track hangs well outside it.

**But the host's defaults were wrong for a square, and that is Joel's find.**
Three of its behaviors are premised on the carrier being a control:
`SHOW_DELAY_MS = 400` (*"long enough not to flicker on a pass-through"*), touch
being a 450ms HOLD rather than a tap (*"unlike a tap-to-reveal, which would tax
every future tap"*), and `mousedown` hiding the bubble (*"a press means the user
is acting… a stale bubble would lie"*). On a rank square each protects nothing:
nobody crosses a readout on the way to pressing something, there is no tap to
tax, and pressing a square changes nothing. Joel: *"people hover over them
**just** to get the tooltip."*

So the host learned one kind of carrier — **`data-tooltip-on="readout"`**, which
changes all three together. The attribute names the KIND rather than a number
(Joel took that rec) precisely because a numeric delay would express one third
of the change and leave the other two to be rediscovered.

**A regression this avoided, which Joel caught before it happened:** today a TAP
shows the bubble on a phone, through the sticky `:hover` a touch leaves behind.
Moving to the host as-is would have required a 450ms hold instead. He flagged
it — *"needed for mobile, since there's no hovering"* — and tap-to-reveal is
part of the readout kind.

**Also corrected while presenting it:** I had described the change as making
the bubble appear *faster*. There is no beat today at all — `.tier:hover`
shows it immediately and the `80ms` was only the fade — so the readout delay is
0, not "shorter".

`TooltipHost.tsx` and its spec are `cs-blessed-common-hosts`, edited on Joel's
word (*"fix it now"*) and NOT re-stamped. Five cases added there (12 → 17),
each planted against: falling back to the control's beat fails two, letting a
press dismiss fails one, and requiring a hold again fails two. The fifth case
pins that a plain button's contract is untouched.

**Three follow-ons the deletion forced**, each found by re-reading rather than
by a check:

- `RankBar.test.tsx`'s text case asserted the tooltip text was in the DOM. It
  is an ATTRIBUTE now, so the case asserts that — and the split is cleaner:
  naming its tiers is this component's contract, and whether a bubble appears
  from the attribute is `TooltipHost.test.tsx`'s.
- The stylesheet's header still advertised *"a hover tooltip per square"* and
  called `--rank-text` *"the label + tooltip color"*. The bubble is not drawn
  here any more and does not read that token; `--rank-text` is the rank
  label's color, which `Stats.module.css` also reads.
- `vocabularies` went red with *"these values are excused on the pending list
  but are no longer written there"* — `4px`, `12px` and the whole `80ms` row
  belonged to the deleted bubble. Three rows trimmed.

Visually this is close to a no-op: the shared bubble is `--page-text-color` on
`--default-bg-color` where RankBar's was `--rank-text` on the same background,
and `--rank-text` is aliased to a near-black in both games. 3372 green,
`tsc -b` and lint clean.

`vocabularies.test.ts` carries eleven rows for these two stylesheets, twenty
values in seven vocabularies — the largest CSS surface left in `shared/`:

| vocabulary | RankBar.module.css | Stats.module.css |
|---|---|---|
| border-radius | `2px` `4px` | |
| spacer | `8px` `0.5rem` | `8px` `12px` `2px` `0.25rem` |
| font-size | `14px` `12px` | `11px` `18px` `13px` |
| line-height | | `1.2` |
| letter-spacing | `0.04em` | `0.06em` |
| duration | `80ms` | |
| border-width | `2px` `3px` | `1px` |

Joel decides the values. Worth noting before he does: the bar is a
seven-square track whose squares are small and whose tooltip type is smaller
still, so some of these are plausibly bespoke rather than unconverted — the same
ruling `WordList.module.css`'s `7px` got.

### F-rank-ladder-11 · `target-wins-by-source-order` · A load-bearing claim held up by line order alone

`RankBar.tsx:43–45`: *"The goal square keeps its outline after you reach it
(`.target` wins over `.achieved`), so the bar still reads 'this is what we were
playing to' at terminal."*

`.achieved` (`RankBar.module.css:101`) sets `background`; `.target` (`:116`)
sets `border-width` and `border-color`. They are the same specificity and do not
actually collide on a property — so the comment's "wins over" describes a
cascade contest that is not happening, and the real reason both show is that
they style different things. If either ever set the other's property, the
outcome would depend on which line came second, which nothing records or
guards.

No behavior to change; the sentence should say what is true — a reached goal
square is filled AND outlined, because the two rules style different
properties.

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to the folder's `doc.md`
or `todo.md` instead; a note here never stands in for either)*

## What checked out

Claims re-verified against code rather than taken from the docstrings, listed so
the closing re-read does not redo them: the FE↔SQL agreement (4,004,000 pairs,
zero disagreements — see the opening); `rankPoints`'s integer arithmetic and the
`63.00000000000001` case it names; the tab-order rule and its spec, which catch
an `isTarget` regression and an off-by-one on the label as a side effect; the
stylesheet's own account of boggle (`.percent` *"only boggle passes one today"*,
`.stats` *"boggle swings between 2 and 4"*) is accurate; `Stats.module.css`
declares six classes and boggle uses all six where the shared `Stats` uses five,
so `.percent` has exactly one consumer and it is named; `_rank_idx` really is
byte-identical across the two SQL files; `docs/mobile.md`'s RankBar cite
resolves; `docLinks` passes.

## Predicted test breaks

- ~~F-2: `RankBar.test.tsx` gains a case (2 → 3).~~ Shipped, exactly 2 → 3.
- ~~F-3: a new `Stats.test.tsx`, two assertions.~~ Shipped — three, the third a
  static read of the stylesheet.
- F-1: `src/guards/folderDocs.test.ts` — `shared/rank-ladder` comes off
  `INTROS_OWED` in the same commit as the intro, or the guard fails either way.
- F-10: `src/guards/vocabularies.test.ts` — eleven rows shrink or go as values
  convert; a row whose file stops writing any literal must be deleted.
- ~~F-8: a pgTAP file for `_rank_idx` if that is the ruling — `supabase/tests/`
  has none today.~~ Shipped: two files, 11 cases each, 2545 green.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` intro written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
