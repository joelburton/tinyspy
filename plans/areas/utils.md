# Area: utils

An area of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; **the plan holds the order** (§7 → "The areas, in order"), this file holds
everything else.

**What it is.** `src/common/lib/util/` — the small, general helpers that belong
to no page, no game and no subsystem. `deep` set them aside with the note that
each would be "picked up by whichever area uses them"; that answer was wrong in
the ordinary way, because a helper read by ten callers across six areas has no
such area.

**Created 2026-09-02** by Joel, while resolving `deep`'s two storage findings,
and scheduled directly after `deep`.

**Status: OPEN, audited twice — ten findings open from the second pass.** Twelve
files at `cs-audited-utils`: the seven on the roster below, plus the five this
area wrote (see "Files this area wrote"). The first pass produced `F-utils-1` …
`F-utils-12`, eleven resolved and `F-utils-7` a note whose work belongs to
`floating-panels`. **The second pass (2026-09-03, over the fixes themselves and
every file they touched) produced `F-utils-13` … `F-utils-22`, and all ten are
RESOLVED** — see "The second pass". `cs-blessed` remains the exit criterion and
Joel's alone.

## The roster

**Seven files, 433 lines.** Agreed 2026-09-03 by listing them and stopping.

```
  99  friendlyDate.ts        94  friendlyDate.test.ts
  35  keyboardHandoff.ts
  42  linkify.tsx            91  linkify.test.tsx
  27  mulberry32.ts
  45  outcomes.ts                                    (lib/ root, not lib/util/)
```

Three units carry a test; `keyboardHandoff` and `mulberry32` have none, which is
a question for the audit rather than an assumption.

