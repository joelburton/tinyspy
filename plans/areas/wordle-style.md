# Area: wordle-style

The folders it reads: `shared/wordle-style`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: AUDITED** (2026-09-22) — every finding worked, the closing re-read
done, the roster `cs-audited-wordle-style`. **NOT CLOSED:** an area closes when
its files read `cs-blessed`, and only Joel sets that.

## The roster

Agreed with Joel 2026-09-22, `cs-met-wordle-style`:

| file | what it is |
|---|---|
| `src/shared/wordle-style/tileColor.ts` | the code→class-key mapper: `g`/`y`/`x` → the three `wordle*` class keys, and `blank` |
| `src/shared/wordle-style/tileColor.test.ts` | its spec |
| `supabase/tests/wordle/colors_test.sql` | the pgTAP oracle for the algorithm, wordle's vectors |
| `supabase/tests/waffle/colors_test.sql` | the same, waffle's — including the board merge |

`doc.md` and `todo.md` are on the roster and carry no stamp, markdown having
nowhere to put one.

**`common.wordle_colors` is read as a function slice** of
`supabase/sql/common.sql`, which stays `cs-unmet`: the file is shared by every
area with SQL in it, so no one area may stamp it. The two pgTAP files above are
this area's, the way `rank-ladder` took its two `rank_idx_test.sql`.

### What is NOT on it

- **`shared/onscreen-keyboard`** — its own area (row 52). Read here as evidence
  only; it derives `KeyTone` from `TileColor` rather than importing a function.
- **`src/waffle/lib/colors.ts`** — a second implementation of
  `common.wordle_colors` in TypeScript, for coloring a historical board without
  a round trip, pinned to the pgTAP vectors. **Evidence, and fix forward if the
  reading turns something up** (Joel, 2026-09-22) — a change there ships with
  this area as a forward-fix and is NOT blessed.
- **`src/wordle/lib/colors.ts`** — the shared mapper re-exported, plus wordle's
  flip-animation vars and `colorRank`. Same standing as waffle's.

Neither game file is stamped: evidence earns no stamp, however closely it is
read, and a forward-fix earns no blessing.

## Findings

