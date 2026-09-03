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

**Status: OPEN — roster agreed with Joel 2026-09-03**, and the seven files below
are stamped `cs-met-utils` (§21: agreed, on an open area's roster, not yet read).

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
