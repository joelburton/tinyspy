# Area: utils

The folders it reads: `utils`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN** (2026-09-04). Roster agreed, every file stamped
`cs-met-utils`, lede + Design written, findings recorded. Nothing worked yet.

## The roster

`src/common/utils/`, its own files only:

| file | what it is | stamp |
|---|---|---|
| `cls.ts` | class-name combiner | `cs-met-utils` |
| `friendlyDate.ts` + `.test.ts` | relative-date ladder for the club page's game list | `cs-met-utils` |
| `linkify.tsx` + `.test.tsx` | URLs in a run of text become `<a>`s | `cs-met-utils` |
| `logStamp.ts` | the `HH:MM:SS.mmm` console stamp | `cs-met-utils` |
| `mulberry32.ts` + `.test.ts` | the seedable random-number generator | `cs-met-utils` |
| `doc.md` | lede + Design, written at the opening | — |
| `todo.md` | empty in all four sections at the opening | — |

No CSS, no hooks, no component. Dependents are not on the roster: `cls` alone
is imported by 116 files, and Deno reaches `mulberry32` by relative path.

**What the audit checked, per file:** every claim a docstring makes was looked
up in the tree (callers, named files, the seed formula, the `>>> 0`
normalization, the `[rpc]` line), the docstring-marker pass (`/**` only on a
file, type or function), the naming rules, and the folder's own tests + eslint
(24 tests, both green at the opening).

## Findings

### F-utils-1 · `shuffle-six-copies` · Fisher–Yates is hand-written six times in `src/` and three more in Deno, and none of them is a util

The one helper this folder is missing. The same loop, in the same shape:

| where | signature | rng |
|---|---|---|
| `wordwheel/components/BoardCol.tsx` `shuffled` | `(arr: readonly T[]) => T[]` | `Math.random` |
| `spellingbee/components/BoardCol.tsx` `shuffled` | identical to wordwheel's, character for character | `Math.random` |
| `psychicnum/components/BoardCol.tsx` `shuffled` | identical again | `Math.random` |
| `connections/lib/localOrder.ts` `shuffleTiles` | `(tiles: string[]) => string[]` | `Math.random` |
| `scrabble/lib/policy.ts` `shuffle` | `(arr: readonly T[], rng) => T[]` | seeded |
| `bananagrams/lib/board.ts` `shuffleString` | on a string | `Math.random` |
| `supabase/functions/letterboxed-build-board/board.ts` `shuffle` | `(xs: T[], rnd) => T[]` | seeded |
| `supabase/functions/wordwheel-build-board/index.ts` `shuffled` | `(arr: T[]) => T[]` | `Math.random` |
| `supabase/functions/spellingbee-build-board/index.ts` `shuffled` | same | `Math.random` |

**Proposed:** `utils/shuffle.ts` exporting
`shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[]` —
a copy, never the input; no imports, so Deno can load it the way it loads
`mulberry32`. The default is a decision: five of the nine copies take no rng,
and the seeded four pass one explicitly, which is exactly the
seeded-where-it-must-repeat rule the Design states. A test beside it, seeded
through `mulberry32`: same seed → same order, the result is a permutation, the
input is untouched.

**What ships in this area:** the util and its test. **The nine callers are
other areas' files** — each game's area converts its own when it opens, unless
Joel calls the switch a sweep (a rename-shaped change, `tsc -b` stays alive).
Either way the callers' stamps do not move.

### F-utils-2 · `linkify-home` · `linkify` describes itself as chat's and has one caller in chat; `friendlyDate` names the club page. Do they belong here?

Both docstrings introduce the helper by its caller: "Make the URLs inside a
chat message clickable", "for the club-page game list". By the Design's rule
(what a helper knows, not who calls it) both stay: neither imports or names a
feature type, and a friendly date or a clickable URL is not a club's or a
chat's idea. The alternative is `common/chat/linkify.tsx` and
`common/club/friendlyDate.ts`, which the one-caller principle in
`docs/common-folders.md` argues against ("count is not the test").

**Recommendation:** keep both; the docstrings' first line names the job, and
the caller is mentioned as the caller, not the purpose. Joel decides.

### F-utils-3 · `linkify-docstring` · Two claims in `linkify`'s docstring are wrong or unverifiable

- "Pure, and exported for its own unit test" — it is exported because
  `ChatBody` imports it; the test is a beneficiary, not the reason.
- "one caller, and no message has hit it" — the one caller is true today
  (`ChatBody.tsx:137`); "no message has hit it" is a claim about prod data
  that nothing in the tree can check, and it stays in the file after it stops
  being true. Say the trade-off and stop.

### F-utils-4 · `calendar-day-diff-rationale` · `calendarDayDiff`'s docstring carries the why-of-the-implementation

Two of its three paragraphs defend the body: "Rounded, not floored, because
two local midnights are 23 or 25 hours apart across a daylight-saving change"
and "`then` is always in the past here". By the docstring rule
(docs/code-conventions.md → Code clarity & docstrings, `dbLog.ts` as the
model) a paragraph that explains why the implementation is what it is sits on
the line it defends as `//`, and the docstring keeps the contract: local
midnights compared, same day 0, yesterday 1. The DST test's comment already
says the rounding argument well; the body's `//` can be the short version.