**`outcomes.ts` is IN** (Joel, 2026-09-03, answering the shell's open question).
It sits at the root of `lib/` rather than in `lib/util/`, but it matches this
area's membership rule word for word — no page, no game, no subsystem — and the
competing owner (`corecss`, since the outcome families are also a color bucket)
would only ever see its color half. The other two loose files at that root went
to **`game-lib`**.

### Already read — `deep`'s, and not re-read here

Six files, 408 lines, all `cs-blessed-deep`. Listed so the folder's contents are
complete; they are `deep`'s record, not this area's:

```
  21  cls.ts                     F-deep-36 — "one util", read by nearly every component
  31  layoutWidth.ts
  22  logStamp.ts                created BY F-deep-28, out of realtimeDiag.ts
  68  panic.ts               96  panic.test.ts
  63  reloadOnStaleChunk.ts 107  reloadOnStaleChunk.test.ts   F-deep-4, F-deep-11
```

`reloadOnStaleChunk` is boot machinery that happens to live in this folder —
`main.tsx` calls it before the first render. `logStamp.ts` is the reverse: this
folder GAINED a file from an area auditing somewhere else.

**This shell's original roster was wrong in three ways**, recorded because the
same trap is set for every unopened area: it predated `panic.ts` /
`panic.test.ts` entirely, listed `layoutWidth.ts` as unread when it is blessed,
and gave stale line counts for `cls.ts` and `layoutWidth.ts`. Its summary line —
"eight files, none of them read" — was wrong in both halves. **A shell's guessed
roster is a note, never a count**; check the stamps at the opening.

## Findings

*(IDs are `F-utils-1`, `F-utils-2`, … — §21 → Areas. Every heading states its
status; no status prefix means OPEN.)*

**Audited 2026-09-03**, all seven files. The area is small and the code is
sound: there is **no logic bug in any of the seven**. Every finding below is
about a docstring that no longer describes the code, a missing test, or an owed
item filed in the wrong place — which is what an audit of settled helpers should
be expected to turn up. Four of the seven are `mulberry32`'s.

### RESOLVED 2026-09-03 — F-utils-1 · `mulberry32-not-test-only` · the scope claim is false in both halves

The docstring says:

> NOT cryptographic and NOT for gameplay fairness (board generation seeds live
> server-side); this is the test/tooling generator.

Both halves are now wrong, and the second is wrong twice:

- **It is production gameplay code.** `src/scrabble/lib/policy.ts:36` imports it
  — the compete AI opponent's policy, using it to shuffle the bag (`:211`) and to
  seed each turn's choice (`:225`). An autonomous opponent's moves are gameplay.
- **It does run server-side.** `supabase/functions/scrabble-ai-move/index.ts:36`
  imports it and seeds the AI's move at `:124`.

`src/boggle/lib/generate.ts:20`, a copy of the same function, documents the
**opposite**: *"seeds are server-chosen for fairness, not secrecy."* Two copies
of one function whose docstrings disagree about whether it may touch fairness is
the strongest argument for the migration in `F-utils-3`.

The sentence was true when written (scrabble's parity suite was the only
consumer) and the AI opponent arrived after it.

### RESOLVED 2026-09-03 — F-utils-2 · `mulberry32-dead-doc-ref` · a citation to a doc that does not exist

The docstring cites `docs/scrabble-ai-fixes.md §6` for the removability
invariant. **There is no such file**, and none in the docs table of CLAUDE.md.
The rule it reaches for is real and lives elsewhere
([docs/code-conventions.md → Shared vs game-specific](../../docs/code-conventions.md#shared-vs-game-specific),
and docs/common.md's removability-in-three-actions rule).

### RESOLVED 2026-09-03 — F-utils-3 · `mulberry32-deferral-in-a-docstring` · an owed item in the wrong register

> Scrabble's parity test consumes it now; migrating boggle + the stackdown script
> onto it is nice-to-have.

**Still true, and measured:** `grep -l 6d2b79f5` returns exactly three files —
this one, `src/boggle/lib/generate.ts:23` (exported, and boggle's own tests
import it from there), and `supabase/scripts/generate-stackdown-boards.ts:351`.

Two problems, and the second is the one that matters:

- A **deferral living in a docstring** is invisible to the register that exists
  for owed work. It belongs in `docs/deferred.md`.
- **Neither migration is this area's to make.** `generate.ts` is the `boggle`
  game area's; the stackdown script belongs to whoever owns `supabase/scripts/`.
  A scoped pass does not edit another area's code, so this area raises it and
  files it.

The docstring also understates its own consumers by a lot — "Scrabble's parity
test" is now four scrabble modules plus an edge function, per `F-utils-1`.

### RESOLVED 2026-09-03 — F-utils-4 · `mulberry32-untested` · the shared copy has no test; the duplicate does

`src/common/lib/util/` holds four test files, and none is `mulberry32.test.ts`.
The only tests that exercise a mulberry32 — `src/boggle/lib/generate.test.ts:12`,
"returns the same sequence for the same seed" — exercise **boggle's copy**. So
the shared, more-depended-upon function is the untested one, and the property
that makes it worth sharing (determinism from a seed) is asserted only about the
copy we want to delete.

Cheap to fix and pure: same seed ⟹ same sequence, different seed ⟹ different,
every value in `[0, 1)`.

### How F-utils-1 … F-utils-4 were resolved, 2026-09-03 — one sitting, and the duplicates are gone

Joel: *"shall we do together? should we also make the version in utils be the
only version, and have other consumers use it?"* — then, on the scope: *"it's
fine to change the file in other areas for this."*

**The four were one piece of work.** F-utils-1, -2 and -3 are three corrections
to the SAME docstring; separating them means rewriting one comment block three
times. F-utils-4's test asserts exactly what the rewritten docstring promises.

**`src/common/lib/util/mulberry32.ts` is now the only copy.** The other two were
deleted and their callers point here:

- `src/boggle/lib/generate.ts` — its copy removed, the shared one imported. It
  is NOT re-exported: a re-export would leave boggle's tests importing
  `mulberry32` from `./generate` and hide that it is shared, which is the
  indirection this removes. `generate.test.ts` and `customBoard.test.ts` import
  from `common/lib/util/` directly now.
- `supabase/scripts/generate-stackdown-boards.ts` — same, and it turned out to
  be an `npx tsx` script rather than Deno as its folder suggested.

**The docstring now says what the function is FOR, not what it is not for.** The
old one defined it by exclusion ("NOT for gameplay fairness … the test/tooling
generator") and both exclusions had been overtaken. The new one leads with
seedability and names the three kinds of caller — tests, boards-from-a-seed, and
idempotent server work. Joel's question at the audit (*"why do we need this over
`Math.random()`? is it faster? or more accurate?"*) is the one a reader has, and
the answer is neither: it is slower and has less state, and `Math.random()`
simply cannot be seeded. That answer is now in the docstring.

**Fairness is not this function's business, either way.** The old shared copy
said it was NOT for fairness and boggle's copy said seeds are "server-chosen for
fairness" — one function, two docstrings, opposite claims. Both were answering a
question the module does not own: a seeded board is fair because the SEED is
server-chosen, which is a fact about the seed's provenance, not about the PRNG.
The line stays where it belongs, on boggle's import.

#### The parity proof — why this was safe to do at all

The three copies were **not** written identically. The shared and boggle copies
normalize with `seed >>> 0` once outside the closure; the stackdown script used
`let s = seed` plus `s |= 0` on every call. If those diverged on any seed, the
migration would silently change every board ever generated.

Checked rather than reasoned about, over **216 seeds × 1000 draws** — including
`0`, negatives, `2³¹`, `2³²`, `2³² + 7`, `MAX_SAFE_INTEGER` and non-integers:
**zero mismatches**, both copies. (The two spellings hold the same 32 bits, and
`(x + c) | 0` is modular, so the sign-bit interpretation never reaches the
output.) `mulberry32.test.ts` pins the case that mattered — seeds differing only
above bit 32 are the same seed — so the property the migration rested on is now
a test rather than a session's finding.

**Nothing stored was at risk regardless**, which is the second half of the
answer: boggle persists the rolled board (`board text not null`,
`20260628000000_boggle.sql:38`) and the stackdown script writes a vendored
`.jsonl` that is imported separately. Neither regenerates from a seed at read
time, so no existing game could have moved even if the copies had disagreed.

#### F-utils-3's deferral evaporated rather than being filed

The finding said the migration was owed and belonged in `docs/deferred.md`
because it was not this area's to make. **Doing it means there is nothing to
defer**, so no register entry was added — an item filed and immediately done is
noise in a standing list.

**The scope override, recorded so it does not read as creep later.** This area
edited four files in two other areas (`src/boggle/lib/` ×3,
`supabase/scripts/` ×1) on Joel's explicit say-so. The rule it sets aside —
a scoped pass does not edit another area's code — exists to stop an area
*redesigning* elsewhere. This was a delete-and-reimport with proven parity: no
design decision inside boggle, no behavior change, and the alternative was worse,
since `boggle`'s area would have had to re-derive the parity proof months from
now to make the same edit. **Boggle's files keep their `cs-unmet` stamps** — a
mechanical migration moves no stamps.

#### Verification

`npx tsc -b` clean · `npx vitest run` **2540 passed, 267 files** (2536 before:
five new tests, minus boggle's one relocated) · `npx eslint src` one warning,
the pre-existing `useWordSubmit.ts:264`, which is `hooks`'s.

**`supabase/scripts/` is in no tsconfig `include`**, so `tsc -b` never checked
the script. It was booted instead — `npx tsx generate-stackdown-boards.ts` with
no arguments runs every import and then prints usage, which proves the cross-tree
import resolves without generating a board or appending to the vendored file.
Worth knowing for anything else that touches that folder.

### RESOLVED 2026-09-03 — F-utils-5 · `linkify-docstring-detached` · the function's docstring is attached to a regex

`linkify.tsx` opens with a `/** … */` describing `linkify` — what it does, what
it returns, that it is pure. It sits at lines 5–13, then a blank line, then
`const URL_RE` and `const TRAIL_RE`, and only at line 18 the function itself.

So the docstring documents `URL_RE`, and `linkify` has none: an editor hovering
the exported function shows nothing, which is precisely the signal
[docs/code-conventions.md → Code clarity & docstrings](../../docs/code-conventions.md#code-clarity--docstrings)
is about. This is the area's one hit from §21's docstring pass — the other six
files use `/**` for files, types and functions only, with `//` for in-body notes,
exactly as the rule wants.

**Fixed 2026-09-03.** The `/**` moved down to sit on `export function linkify`,
where hovering the export now shows it; the two regexes got a `//` note apiece,
which is what a constant takes. Rewritten while it moved, since a docstring
nobody could see had not been read in a while:

- **It opens with why you would call it** — "Make the URLs inside a chat message
  clickable" — and shows the call, `{linkify(text)}`. The old lede led with the
  mechanism ("Wrap bare http(s) URLs … with anchor tags").
- **The return is stated exactly.** The old text said "typically an array …, or
  the bare empty string when the input is empty", and "typically" was doing real
  work: text with no URL comes back as a ONE-ELEMENT ARRAY, not a string, which
  `linkify.test.tsx:19` pins and the docstring now says.
- **Two properties that were only in the code** are now written down: the
  trailing-punctuation rule's cost (a URL genuinely ending in `)` loses it —
  the trade this area checked and kept), and that matching only `http:`/`https:`
  is what stops a `javascript:` URL in chat becoming an anchor. The input is
  another player's text, so that one is worth saying out loud.

No behavior change; `tsc -b` clean, the folder's 31 tests pass, eslint silent.

### RESOLVED 2026-09-03 — F-utils-6 · `calendar-day-diff-false-claim` · a claim that is both wrong and unreachable

`friendlyDate.ts:69` documents the private helper:

> Returns 0 for future timestamps via the round (the caller has already handled
> the `< 0` ms case).

Neither clause survives reading:

- **It does not return 0.** For a `then` one day in the future,
  `nowMidnight - thenMidnight` is `-86400000`, and `Math.round` of `-1` is `-1`.
- **It cannot be reached.** `friendlyDate` returns `'Just now'` for
  `diffMs < 60_000`, which is every negative delta — so `calendarDayDiff` never
  sees a future timestamp at all. The parenthetical is right and it is what makes
  the main clause dead.

The behavior is correct (`friendlyDate.test.ts:31` pins clock-skew futures as
"Just now"); it is the explanation of an unreachable case that is wrong.

**Fixed 2026-09-03.** The false half is gone and the true half is kept and
stated as the reason: `then` is always in the past here, because `friendlyDate`
answers "Just now" below a minute and that covers every negative delta.

The replacement also says what the helper is FOR, which the old one left to the
reader: it compares local midnights rather than subtracting 24-hour windows.
That is the distinction the whole format ladder rests on — it is why
"yesterday 11pm" seen at 1am reads as "Yesterday 11pm" and not "2 hours ago" —
and the docstring on the function that implements it was the one place not
saying so.

Nothing else changed; the behavior was always correct, and
`friendlyDate.test.ts:31` already pinned it.

### RESOLVED 2026-09-03 — F-utils-8 · `test-docstring-is-archaeology` · the file this area WROTE narrated the change instead of the code

Found by auditing `mulberry32.test.ts` — the one file this area created — on
Joel's instruction to audit it like any other rather than trusting it because it
was written carefully three hours earlier. **It broke the repo's own comment
rule, and I wrote it.**

CLAUDE.md: *"do not make purely archaeological comments or docs; 'how it used to
work' is not useful"*, and comments explain the code, never the change that
produced it. The docstring opened with *"The shared PRNG had no test of its own
until `utils` was audited … the copy we deleted"*, and two of the five cases
carried the migration story rather than the property. All of it reads as history
to anyone who arrives after this sprint, which is everyone.

Rewritten to state the contract — same seed, same sequence; different seeds
differ; every draw in `[0, 1)` — and each case's comment now says what the case
is FOR:

- the `Array.from` note explains the idiom (one stream, five successive draws),
  which is genuinely non-obvious, instead of saying where the block moved from;
- the bit-32 case states the property (the seed is `seed >>> 0`, so bits above
  32 are discarded) and why a caller cares, instead of recounting which spelling
  the stackdown script used.

**The migration story is not lost — it is in this file**, above, where the
record of what the sprint did belongs. That is the split: the area file carries
the history, the code carries the contract.

### RESOLVED 2026-09-03 — F-utils-9 · `storage-docstring-describes-the-old-regex` · two false claims in one sentence

`storage.ts:7-9` says the guard *"fails the build on a raw `localStorage.`
outside this file"*. Both halves are wrong, and both were made wrong by edits
made within the hour:

- **`localStorage.`, with the trailing dot,** describes the regex's FIRST
  version. It was widened to the bare identifier when the allowlist's shrink
  test caught it missing `storage.ts`'s own helper, and the docstring was not
  followed through.
- **"outside this file"** — `ALLOWED` has five entries, not one. Four other
  files may touch storage, three of them tests.

The same class as `F-utils-1`, `-2` and `-6`, which is the point worth recording:
this area spent a day on docstrings overtaken by later changes, and then produced
one overtaken by a change made an hour later in the same sitting. Being the
person who just wrote it is no protection at all.

### RESOLVED 2026-09-03 — F-utils-10 · `guard-docstring-undercounts-comments` · "the one place" is at least four

`rawStorage.test.ts:20-24` justifies comment-stripping with *"the one place that
legitimately shows a raw call is `realtimeDiag`'s docstring"*.

Measured across `src/`: **about sixty comment mentions of storage in thirty
files**, of which at least four show real call syntax that the scan would flag —
`chatOpenStore.test.ts:24` (*"a tiny try-catch around localStorage.getItem"*),
`chatOpenStore.test.ts:37` (*"window.localStorage.__proto__, 'setItem')"*),
`reloadOnStaleChunk.test.ts:75` (*"vi.spyOn(sessionStorage, 'getItem')"*), and
`realtimeDiag.ts:58-59`.

The claim is wrong in the direction that makes the design look weaker than it is:
comment-stripping is not a courtesy extended to one docstring, it is load-bearing
across the repo, and without it this guard would have been red on arrival.

### PARTLY RESOLVED 2026-09-03 — F-utils-11 · `strip-comments-ignores-string-literals` · a stated limit, not a fix

`stripComments` blanks `//` to end of line and `/* … */` anywhere, with no notion
of string literals. Two consequences:

- a line containing `'https://…'` is truncated at the `//`, so a storage touch
  later on that same line would be missed;
- a `/*` inside a string literal starts a fake block comment that blanks
  everything to the next `*/` — which could hide real code.

~~Neither is reachable in the repo today~~ (**wrong — the second pass measured
it, `F-utils-14`**: the `/*` half is reached by a glob in `cssTokens.test.ts`);
the tree is green, and the three planted violations prove the scan catches what
it claims. **Recording the limit rather than fixing it** — doing this properly needs a tokenizer, which is out of
proportion to a guard whose subject is one identifier, and a limit written down
is one a future reader can weigh. The same trade `noRawServerMessage` makes with
its line-window heuristic.

**The URL half is FIXED; the `/*`-in-a-string half stays a stated limit.** The
split came from reading the folder instead of the file — `src/guards/` already
had the answer to one half and a reason not to attempt the other.

**Fixed.** `stripComments`'s line strip is now `/(^|[^:])\/\/.*$/` → `'$1'`.
The `[^:]` refuses to read `//` as a comment when a colon precedes it, which is
how a URL appears. **Not invented here:** `cssClasses.test.ts:58` and
`vocabularies.test.ts:75` already strip line comments exactly this way, for
exactly this reason. Adopting theirs is one character class and it removes a
divergence rather than adding one.

**Pinned two ways.** A new case asserts `stripComments` directly — five lines
in, five verdicts out — because this function decides what the scan never sees
and is therefore the part of the guard that can fail silently. And a planted
`const u = 'https://x'; window.localStorage.setItem(…)` is now caught, where the
old strip truncated the line at `https:` and reported nothing.

**Not fixed, deliberately: `/*` inside a string literal.** Two reasons, the
second stronger than the first:

- ~~a TS string holding `/*` with a later close is contrived, where a URL is
  not;~~ (**wrong** — a glob is a string holding `/*`, and `src/guards/` has
  one that reaches twenty-five lines; `F-utils-14`. The second reason carries
  the decision alone.)
- **three other guards carry the identical hole** — `cssClasses.test.ts:55` and
  `cssTokens.test.ts:40` use the same block-comment regex, and
  `callSiteShape.test.ts` is cruder still. Fixing this one with a tokenizer
  would make a single guard exact and leave four `stripComments` that disagree,
  manufacturing the accidental drift this sprint exists to kill. It is worth
  doing as ONE change to all four or not at all.

**FILED 2026-09-03 in [docs/deferred.md](../../docs/deferred.md) → Common /
architecture**, as one item covering all four strippers. It went to the standing
register rather than an area file because **`src/guards/` is on no area's
roster** — §7 does not list it — so "whoever opens that area" pointed nowhere.
`typescript` is already a direct devDependency (`~6.0.2`), so `ts.createScanner`
needs nothing new; what it needs is a decision about the folder's shape.

**The guard is now in its own `ALLOWED`.** It scans `src/`, and `src/` contains
it; its fixture spells out real violations on purpose, because writing them
around the scan (`'local' + 'Storage'`) would leave the test no longer testing
what it claims.

### RESOLVED 2026-09-03 — F-utils-12 · `guard-scans-tests-and-does-not-say-so`

`rawStorage.test.ts` sweeps `.test.ts` files along with everything else. That is
deliberate and unusual — `noRawServerMessage`, the guard it is modeled on,
explicitly excludes them (`!/\.test\.tsx?$/`) — and it is why three of the five
`ALLOWED` entries are tests. A test poking raw storage is exactly the thing that
should have to justify itself, since the fake exists precisely so it does not
have to. Nothing in the file says any of that, so the next reader meets it as an
oddity in the allowlist rather than as a decision.

### `storage.test.ts` and `storage.fake.ts` — audited, no findings

One asymmetry noted and left: `removeStored` is tested against local storage only,
where `readStored` and `writeStored` each have a session case. `store()` picks the
storage the same way for all three, so the third case would assert the same
branch twice.

`storage.fake.ts` importing `vitest` from a non-`.test.ts` file was checked
against precedent rather than assumed:
`src/common/components/fields/fieldContract.tsx` does the same, so the pattern is
the repo's, not this area's invention.

### NOTE, NO ACTION HERE — F-utils-7 · `keyboard-handoff-has-a-successor`

`handOffKeyboardOnTab` is row 7 of the eight behaviors in
[tab-rings.md](../tab-rings.md) — "chat box · scratchpad → hands the keyboard
back to the game → **ring transition**". The mechanism (`useTabRing`) is built,
and surfaces convert per area.

**Nothing to do in `utils`:** both callers (`ChatBody`,
`GameScratchpadCompanion`) are floating panels, so the conversion is
`floating-panels`'. Recorded so that area does not re-derive it, and so this file
is not "tidied" in the meantime by someone unaware it has a scheduled successor.

The file itself audits **clean**: every claim in its docstring checks out —
`useGlobalKeyHandler` does decline while a field is focused, `blurActiveField`
is at `usePlayerBoard.ts:103`, and the two named callers are the only two.

### `outcomes.ts` — audited, no findings

Every claim verified. Seven words, `error` a full member, and the guard it names
is real: `src/guards/raiseCodes.test.ts:49` sets `NOT_ON_A_SUCCESS = 'error'` and
`:343` asserts `error` belongs to the vocabulary. Its argument for being its own
file holds. Nothing to change.

## The second pass, 2026-09-03 — auditing the fixes and what they touched

Joel: *"please do an audit of what was fixed in utils area and the code in those
files."* Read: the twelve `cs-audited-utils` files, and the full diff
`e4baacd7..132eb6c6` — every converted call site in the six other areas, boggle's
three files, the stackdown script, and the three docs. Two things were measured
rather than read, because reading could not settle them: whether the guard's
comment stripper hides any real code in today's tree (it does — `F-utils-14`),
and whether `calendarDayDiff`'s rounding is load-bearing (it is —
`F-utils-18`).

**Still no logic bug in the shipped code.** The ten findings are, again, mostly
docstrings — and the pattern the first pass named (a claim overtaken by a change
made within the hour) recurs FOUR times here, twice in the same file that
`F-utils-11`'s fix was the change. Two are test-coverage gaps in the design's
central claims, one is a comment-rule breach this area wrote into two other
areas, and one is a §20 vocabulary breach in a file the first pass called clean.

### RESOLVED 2026-09-03 — F-utils-13 · `guard-docstring-overtaken-by-its-own-fix` · the guard's header contradicts its own function

`rawStorage.test.ts` was last edited by `F-utils-11`, and its file-level
docstring was not read again afterwards. Three claims in it are now false:

- **`:38-43`, "Known limit … A line holding `'https://…'` is truncated at the
  `//`."** That is the half `F-utils-11` FIXED. The function docstring at
  `:97-101` says so, and the test at `:126` pins it. So the file's header names
  as a limit the thing its own function forty lines down says it handles.
- **`:34-36`, "three of the five `ALLOWED` entries are tests."** `ALLOWED` has
  six entries (`:69-82`), four of them tests — `F-utils-11` added the guard
  itself to the list after this sentence was written.
- **`:28-29`** cites `serverErrorKeys.test.ts` as the cautionary example. That
  file was deleted when the error sprint closed (CLAUDE.md → plans table). A
  reader cannot go and look, which is what a citation is for; the lesson
  survives without the filename.

Same class as `F-utils-9`: the docstring was made false by the very next commit
to the file. Fix: rewrite the "Known limit" paragraph to cover the `/*` half
only, replace the count with a pointer at `ALLOWED`, drop the dead citation.

**Fixed 2026-09-03**, chosen first because it is the guard's own header
contradicting the function forty lines below it, and because it costs one
comment block. Three edits to `rawStorage.test.ts`'s header, no code:

- The "Known limit" paragraph now covers the `/*` half only and says the URL
  half is handled, pointing at `stripComments`. Rewriting it meant its "neither
  is reachable" sentence had to go too — it is the one this pass measured as
  false — so the paragraph now states the measured fact instead: a glob in a
  string is the ordinary case, `cssTokens.test.ts` has one, every hidden region
  is inside `src/guards/`, and the fix is filed in `deferred.md` as one change
  to all four strippers. **That is the guard-file third of `F-utils-14`**; the
  other two homes of the false sentence (this file's `F-utils-11`, and
  `docs/deferred.md`) are still `F-utils-14`'s.
- The count is gone. "Three of the five" became "tests outnumber source files
  in `ALLOWED`" — a shape that stays true as the list moves, with the list
  itself as the one home for the number.
- The `serverErrorKeys.test.ts` citation is replaced by the lesson it carried,
  stated without the filename, since the file no longer exists to be read.

No line numbers in the new text — `cssTokens.test.ts:419` is named by file
only, because a line reference in a docstring rots the way this finding's own
subject did.

### RESOLVED 2026-09-03 — F-utils-14 · `string-glob-hole-is-reachable` · "not reachable in this repo today" was asserted, not measured — and it is false

`F-utils-11` left the `/*`-inside-a-string half unfixed on the argument that *"a
TS string holding `/*` with a later close is contrived, where a URL is not."*
That sentence went into three places — `rawStorage.test.ts:40`, this file's
`F-utils-11`, and `docs/deferred.md:65` — and none of them checked.

**Measured 2026-09-03:** the guard's `stripComments` was run over every `.ts` /
`.tsx` in `src/` and compared line-by-line against the TypeScript parser's own
comment ranges. Result: **38 lines in 8 files are blanked by the regex that the
parser says are code**, and 0 lines go the other way (the regex never keeps
comment text, so it produces no false violations — only false silence). All
eight files are in `src/guards/`. Seven are one-line and self-contained: the
guards' own regex literals (`/\/\*[\s\S]*?\*\//`, which contains both delimiters
on one line), `dbCallWrapped.test.ts:91-92`'s `'/*'` / `'*/'` string pair,
`setupRows.test.ts:34`'s glob. **The eighth is the real one:
`cssTokens.test.ts:419`** — `where: 'fixed.css for fill/edge, themes/*.css for
ink'` — opens a fake block comment that runs to the next `*/` and hides
**lines 419–443, twenty-five lines of code**, from this guard's scan. A glob in
a string is the ordinary case, not the contrived one.

Nothing hides a storage touch today, and the decision `F-utils-11` made — fix
all four strippers at once or not at all — stands on its own reasoning. What is
wrong is the *sentence*: three places say the hole cannot be reached and one
guard file is already inside it. Fix: correct all three, and give the deferred
item the measurement so the next reader has the fact instead of the guess.

**Fixed 2026-09-03, in three places.** The guard file's copy went under
`F-utils-13`. The other two, done here: `docs/deferred.md`'s item now carries
the measurement in place of "not reachable" (the numbers, the one real region,
and that every hidden line is inside `src/guards/`), so the standing register
holds the fact rather than the guess; and `F-utils-11`'s record above has its
two false clauses struck through with a pointer here, rather than rewritten —
the record of what was believed at the time is the point of an area file, and
the decision it reached still stands on its remaining reason.

### RESOLVED 2026-09-03 — F-utils-15 · `wrapper-docstring-miscounts-the-allowlist` · `storage.ts` describes an allowlist that has since grown

`storage.ts:7-10`: the guard fails *"outside this file and a short allowlist —
the test fake beside it, plus three tests that install a fake of their own."*
That enumerates five entries; `ALLOWED` has six (the guard itself joined it in
`F-utils-11`), four of them tests, and one of the "three that install a fake" —
`reloadOnStaleChunk.test.ts` — is there for clearing the REAL session store
between cases, swapping a fake in for one case only. Same commit that made
`F-utils-13` stale; the wrapper's docstring counted the same list and was not
re-read either. Fix: stop enumerating — say "a short allowlist, `ALLOWED` in the
guard, each entry with its reason" and let the list be the one home.

**Fixed 2026-09-03.** One sentence in `storage.ts`'s header: the count and the
enumeration are gone, replaced by a pointer at `ALLOWED` and the shape of what
is on it — the test fake, and the few tests that have to reach the real thing
on `window`. No number left to rot. "Fails the build" stays; see "Checked and
deliberately NOT raised" — it is the repo's idiom.

### RESOLVED 2026-09-03 — F-utils-16 · `fake-docstring-three-false-claims` · `storage.fake.ts` misattributes the thing it exists for

Three claims in `storage.fake.ts`'s header, each checked:

- **`:6-7`, "jsdom in this project ships no real `localStorage` —
  `window.localStorage` is `undefined` under our config."** Half right, and the
  wrong half is the explanation. Probed under this project's vitest (jsdom 29,
  vitest 4.1, Node 26.8): `typeof window.sessionStorage` is `object` — jsdom's,
  and `reloadOnStaleChunk.test.ts:27` calls `sessionStorage.clear()` on it raw
  and passes — while `typeof window.localStorage` is `undefined`. jsdom ships
  BOTH. What removes `localStorage` is **Node's own experimental `localStorage`
  global**, which vitest leaves in place over jsdom's and which reads as
  `undefined` until Node is started with `--localstorage-file` (Node prints
  exactly that warning at the top of every run). So the cause is the Node
  version, not jsdom and not our config, and it flips with either a Node upgrade
  or that flag. The fake is still needed; its docstring should name the real
  reason so nobody "fixes" the vitest config looking for it.
- **`:10-11`, the two older tests "cross-reference each other's copy."**
  `useStickyChoice.test.ts:15` cites `chatOpenStore.test.ts`; nothing in
  `chatOpenStore.test.ts` mentions `useStickyChoice`. One direction.
- **`:14`, `{@link installedStorage.block}`** names no symbol. The type is
  `InstalledStorage` and the value is what `installFakeStorage` returns; an
  editor resolves this link to nothing.

**Fixed 2026-09-03**, all three in the header, no code:

- The opening now says what was measured: `window.localStorage` is undefined
  under vitest **because recent Node defines its own experimental
  `localStorage` global** that reads as undefined without
  `--localstorage-file`, and vitest leaves it in place over jsdom's; jsdom
  itself provides both, and `sessionStorage` is the real one. Named so that
  nobody hunts the vitest config for a cause that is not there, and so the
  day a Node upgrade makes the fake look redundant, the reason it is not is
  already written down.
- "Cross-reference each other's copy" became what is true: `useStickyChoice`'s
  note points at `chatOpenStore`'s.
- `{@link installedStorage.block}` → `{@link InstalledStorage.block}`, the
  type that actually declares it.

### RESOLVED 2026-09-03 — F-utils-17 · `block-models-the-call-not-the-access` · the design's central claim has no test

`storage.ts:14-19` and the `StoreName` docstring rest on one fact: a blocking
browser throws **on the property access** (`window.localStorage`), which is why
the storage is named rather than passed. `storage.fake.ts`'s `block()` makes the
*methods* throw (`:88-90`); the property access always succeeds. So no test in
the repo exercises the case the design was built for, and a refactor to
`readStored(window.localStorage, …)` — the exact mistake the docstring warns
against — would pass every test. The `reloadOnStaleChunk.test.ts:81-84` case is
the same shape: a throwing-methods object.

Fix, small: install the fakes as accessor properties, and have `block()` also
spy the getters (`vi.spyOn(window, 'localStorage', 'get')`) — restored by the
same `vi.restoreAllMocks()` — then add one case to `storage.test.ts` asserting
`readStored` returns `whenUnavailable` when the ACCESS throws. That is the
[verify guards by planting] rule applied to a design claim rather than a guard.

**Fixed 2026-09-03.** `block()` is gone; the fake now has **two switches named
for the browser event each models**, because they are different events and the
old name had quietly merged them:

- `blockAccess()` — `window.localStorage` / `window.sessionStorage` themselves
  throw, before any method is reached. A browser blocking site data. The fakes
  are now installed as ACCESSORS (`get: () => value`) so `vi.spyOn(window,
  name, 'get')` has a getter to replace; a data property gave it nothing.
- `failCalls()` — the storages resolve but every method throws. A full quota on
  a write, or a storage that died mid-session. The old `block()`, renamed for
  what it does.

`storage.test.ts` grew from ten cases to twelve: each of the three functions
now has an ACCESS case and a CALL case, and the read's access case says in its
comment why it is the one the design is shaped by.

**Planted.** With the property access moved outside `readStored`'s `try` — the
exact refactor the finding said would pass every test — the suite went
**1 failed, 11 passed**, and the one was the new ACCESS case. Reverted. That
is the proof the case was missing: before today the same plant passed 10 of 10.

`reloadOnStaleChunk.test.ts:81-84`'s throwing-methods object is the same shape
and is left alone — `deep`'s file, `cs-blessed-deep`, and its case is about
fail-closed behavior, which either switch demonstrates.

### RESOLVED 2026-09-03 — F-utils-18 · `calendar-day-diff-round-is-dst` · the one non-obvious line in `friendlyDate` has no reason and no test

`F-utils-6` deleted the false explanation of `Math.round` at
`friendlyDate.ts:89` and put nothing in its place, so the round now sits
unexplained. Its real reason is daylight saving: local midnights are 23 or 25
hours apart across a change, so the subtraction is not an integer. Measured in
`America/Los_Angeles`: a game at Sat Mar 7 2026 21:00 viewed Mon Mar 9 14:30
gives `1.958` — `round` says 2 ("Sat 9pm", correct), `floor` would say 1
("Yesterday 9pm", wrong). So the round is load-bearing, and every case in
`friendlyDate.test.ts` is anchored to June 17, on the far side of both changes.
Fix: one sentence in the helper's docstring, and one test anchored across
March 8 2026. (A no-DST machine still passes it — 48h rounds to 2 — it just
proves less there, same as the rest of the file, which already assumes the local
zone.)

**Fixed 2026-09-03.** One paragraph on `calendarDayDiff`'s docstring saying
why it rounds, and one test with both directions: spring (Sat Mar 7 21:00 seen
Mon Mar 9 14:30 → "Sat 9pm"; the 23-hour day makes the quotient 1.96, which
`floor` would turn into "Yesterday") and fall (Sun Nov 1 09:00 seen Tue Nov 3
→ "Sun 9am"; the 25-hour day makes it 2.04, which `ceil` would turn into the
wrong weekday). **Planted:** with `Math.round` swapped for `Math.floor`, the
spring assertion fails with `Yesterday 9pm`; reverted. No behavior change.

### RESOLVED 2026-09-03 — F-utils-19 · `test-comment-misquotes-the-seeds` · the file re-audited by `F-utils-8` quotes two expressions, neither correctly

`mulberry32.test.ts:51-54` justifies the normalization case by quoting the
callers' seed arithmetic. Neither quotation is what the code says:

- "scrabble's AI seeds with `(version * 31 + seat) ^ 0x9e3779b9`" — the edge
  function (`scrabble-ai-move/index.ts:124`) has
  `(((ctx.version * 31 + ctx.seat) >>> 0) ^ 0x9e3779b9) >>> 0`. It normalizes
  itself, so it never hands an overflowed value in, which is the opposite of the
  comment's premise.
- "the self-play loop with `bagSeed + turns * 0x85ebca6b`" — `policy.ts:225` has
  `(bagSeed ^ 0x9e3779b9) + turns * 0x85ebca6b`.

The premise ("callers derive seeds by arithmetic that overflows int32 on
purpose") holds for the self-play loop alone. The case itself is right and
worth keeping; the comment should quote the one caller that actually overflows,
verbatim, or describe the property without quoting. Same class as `F-utils-9`,
and in the one file this area had already audited twice.

**Fixed 2026-09-03.** The comment now quotes the one caller that actually
overflows — the self-play loop's `(bagSeed ^ 0x9e3779b9) + turns * 0x85ebca6b`,
verbatim from `policy.ts` — and says in a parenthetical that the edge function
normalizes its own seed with `>>> 0` before calling, so the case is for the
callers that don't. The premise went from "callers overflow on purpose" to
"not all of it stays inside int32", which is what the code shows. The case's
seeds and assertions are unchanged.

### RESOLVED 2026-09-03 — F-utils-20 · `v8-fingerprinting-claim-unsourced` · a reason nobody can check

`mulberry32.ts:14`: `Math.random()` cannot be seeded because *"the spec leaves it
implementation-defined and V8 declines on fingerprinting grounds."* The first
clause is the whole answer and is true. The second attributes a motive to V8
that this audit could not source, and the docstring gives no way to. Drop the
clause; it adds a claim without adding an argument.

**Fixed 2026-09-03.** The clause is gone. The sentence now says the spec
leaves `Math.random()` implementation-defined and offers no way in, which is
the whole of what a caller needs and is checkable against the spec.

### RESOLVED 2026-09-03 — F-utils-21 · `archaeology-written-into-two-other-areas` · the `F-utils-8` fault, twice more, in files this area was allowed into

`F-utils-8` fixed a docstring that narrated the migration instead of the code.
The same sitting wrote two more of the same, into the two other areas Joel let
this one edit:

- `src/boggle/lib/generate.test.ts:13-16` — *"The `describe('mulberry32')` block
  that used to sit here moved to …"* Pure history; the import two lines up
  already says where `mulberry32` lives. Delete it.
- `supabase/scripts/generate-stackdown-boards.ts:62-64` — *"This script had its
  own copy until 2026-09-03; the two agreed bit-for-bit, so …"* Half history,
  half contract. The keepable half is the second: *regenerating at a given seed
  reproduces the vendored boards* is a property of the script today and worth
  one line. The date and the deleted copy are this file's record, not the
  script's.

These files stay `cs-unmet` and belong to `boggle` and `supabase/scripts/`; the
lines are this area's, so the correction is too, under the same scope override
recorded at `F-utils-1…4`.

**Fixed 2026-09-03.** The boggle note is deleted outright — four lines and
the blank after them; the import above already says where the generator
lives. The stackdown note keeps its contract half only: the same generator the
FE and edge functions use, so a board regenerated at a given seed is the one
the vendored `.jsonl` already holds. The date and the deleted copy stay here,
at `F-utils-1…4`, where the record of the migration belongs. No stamp moved.

### RESOLVED 2026-09-03 — F-utils-22 · `panel-alone-in-two-docstrings` · a §20 breach in a file the first pass called clean

app-audit §20: *"'Panel' on its own means nothing and is banned — in prose, in
docs, in conversation, and in any component name."* Two hits, one old and one
new:

- **`keyboardHandoff.ts`**, which `F-utils-7` recorded as *"audits clean: every
  claim in its docstring checks out."* The claims do; the vocabulary does not.
  `:6` says "floating panel" correctly, then `:16` "out of the panel", `:18`
  "neither the panel nor the game", `:21` "the panel's own controls", `:24` "the
  two panels you type into". Four uses of the banned word in one docstring.
- **`useDraggablePanel.ts:316-317`**, a comment this area wrote during the
  storage conversion: *"costs the panel its remembered position; state still
  drives the live panel."* Twice. (`useDraggablePanel` itself keeps its name by
  §20's own rule; the prose does not get the exemption.)

`useDraggablePanel.ts` is `hooks`'s file; the lines are this area's.

**Fixed 2026-09-03.** All six uses now say "floating panel" (the second in
`useDraggablePanel`'s comment became "the live one", which reads better than
the phrase twice in one sentence). Prose only; no code, no stamp moved —
`useDraggablePanel.ts` stays `cs-unmet` for `hooks`.

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**. Add freely: a line costs nothing and is the alternative to losing
it.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/deferred.md`, deliberately and
by name. That is the app's standing register; this file is the sprint's record of
the area.

### Already waiting for this area

**RESOLVED at the opening — `outcomes.ts` is on the roster.** See "The roster"
above. The other two loose files at that root went to **`game-lib`**, the area
created 2026-09-03 out of this one's opening: `games.ts` + its test, along with
the split of `games.ts` into five vocabularies. Joel's call on why they are not
here: *"i don't want to dive into game-stuff yet."*

**BUILT 2026-09-03 — a shared "storage that cannot throw" helper, and a guard
that requires it.** Raised by `deep` 2026-09-02 while fixing `F-deep-11` and
`F-deep-13`; put in scope at this area's opening, and the conversion question it
carried was answered by Joel the same day: *"i think it will be better to do
this now, rather than carrying a todo for the next week in each section."* So
all of it landed at once rather than five areas each inheriting the same to-do.

**Three new files, ten call sites converted, one guard.**

| file | what |
|---|---|
| `common/lib/util/storage.ts` | `readStored` · `writeStored` · `removeStored` |
| `common/lib/util/storage.test.ts` | ten cases, most of them the failing one |
| `common/lib/util/storage.fake.ts` | the Storage stand-in tests need, + `block()` |
| `src/guards/rawStorage.test.ts` | no raw storage outside the wrapper |

#### The two things the code forced, neither of them a preference

- **`whenUnavailable` is a REQUIRED argument.** Nine callers fall back to a
  benign value; `reloadOnStaleChunk` falls back to **`true`** — no storage means
  DON'T reload, because an uncounted reload is the loop its counter exists to
  prevent. A helper with a default would have flipped that into an infinite
  reload silently. Requiring the argument is what makes each site answer.
- **The storage is NAMED (`'local'` / `'session'`), not passed as an object.**
  Accessing `window.localStorage` is itself what throws in a cookie-blocking
  browser, so `readStored(window.localStorage, …)` would throw at the call site,
  outside the wrapper's `try`. Every pre-existing site did the property access
  inside its own `try`, which is the evidence.

**Absent ≠ unavailable, and `reloadOnStaleChunk` is why.** It reads an absent key
as "reloaded long ago" (reload allowed) and unavailable storage as "reloaded just
now" (reload skipped) — opposite conclusions from what a naive wrapper would
flatten into one `null`. It now says so at the call site, passing
`String(Date.now())` as the stand-in.

#### Two discoveries worth keeping

- **jsdom in this project ships no `localStorage` at all** — `window.localStorage`
  is `undefined` under our vitest config. Two test files already worked around it
  with a hand-rolled Storage fake, cross-referencing each other's copy. Rather
  than write a third, `storage.fake.ts` is the extraction; its `block()` is the
  part actually worth sharing, since making storage FAIL is the whole subject and
  needs the methods on a prototype for `vi.spyOn` to reach. The two older files
  keep their copies and their guard exemptions, with a note to adopt it when
  `hooks` and chat open — converting them now is another area's audit.
- **The first regex was too narrow and its own subject evaded it.** Requiring a
  `.` after `localStorage` missed both `const ls = window.localStorage` and
  `storage.ts`'s own `store()` helper — which is how it was caught, by the
  allowlist's shrink test rather than by the scan. Widened to the bare
  identifier.

**The guard was verified by planting, three ways** ([[verify guards by
planting]] — a check that cannot fail is worse than none): a raw call is caught
with `file:line`, the alias form the widening exists for is caught, and prose
mentioning storage in a comment is ignored. That last one matters —
`realtimeDiag`'s docstring legitimately shows a raw call, because it tells a
person what to type into their own console.

#### Files edited outside this area

Ten call sites, in six areas. Three of them are **`cs-blessed-deep`** —
`loadTheme.ts`, `realtimeDiag.ts`, `reloadOnStaleChunk.ts` — files Joel has
already signed off. They were converted anyway, because leaving them raw would
have needed three guard exemptions and a guard with a hole where its own
motivating bugs were is not a guard. **No stamp moved**: a mechanical conversion
is not an audit, and the blessing still describes the reading Joel did.

One unrelated repair: `orphanedDocstrings.test.ts` pins known orphans BY LINE
NUMBER, and the import added to crosswords' `PlayArea.tsx` shifted one down five
lines. The allowlist entry moved 91 → 96; the orphan itself is crosswords' to
fix.

#### Verification

`npx tsc -b` clean · `npx vitest run` **2551 passed, 269 files** · `npx eslint
src` one warning, the pre-existing `useWordSubmit.ts:264`, which is `hooks`'s.

`localStorage` and `sessionStorage` throw where a browser blocks site data, so
every access needs a `try/catch`. **Eleven files touch storage and the same three
lines are written eight times** — `chatOpenStore`, `scratchpadOpenStore`,
`useStickyChoice`, `useDraggablePanel`, `chatUnread`, `gameInvites`, crosswords'
`PlayArea`, and now `reloadOnStaleChunk` and `loadTheme`. The rule is already
written down, in `useStickyChoice`'s docstring: *"`localStorage` failures are
non-fatal. Private mode throws on read and write."*

Two halves, and the second is the point:

- a helper (`readStored` / `writeStored`, or similar) that cannot throw;
- **a guard banning a raw `localStorage.` / `sessionStorage.` outside it** —
  because a convention held by eight files and broken by two is what produced
  both findings, and this repo answers that with a mechanism rather than care.

It was NOT built when the findings were fixed, deliberately: landing the helper
with two callers converted and eight left raw is a half-migration, and eight of
those files belong to areas that have not opened. The conversion is one sitting
for whoever owns it.

**The fallback is a real decision each time, not a wrap.** `reloadOnStaleChunk`
fails CLOSED — no storage means no reload — because an uncounted reload is a
loop, and the counter exists to prevent exactly that. A helper must not flatten
that choice into a single default.

### Checked and deliberately NOT raised

- **`friendlyDate`'s two callers are not a duplication.** `ClubGameCard` and
  `ClubGameRow` both call it, and both are mounted by `ClubPage` (`:1057`,
  `:1157`) — one for non-terminal games, one for terminal, which `ClubPage:842`
  states as a deliberate rendering distinction. Not a finding, and in any case
  `club-page`'s to judge.
- **`linkify`'s trailing-punctuation rule eats a balanced `)`.** A URL ending in
  a real paren loses it. `linkify.test.tsx:53` pins the current behavior on
  purpose, there is one caller (chat), and no chat message has hit it. Left as
  the deliberate trade it is.
- **`friendlyDate`'s docstring says "the club-page game list and other glance-at
  surfaces"** — there are no other surfaces today. Too small to spend a finding
  on; it becomes true or false as surfaces appear.

*(added by the second pass, 2026-09-03)*

- **`handOffKeyboardOnTab` still has exactly two callers.** A third file names
  it — `hooks/input/useSwallowTab.ts:25` — but in its docstring, describing the
  hand-back. A mention, not a caller; `F-utils-7`'s count stands.
- **`storage.ts` and `common-folders.md` say the guard "fails the build".** The
  build is `tsc -b && vite build` and runs no tests; strictly the guard fails
  the *suite*. Left alone because `app-audit.md:1230` uses the same phrase for
  the token guard — it is the repo's loose idiom, not this area's invention.
- **`outcomes.ts:16-18`'s parenthetical** ("the two spellings this list once
  had … hid that behind a rename buried in a CSS rule") is history in the
  `F-utils-8` sense, but it is the argument for *why the rule is strict* rather
  than a narrative of a change, and the first pass passed it. Not re-raised.
- **The converted call sites are sound.** Every one of the ten was re-read
  against its old `try/catch`: each `whenUnavailable` matches the fallback the
  old `catch` returned, `reloadOnStaleChunk`'s stand-in still fails closed, and
  the two sites that also parse JSON (`useDraggablePanel.readRect`,
  `gameInvites.loadSeenInvites`) correctly kept a `try` of their own around the
  parse, which is a different failure from storage being gone.

## Files this area wrote

Per §21's rule that a file an area creates is that area's: at close, each gets a
roster row and a `cs-fixed-utils` stamp. It stays `cs-unmet` until then — a new
file has never been through an audit.

- `src/common/lib/util/mulberry32.test.ts` — created 2026-09-03 by `F-utils-4`.
- `src/common/lib/util/storage.ts` — the helper.
- `src/common/lib/util/storage.test.ts` — its cases.
- `src/common/lib/util/storage.fake.ts` — the Storage stand-in for tests.
- `src/guards/rawStorage.test.ts` — the guard that requires the helper.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