*(`F-wordle-style-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

### The audit's findings — 2026-09-22

**Seven findings, F-wordle-style-1 to -7; nothing in the code moved at the
read.** Every roster file read end to end, plus the evidence: `common.wordle_colors`
and `waffle.board_colors` in `supabase/sql/`, both games' `lib/colors.ts` and
waffle's `colors.test.ts`, `GuessKeyboard.tsx`, the four stylesheets the palette
guard indexes, the `--wordle-*` tokens in `fixed.css` and both themes, and the
eleven doc cites. Baseline `tsc -b` clean, lint clean, 25 of 25 green.

**What the folder IS: one function and one type.** `tileColor` turns the
server's per-letter code — `g`, `y`, `x`, anything else — into one of four CSS
class keys, and `TileColor` is that union. It holds no algorithm and no color
values: the algorithm is `common.wordle_colors` in SQL, and the values are the
`--wordle-*` tokens. Its test is four assertions plus a static guard that every
stylesheet indexed by a `TileColor` defines each class, which exists because
`styles[tileColor(code)]` has no compiler behind it and vitest's CSS proxy
fabricates any key asked of it.

**The mapper held up.** Four codes in, four keys out, the fallback covers
`undefined`, `''`, `'.'` and anything unknown, and the guard's list of four
stylesheets is accurate today. The type carries the `wordle` prefix into the
class names deliberately and the reason is sound.

**What has drifted is the coupling to the SQL.** The algorithm now has two
implementations — one in `common.wordle_colors`, one in TypeScript in
`src/waffle/lib/colors.ts` — and the thing supposed to hold them together is a
copied set of test vectors. The vectors are split across two pgTAP files and
the port copied one of them, so a line the SQL test pins is unpinned in the
port; **planting proved it**. Around that: a doc names a folder that has not
existed for some time, and the one design decision this folder owns is written
out at length in two places.

### F-wordle-style-1 · `doc-md` · The intro is owed

**SHIPPED, 2026-09-22** (Joel: *"go the prose pass"*). Written, and
`shared/wordle-style` is off `INTROS_OWED`; planting a bolded opening paragraph
fails `folderDocs`'s in-shape case, so it passes for the right reason.

`doc.md` was a title and one sentence, and two things were owed beyond the
intro. That sentence named its consumers — *"wordle and waffle"* — which is a
roster of games and rots the way every roster in this sprint has. And the thing
a reader most needs, that the server decides the colors and this folder only
names them, lived in a docstring and nowhere durable. Both are in the intro now
and no game is named.

One claim was corrected while writing it: `pdfTiles` does NOT print the same
colors. It draws the four states as border and fill WEIGHT rather than hue, so
a mono printer and a color one produce the same page.

### F-wordle-style-2 · `ts-port-half-pinned` · The port claims the oracle's vectors and copies five of twelve

**SHIPPED, 2026-09-22** (Joel: *"we can copy all the tests"*). All seven wordle
vectors went into `src/waffle/lib/colors.test.ts` under a second heading naming
the file they came from, the docstring stopped calling one file the oracle, and
the plant that used to pass began to fail. A forward-fix in a game folder: not
blessed.

**And then the port itself went.** Later the same day waffle's swap log started
storing each board's colors, so the history viewer reads them instead of
recomputing — which deleted `wordleColors`, the board merge, and the copied
vectors with them. The algorithm lives only in SQL now, pinned by the two pgTAP
files. This finding's fix survived for one afternoon, and it was still the right
fix: the port existed when it shipped, and the work that removed it started from
this finding's evidence.

**The severity was overstated when this was written, and the correction belongs
here.** The two implementations do not disagree today — read line for line, they
match — and the one line the plant exposed cannot be reached from waffle: boards
and solutions come out of the database lowercase, and every `toUpperCase()` in
the game is at the display layer. So no color was ever wrong. What was wrong was
the CLAIM: two files said the port was pinned to the oracle, and a future editor
would have trusted that. Five of twelve.

**The finding this area exists to find.** `common.wordle_colors` has a second
implementation, `wordleColors` in `src/waffle/lib/colors.ts:33` — the same two
passes, the same duplicate-letter accounting, written again in TypeScript so the
turn-history viewer can color a historical board without a round trip. Nothing
makes the two agree except copied test vectors, and both files say so:

- `src/waffle/lib/colors.test.ts:4` — *"Every case here is copied verbatim from
  the pgTAP `supabase/tests/waffle/colors_test.sql` — same inputs, same expected
  outputs — so the two implementations can't silently drift."*
- `supabase/sql/common.sql:899` — *"Pinned by wordle/waffle `colors_test.sql` +
  the oracle-checked TS port."*

The oracle is not one file. `common.wordle_colors` is asserted **twelve times**,
seven in `supabase/tests/wordle/colors_test.sql` and five in
`supabase/tests/waffle/colors_test.sql`, on disjoint inputs. The port copied
waffle's five.

**Planted, and it holds:** deleting

```ts
guess = guess.toLowerCase()
answer = answer.toLowerCase()
```

from `wordleColors` passes all ten of `colors.test.ts`. The case that pins
exactly that line — `wordle_colors('CRATE', 'crate') → 'ggggg'`, labeled
*"wordle_colors lowercases its inputs"* — is in the wordle file, which the port
never copied. The second plant, greens no longer claiming their answer copy,
DOES fail (`aabbb`/`abxyz` catches it), so the gap is specific rather than
general.

The decision is which way to close it: copy the wordle vectors into the TS test
too, or make one shared vector list both sides read. Either way the two
docstrings above are making a claim the code does not support.

### F-wordle-style-3 · `waffle-doc-cites-a-missing-folder` · `docs/games/waffle.md` names a path that does not exist, twice

**SHIPPED, 2026-09-22.** Both cites are `shared/wordle-style/tileColor.ts` now.

`docs/games/waffle.md:440` and `:599` both name **`common/lib/color/tileColor.ts`**.
There is no `src/common/lib/` — the file is `src/shared/wordle-style/tileColor.ts`,
and `common` may not import a family anyway, which `docs/common-folders.md:373`
states as a rule. So the citation is not just stale, it describes an import the
architecture forbids.

`docLinks.test.ts` cannot catch these: it resolves markdown **links**, and both
of these are backticked paths in prose.

### F-wordle-style-4 · `tilecolor-docstring-archaeology` · The mapper's docstring tells a refactor story and counts its call sites

**SHIPPED, 2026-09-22**, with F-5 — one docstring, one rewrite. The keyboard
sentence and the call-site count are gone.

`tileColor.ts:35` — *"which is exactly what the shared keyboard used to carry,
and what this deletes."* What the keyboard used to carry is not something a
reader of this file needs; CLAUDE.md's rule is that "how it used to work" is not
useful. The same sentence carries *"a translation table at each of the four call
sites"*, a count with nothing checking it — the sprint's standing rule is that
these rot. This one already has: four is the number of stylesheets the guard
indexes, while the files naming `tileColor` or `TileColor` run to a dozen, the
two games' PDFs and `waffle.ts` among them. The sentence does not say which
four it means, which is the second half of why a count in prose is a liability.

### F-wordle-style-5 · `prefix-rationale-twice` · Why the names carry the game is written out in full in two places

**SHIPPED, 2026-09-22.** The docstring keeps the CONSEQUENCE a caller needs —
these values are the class names, so the prefix lives in the type and the spec
guards the lookup — and points at `docs/ui.md` → The buckets for the argument.
`docs/naming.md:311` stays: it defends the SQL function's name, a different
subject.

`tileColor.ts:23-40` spends eighteen lines on why the union is
`wordleGreen`/`wordleYellow`/`wordleGray` rather than `correct`/`present`/`absent`
— the phrase people say, the prefix keeping it honest, plain `green` being a
player's identity color, `blank` going unprefixed. `docs/ui.md:805-812` makes the
same argument, and links here.

One home. `docs/ui.md` is the color system's, so the docstring should say what a
caller needs — these values ARE the class keys, so the prefix lives in the type
— and point at ui.md for the argument. (`docs/naming.md:311` is a third mention
but a different subject: it defends the SQL function's NAME, not the type's
values, and should stay.)

### F-wordle-style-6 · `strength-order-twice` · Green beats yellow beats gray, written twice in two games

**CLOSED, no change, 2026-09-22 — and the finding is STALE as written.**
Re-verified before acting on it, which is the only reason this was noticed:
waffle's private `rank` went with the TypeScript port when the swap log started
storing its colors, so the two spellings this finding was about are now one.

What is left is `colorRank` in wordle and `waffle._color_rank` in SQL — the same
ordering, but in two runtimes for two different jobs: the frontend picks the
best color a letter has earned for the on-screen keyboard, the database merges
an intersection cell's two per-word colors. They share no consumer and neither
can drift into the other. Four values in a fixed order is also not the kind of
duplication that hurt here; the algorithm was, and that one is now single.

Moving `colorRank` into this folder was considered and rejected: `TileColor` is
the shared vocabulary, but the ordering over it has two call sites and both are
wordle's. wordiply mounts the same keyboard and passes no `keyStates` at all, so
there is no second consumer waiting.

`colorRank` (`src/wordle/lib/colors.ts:87`, over `TileColor`, four values with
`blank` at 0) and `rank` (`src/waffle/lib/colors.ts:22`, over the raw `g`/`y`/`x`
codes, with a fourth step for a hole). One ordering, two spellings, and the
shared folder that owns this vocabulary holds neither.

They are not trivially the same function — one keys on class names and one on
server codes — so this is a shape question, not a delete. Both files are
evidence here, so any change is a forward-fix and neither gets blessed.

### F-wordle-style-7 · `indexers-listed-by-hand` · The palette guard's stylesheet list is hand-kept

**SHIPPED, 2026-09-22.** The list is discovered, not written: every
`*.module.css` under `src/` that defines any of the three judged classes is a
sheet painting this palette, and has to define the rest. A game that starts
indexing by `TileColor` tomorrow is covered by having done so.

It keys on the JUDGED classes rather than on `blank`, because `blank` is a word
other palettes spend — boggle's `PlayArea.module.css` defines one and has
nothing to do with letter colors. The keyboard is the one sheet exempt from
`blank`, and a TYPE says why: it is indexed by `KeyTone`, which is
`Exclude<TileColor, 'blank'>`.

A discovered set can also go quietly empty, so one assertion names the four
sheets outright. That is the only hand-written list left and it fails loudly
rather than silently.

**Three plants, all bite:** renaming a judged class fails that sheet; removing
`.blank` from a board fails it; and a stylesheet planted in `psychicnum` that
defines `wordleGreen` alone fails three ways — the roster, the judged classes
and the `blank` rule. **The last one is the finding**: the hand list passed it.

`tileColor.test.ts:42` lists the four stylesheets indexed by a `TileColor`. The
list is correct today — checked against every `styles[…]` site in `src` — but
nothing relates it to the code: a game that starts indexing by `TileColor` is
simply not covered, and the failure mode the guard exists to catch (a renamed
class resolving to `undefined`, the tile rendering with no color at all) is
exactly the silent one.

The importers are discoverable — the files that import `tileColor` or `TileColor`
and have a sibling `.module.css` — so the question is whether deriving the list
is worth it or whether the hand list plus a comment is the honest answer.

### The closing re-read — 2026-09-22

**Five findings, F-wordle-style-8 to -12, all worked.** The whole area read in
one sitting after the last group: both roster files, `doc.md`, `todo.md`, the
two pgTAP files, the `common.wordle_colors` slice, and the two `docs/games/waffle.md`
cites F-3 repointed. The docstring-marker pass ran here rather than only at the
opening, which is how F-10 was caught.

**Four of the five are the area's own work standing next door** — the prose
written today, and one claim left behind by the change that came out of this
area's evidence. That is the seventh area running to produce that shape.

### F-wordle-style-8 · `own-faults-in-todays-prose` · The area's own two findings, in the prose it wrote hours later

**SHIPPED, 2026-09-22.** `doc.md`, written at F-1, closed on *"`tileColor.test.ts`
is half four assertions about the mapping and half a static guard"*. There are
seven `expect`s across two cases in that half, so the count was wrong the day it
was written — **F-4 exactly, in the file this area wrote to replace F-4's
sentence.** It now says what the half DOES and counts nothing.

The same paragraph also carried *"the same green reads the same in every game
that has one"*, verbatim from `tileColor.ts`'s docstring — **F-5's one-home
fault**, again in today's prose. The docstring keeps it, being where a caller
reads it; `doc.md` drops it.

### F-wordle-style-9 · `prose-describes-the-guard-f7-replaced` · Two places still described the hand-listed guard

**SHIPPED, 2026-09-22.** F-7 changed the guard from "these four stylesheets,
listed" to "every stylesheet that paints these classes, discovered". Two
sentences did not move with it: `tileColor.ts`'s docstring still said the spec
*"guards that every stylesheet indexed by a `TileColor` defines each class"*,
and the guard's own docstring — four lines below its announcement that the set
is discovered — still said *"a game that starts indexing by `TileColor`
tomorrow"*. Indexing is no longer what the guard keys on; painting is.

The rank-ladder signature, repeated: a roster surviving four lines below the fix
that retired it.

### F-wordle-style-10 · `marker-on-the-wrong-declaration` · The guard's docstring sat on `process.cwd()`

**SHIPPED, 2026-09-22.** A thirty-line `/**` explaining the guard — why it must
be static, what the vitest proxy hides — sat immediately above
`const CWD = process.cwd()`, which it does not mention. The marker lights up in
Joel's editor and pointed at the wrong thing.

Each marker now sits on what it describes: the guard's rationale on the
`describe`, the discovery on `PAINTERS`, the exception on
`INDEXED_BY_KEY_TONE`, the line-anchor on `defines`. `CWD` needs no note.

### F-wordle-style-11 · `sql-credits-a-deleted-port` · `common.wordle_colors` still named the TypeScript copy as its pin

**SHIPPED, 2026-09-22.** The function's header read *"Pinned by wordle/waffle
`colors_test.sql` + the oracle-checked TS port `src/waffle/lib/colors.ts`"*.
That port was deleted hours earlier, by work this area's F-2 evidence started —
so the commit that removed the file left the claim about it standing in a
durable one. A sibling check, which is what the re-read is for.

It now says what is true: the only implementation, pinned by a test per caller
on inputs that share nothing. The copy is recorded as something that existed and
drifted, in one sentence, because the lesson is the reason the rule is stated.

(`supabase/sql/common.sql` is not this area's to stamp — it is read as a function
slice and stays `cs-unmet`. Correcting a false sentence in it is the forward-fix
an area is expected to ship.)

### F-wordle-style-12 · `dead-phase-reference` · waffle's pgTAP header dates itself to a build order

**SHIPPED, 2026-09-22.** *"so it gets pinned first, before any tables or RPCs
exist (Phase 1)"* — archaeology about the order the game was built in, naming a
"Phase 1" that means nothing now. Replaced with the fact a reader needs: this is
one of two files pinning the algorithm, and wordle's holds the rest on inputs
that share nothing with these.

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to the folder's `doc.md`
or `todo.md` instead; a note here never stands in for either)*

## What checked out

Claims re-verified against code rather than taken from the docstrings, listed so
the closing re-read does not redo them:

- **`tileColor` is right**, and its four fallback cases (`undefined`, `''`,
  `'.'`, an unknown code) are each asserted. `'.'` matters: it is waffle's hole
  character, and a hole must draw as `blank`.
- **The palette guard's list is accurate today** — the stylesheets indexed by a
  `TileColor` are wordle's `Board` and `GameEventLog`, waffle's `Board`, and the
  shared keyboard, which is the four it names. Its claim that a rendering test
  cannot see this is true: `css: false` in the vite config swaps every CSS module
  for a proxy that fabricates `_<key>_<hash>` for any key.
- **The keyboard really does derive rather than restate** — `KeyTone =
  Exclude<TileColor, 'blank'>`, and `GuessKeyboard.tsx:107` indexes its own
  stylesheet with it. This is why the area reads it as evidence and stops there.
- **The `--wordle-*` tokens resolve**: fills and edges in `core-css/fixed.css`,
  the three inks per theme in `daylight.css` and `midnight.css`. The docstring's
  path for them is right.
- **The TS port matches the SQL line for line** on the algorithm itself — two
  passes, pool of 26, the same index guard. F-2 is about what PINS them, not
  about a disagreement found between them.
- **wordle has no second `tileColor`.** `src/wordle/lib/colors.ts:9` re-exports
  the shared one, so the games agree; what is wordle's own is the three
  flip-animation var helpers and `colorRank`.
- **A `common.` function tested from two game directories is the house pattern**,
  not a misfiling: `rank-ladder` placed `_rank_idx`'s pgTAP the same way a day
  earlier, one test per caller.
- **`revoke execute … from public`** is on `common.wordle_colors`, so the browser
  cannot call it — which is what makes waffle's TS port a port rather than a
  choice between two callable paths.

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [x] the whole area re-read in one sitting after the last group — 2026-09-22,
      five findings, all worked
- [x] the folder's `doc.md` intro written; `shared/wordle-style` off
      `INTROS_OWED` (F-1)
- [x] `todo.md` holds everything still owed — which is nothing: no finding was
      handed on, and nothing durable is left in this file
- [ ] every file on the roster blessed, or its stamp says why not — **NOT DONE,
      and not Claude's to do.** The four roster files read
      `cs-audited-wordle-style` (set 2026-09-22 on Joel's instruction). Only
      Joel sets `cs-blessed`