### F-utils-5 · `db-line-stamp-position` · The three stamped channels do not share one line shape, and `logStamp`'s docstring says they do

`logStamp.ts` lists `[db …]`, `[rt …]`, `[ui …]` as "the one format all three
share". The stamp is shared; the prefix is not:

```
[db] 12:00:00.000 rpc create_game severity=… ← dbLog.ts: stamp AFTER the bracket
[rt 12:00:00.000] game:abc — status SUBSCRIBED  ← realtimeDiag.ts: stamp INSIDE
[ui 12:00:00.000] playarea slot mounted — …     ← PlayAreaMountLog.tsx: INSIDE
```

So a console filtered on `[db]` and one filtered on `[rt` are two different
gestures, and the docstring's table shows a shape `[db]` does not have.

**Two ways out, Joel's call:** (a) the docstring shows the real shapes and
says the stamp is what is shared; (b) the three converge. If (b), the `[db]`
line is `supabase`'s file and the other two are `realtime`'s and
`game-page`'s, so the decision is recorded here and the edits land as a line
in each owning `todo.md`, or as a sweep on Joel's word.
`docs/realtime-lost-events.md` prints the `[rt …]` shape in a table and
`docs/envelopes.md` names the `[db]` line throughout, so (b) touches docs too.
Predicted spec breaks for (b) are listed below.

### F-utils-6 · `policy-test-seed-claim` · `mulberry32`'s docstring says `policy.test.ts` puts the seed in the test name; it does not

The claim holds for `scrabble/lib/suggest.test.ts` (`random soup board, seed
${seed}`), not for `policy.test.ts`, whose seeds are literal `mulberry32(42)`
arguments under prose names. Cite `suggest.test.ts` alone. Every other named
caller in that docstring checks out: boggle's `rollBoard`, the stackdown
board script, the edge function's `(version, seat)` seed and its `>>> 0`, and
the `policy.ts` formula the test file quotes.

### F-utils-7 · `terse-match-names` · `m`, `tm`, `n`

`linkify.tsx` walks matches as `m` and the trailing-punctuation match as
`tm`; `linkify.test.tsx`'s `isAnchor` takes `n`. Locals, so the "no
single-letter helpers" rule does not strictly apply; a quibble, and cheap:
`match`, `trailMatch`, `node`.

### F-utils-8 · `friendly-date-docstring` · Two lines in `friendlyDate`'s docstring describe surfaces that do not exist

- "for the club-page game list and other glance-at surfaces" — the callers
  are `ClubGameCard` and `ClubGameRow`, both the club page's list. There is no
  other surface.
- "If a future surface needs ticking, layer a 1Hz interval + setState on top"
  — advice for work nobody has asked for; the "Doesn't tick" contract above it
  is the part a caller needs.

## Notes

- **`cls` is the folder's whole reason to exist for 116 files** and has no
  dependency behind it; `package.json` carries neither `clsx` nor
  `classnames`, and no other file in `src/` hand-rolls the same
  `filter(Boolean).join(' ')`. Nothing to find.
- **Deno reaches into this folder.** `scrabble-ai-move/index.ts` imports
  `mulberry32.ts` by relative path with an explicit extension, and so does
  `scrabble/lib/policy.ts` (because Deno loads policy.ts too). That is why the
  Design says a Deno-imported util carries no imports; it is also why
  F-utils-1's `shuffle` must be written the same way.
- **`friendlyDate` on a bad ISO string returns the literal text `Invalid
  Date`** (NaN falls through every bucket to `toLocaleDateString`). Its only
  input is `common.games.last_active_at`, a NOT NULL timestamp, so no caller
  can reach it; recorded so nobody re-derives it.
- **The two test files differ in their top-of-file marker on purpose:**
  `mulberry32.test.ts` opens with a `/**` file docstring (what the file
  promises), `friendlyDate.test.ts` with a `/*` block about the `NOW` anchor
  (a note about a constant). Both are right under the marker rule.
- **The `[rpc]` line exists** — `supabase/functions/_shared/dbResult.ts:118`,
  on Deno's clock, exactly as `logStamp`'s docstring says.
- **The tests assume the local zone**, and the DST case assumes a US zone;
  the file says so itself. Not a finding; a machine in a zone without DST
  proves less and fails nothing.

## Predicted test breaks

None from anything recorded above as it stands. If F-utils-5 takes branch (b)
and the `[db]` line moves its stamp inside the bracket, the specs that pin the
prefix are: `common/supabase/dbResult.test.ts`, `common/supabase/dbFetch.test.ts`,
`common/faults/faultStore.test.ts`, `guards/callSiteShape.test.ts`,
`guards/noRawServerMessage.test.ts`, and `waffle/components/PlayArea.test.tsx`
(the realtime pair, `realtimeDiag.test.ts` and `channelTeardown.test.ts`, pin
`[rt ` and would not move).

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [x] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
