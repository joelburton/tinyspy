# Area: found-words

The folders it reads: `shared/found-words`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — opened 2026-09-21**, roster agreed the same day (Joel: *"all of
these below, stamp them all as cs-met"*). Eleven files `cs-met-found-words`
plus the two markdown ones, which carry no stamp.

**The audit READ is DONE (2026-09-21).** Every roster file read end to end —
the hook and its spec, the three pure modules and their specs, the two
stylesheets, `foundWords.ts`, `doc.md` and `todo.md` — and the evidence beside
them: the four `useFoundWordSubmit({…})` call sites, the three `legalIndex`
builders, the three `PlayArea` roots and `BoardCol`s that compose the sheet,
the three `.layout` rules that declare its two tokens, `beeBoard.module.css`,
`makeBeeGame.ts`, the three games' `lib/answer.ts`, `WordListRow`,
`GamePage.tsx` and the three wrappers between it and a `PlayArea`, the guards
keyed on the folder (`vocabularies` pending row, `folderDocs` `INTROS_OWED`,
`orphanedDocstrings`, `cssTokens`), and every doc sentence that names the
folder or an export of it. Nothing landed under the folder after its opening
commit (§4's shell-commit check comes back empty), which is expected of a
folder created the same day. Baseline at the read: `tsc -b` clean, lint clean,
29 of 29 green in the folder. **Fifteen findings, F-found-words-1 to -15;
nothing in the code moved at the read.** Five are the prose pass (F-1 to F-5);
three are shape, each with a decision in it (F-6 to F-8); one is a dead branch
with an obvious fix (F-9); two are tests, one of them confirmed by planting
(F-10, F-11); three are the stylesheet (F-12 to F-14, the last being the
`todo.md` item); one is docs outside the folder (F-15). The stamps stay
`cs-met` until the prose pass ships.

## The roster

`src/shared/found-words/` — every code file `cs-met-found-words`:

- `useFoundWordSubmit.ts` · `useFoundWordSubmit.test.ts` — the submit engine: a
  typed word, a shipped legal list to look it up in, and a growing found set to
  dedup against. The folder's largest file by some way, and the one wordiply
  takes without taking anything else
- `foundWordsDisplayRows.ts` · `.test.ts` — the merge: found words deduped to
  their first finder, the reveal appended, alphabetized
- `wordListRows.ts` · `.test.ts` — the one call above it that composes the
  reveal and the merge, made by both the screen and the printer
- `revealWords.ts` · `.test.ts` — what nobody found, from the two shipped lists
- `foundWords.ts` — the family's row and shipped-word types
- `foundWordsPlayArea.module.css` — the play-surface scaffolding the three games
  compose
- `typedWord.module.css` — the in-progress word's look
- `doc.md` (a lede; the `## Intro to area` is OWED — `shared/found-words` is one
  of the eight rows left on `INTROS_OWED` in `src/guards/folderDocs.test.ts`) ·
  `todo.md`

**`useFoundWordSubmit.ts` came in carrying `cs-fixed-outcome-fix`** — the
error/envelope sprint's stamp, from the area that rewrote how this hook
reports a refusal. Re-stamped `cs-met-found-words` with the rest at Joel's
word, so the whole roster reads as one area's.

**`wordListRows.ts` and its test were written by `word-list`** (F-word-list-15,
`87120a09`) and left `cs-unmet` when that area closed, on Joel's ruling at
F-word-list-31 that this area would reach them. It has.

Evidence, to be read but NOT on the roster — the four callers:
`src/spellingbee`, `src/wordwheel` and `src/boggle` use the whole folder;
`src/wordiply` takes `useFoundWordSubmit` alone and has no `found_words` table.
`shared/bee-games` imports this folder's two types (the family-imports-family
edge `docs/common-folders.md` records) and is its own area, row 54.

**What moved under this area is nearly all of it.** The folder was created
2026-09-21 by `plans/found-words.md` — renamed from `word-hunt`, given the
family's types, the typed-word look and the play-surface scaffolding, and joined
by boggle. That plan is still on disk awaiting Joel's read and is the record of
every decision in here; its nine `C-n` check findings were worked the same day.

## Findings

*(`F-found-words-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

### The audit's findings — 2026-09-21

What the folder IS, for the record: one hook, three pure functions, two types
and two stylesheets. `useFoundWordSubmit` is the engine four games type a word
into — it looks the word up in a shipped legal list, dedups it against the
found set (plus a synchronous pending set that closes the realtime-lag window),
shows the answer in the game's below-board slot, and commits an accepted word
in the background without ever blocking the next one. `buildRevealWords` folds
the missed words out of the two shipped lists; `buildDisplayRows` dedups the
found rows to their first finder, shadows the reveal with them and
alphabetizes; `buildWordListRows` is the one call above both that the screen
and the printer make. `foundWords.ts` is the family's row and shipped word,
`foundWordsPlayArea.module.css` the layout the three games' play surfaces
compose, and `typedWord.module.css` the one rule that dims an illegal letter.

The code held up. The engine's two guards — the pending set and the ref
written at event time — are exactly what the docstring says they are and both
are pinned; the dedup's mode rule is right; the reveal, the merge and the rows
call each do one thing and test as one. The sheet is composed by all three
games in every class it carries, both of its tokens are declared by each
game's own `.layout`, and the loading/empty pair, the below-board row and the
mobile budget all read as designed. What has drifted is the prose around it:
a cite into a document that no longer exists, two claims that a flag is one
game's when two games set it, four caller rosters written where a condition
belonged, and fourteen `/**` markers on the members of two types. Under that,
three shape questions the same day's restructure left behind — a name that
collides with a neighboring folder's vocabulary, an answer union spelled six
times across four files, and structural row types whose stated reason died
when boggle adopted the family's — plus one test that proves nothing, four
branches no spec reaches, and a hand-summed height with a "keep in sync"
instruction where a composed one would do.

### F-found-words-1 · `doc-md` · The intro is owed, and the design has no home but the hook's docstring

`doc.md` is a lede and one named section (the reveal's sizing). No `## Intro to
area`, no `## Details`; `shared/found-words` is on `INTROS_OWED`. What a
newcomer would need is scattered: the model (*a typed word, a shipped legal
list to look it up in, a growing found set to dedup against*) is in the hook's
docstring; the folder's drawing rule (by data model, not by history) is a
judgment call in `docs/common-folders.md`; the four seams and who calls which
are in `plans/found-words.md`, which is deleted when Joel has read it; the
reveal-sizing section is the one thing already here. The harvest writes the
intro — what the family is, what wordiply takes and why that is not wrong, the
one thing the games disagree about (`hasBonus`), the camel/snake line (rows
and shipped words are DB shapes and stay snake; what the hook hands back is an
FE shape and is camel, like `WordListRow`) — and a `## Details` with the call
tree, since this folder holds no component but its seams are exactly a
who-calls-what question:

```
spellingbee/PlayArea ┐
   wordwheel/PlayArea ├─▶ useFoundWordSubmit ──▶ the game's localFeedbackSlot
      boggle/PlayArea │            ▲ lookup / commit / explainReject / outcomeFor (the game's lib/answer.ts)
     wordiply/PlayArea ┘
spellingbee/PlayArea ┐  (once for the screen, once inside the print action)
   wordwheel/PlayArea ├─▶ buildWordListRows ─▶ buildRevealWords
      boggle/PlayArea ┘         └──────────────▶ buildDisplayRows ─▶ WordListRow[] ─▶ <WordList>  (common/word-list)
the three PlayArea roots + BoardCols ─▶ foundWordsPlayArea.module.css   (.layout · .belowBoard · .loading · .empty)
the three TypedWord.tsx ─▶ typedWord.module.css                         (.illegal)
bee-games/makeBeeGame · the three useGame.ts ─▶ foundWords.ts           (FoundWordRow · FoundWordsWord)
```

The reveal-sizing section moves under Details as it is. Its row comes off
`INTROS_OWED`.

### F-found-words-2 · `dangling-code-review-cite` · A cite into a document that does not exist, and the paragraph around it is archaeology

`useFoundWordSubmit.ts:26–32` — *"Why this exists as one hook: boggle
previously hand-rolled an optimistic required-word path … (code-review §1.4)"*
— and the test header at `useFoundWordSubmit.test.ts:11` cites the same
`code-review §1.4`. No file in `src/`, `docs/`, `plans/` or `e2e/` is a code
review with a §1.4; the grep comes back with these two lines and nothing else.
Durable files never cite a plan, an audit or a finding, and this is a cite into
one that has already been deleted. The paragraph it sits in is *how it used to
work* ("boggle previously hand-rolled…"), which the comment rule excludes, and
its one durable sentence — the guard is here so no game can grow the bug — is
already the "Optimistic, never blocking" paragraph below it. Both cites go; the
paragraph goes with the first; the test header keeps its list of cases and
loses the parenthetical.

### F-found-words-3 · `pangram-spellingbee-only` · Two claims that the pangram flag is one game's, when two set it

`useFoundWordSubmit.ts:52–53`: *"`isPangram` is spellingbee-only (boggle has no
pangram concept)"*, and `:299–300`: *"a spellingbee-only flag; boggle entries
never set it"*. wordwheel sets it at both `legalIndex` sites
(`wordwheel/PlayArea.tsx:259,262`), commits it (`:295`) and prints its own
pangram glyph (`:461`, a 🦌 to spellingbee's 🐝). The claim was true when the
hook served two games; it has been false since wordwheel was written against it.
Say the condition — *the bee games' flag; boggle's board has no pangram* — or
just *optional: only some games in the family have the concept*, which is what
`foundWords.ts` already says of the same flag.

### F-found-words-4 · `caller-rosters-in-docstrings` · Five sentences that describe callers rather than the contract, and four are wrong today

Each is a roster or a quotation of a caller written into this folder, and each
has rotted since:

- `line()`'s docstring (`useFoundWordSubmit.ts:194`): *"shared by both games"*
  — four games call the hook.
- `wordWithBonusDot`'s (`:185–187`): *"the per-game peer-narration pills
  (spellingbee/boggle coop headers)"* — spellingbee, wordwheel and boggle call
  it, one site each.
- `explainReject`'s (`:89–92`): *"spellingbee 'bad letters' / 'missing center
  letter' / 'not a word'"* — spellingbee answers `missing "A"`, naming the
  letter, and has a comment at the site saying why it does not say "missing
  center letter"; wordwheel's off-wheel case never reaches the hook at all
  (`BoardCol`'s `submitDisabled` gate vetoes it first).
- `revealWords.ts:4–5`: *"shared by the found-words games (spellingbee,
  wordwheel, boggle)"* — true, and the shape that rots: a roster where "the
  games with a `found_words` table" is the condition.
- `foundWords.ts:18–20`: `FoundWordsWord` is *"one entry of a shipped word list
  … or a required-word reveal entry"* — a reveal entry is `RevealWord<W>`, and
  the reveal covers bonus words too.

The fix is the same in each: name the condition, not the callers, and quote no
game's wording. The one sentence that is ABOUT a caller and earns it — wordiply
being the caller with no table, which is why the model is written over two
lists — stays, because it explains this file's own shape.

### F-found-words-5 · `config-member-markers` · Fourteen `/**` on the members of two types, and two of them are essays about callers

The marker pass. `FoundWordSubmitConfig` (`useFoundWordSubmit.ts:61–168`) and
`FoundWordSubmitApi` (`:170–180`) are two declarations; every documented
member of both carries `/**`, and neither type has a docstring of its own. A
member note takes `//` — a props block is the case the pass keeps missing, and
a config object is the same case under another name. Two of the notes are also
the kind of paragraph that belongs elsewhere: `outcomeFor`'s (`:130–152`)
spends a paragraph on which of the four games reads `not_legal` which way,
and `onAnswer`'s (`:112–124`) on what wordiply does with it and what wordwheel
does not. Those are descriptions of callers (F-4's fault, at length) and they
rot with the callers; what a caller of THIS hook needs is the contract —
required, no default, takes the word too because one answer can cover two
rules, and the pill says whatever it returns. The reasoning that the answers
are the game's judgment and never the engine's is the folder's design and goes
to `doc.md` (F-1), once. The two types get a one-line docstring each; the
members go `//`; the two essays shrink to their contract. The test file's
header docstring (`useFoundWordSubmit.test.ts:6–14`) sits above an `import`
line rather than at the top of the file — cosmetic, and moved in the same pass.

### F-found-words-6 · `answer-union-spellings` · The four answer words are spelled six times across four files

In the hook the union `'accepted' | 'too_short' | 'not_legal' |
'already_found'` is written inline three times — `onAnswer` (`:127`) and
`outcomeFor` (`:155`) in two different orders, and `recordReject` (`:110`) as
the two-member subset a rejection can be. spellingbee, wordwheel and boggle
each declare the same four words as `Answer` in their `lib/answer.ts` (the
tables `outcomeFor` indexes); wordiply's `Answer` is wider on purpose — it is
the SERVER's vocabulary, with `not_a_word` and `missing_base` where the hook
says `not_legal`, and `answerFor` maps between them. So the hook's word for
"what the engine decided" has no name, and three games re-derive it by hand.

1. **The hook exports `SubmitAnswer`** (the four words, one order) and its two
   callbacks and `recordReject` read it (`Exclude<SubmitAnswer, 'accepted' |
   'already_found'>` for the subset, or a second named type). The three games'
   `Answer` become `SubmitAnswer` at their one declaration each — a rename
   sweep across three `lib/answer.ts` files, which is the compile-break kind
   this area may make. wordiply's stays its own, since it genuinely is.
   **Recommended:** one spelling, and the game's table is typed by the engine
   it answers.
2. **The hook exports the type; the games keep their own.** Three fewer
   spellings, and three tables that would still silently diverge from the
   engine if a fifth answer were added.
3. Leave it. Against: six copies of one closed set is exactly the drift a
   whole-repo read is for.

### F-found-words-7 · `word-entry-name` · `WordEntry` says the wrong thing, and it is the folder's most-imported name

`WordEntry` (`useFoundWordSubmit.ts:54–59`) is what `lookup` returns: an entry
of the game's legal list — the word, its points, whether it is a bonus word,
whether a pangram. Every one of the four games imports it by that name to type
its `legalIndex`. But `word-entry` is the neighboring folder's vocabulary — the
typed-word control, whose three components were renamed on 2026-09-18 to take
the folder's stem (`WordEntryInput`, `WordEntryArea`, `WordEntryRow`) — and
stackdown has a `<WordEntry>` component of its own. A reader of a game's
PlayArea meets `WordEntry` beside `WordEntryArea` and has to learn that one is
a thing you look up and the other is a box you type into.

What it is is a **legal word**. `LegalWord` says so, reads correctly at every
`Map<string, LegalWord>` and `lookup: (w) => LegalWord | null`, and cannot be
mistaken for a control. The tail is small and mechanical: the hook, its test,
four PlayAreas' imports and three map declarations, and the docs that name the
type (none found in `docs/`; `spellingbee.md` names `lookup` without the
type). Worth saying in `doc.md` while renaming it: the folder holds two
spellings of a shipped word on purpose — `FoundWordsWord` is the DB row
(snake, `is_pangram`) and `LegalWord` is what the engine hands the game
(camel, like `WordListRow`) — and the three `legalIndex` builders are where
one becomes the other.

### F-found-words-8 · `found-row-spellings` · Structural row types whose stated reason died the day they moved in

`foundWordsDisplayRows.ts:14–29` declares `DisplayableFound` and
`DisplayableReveal`, and `wordListRows.ts:38–45` writes the found row's shape
inline a second time; the file docstring gives the reason — *"structural
rather than a game's named types, so a game whose words have no pangram flag
passes its own rows unchanged"*. That was boggle, with its own `FoundWordRow`
and `BoggleWord`. Since call 2 (a) boggle imports the family's `FoundWordRow`
and `FoundWordsWord`, so every caller's row IS `FoundWordRow` and every reveal
entry IS `RevealWord<FoundWordsWord>` — both declared in this folder, one file
away. The structural copies are now a second and third spelling of the
folder's own types, and the paragraph defending them describes a caller that
no longer exists.

1. **The merge and the rows call take the folder's types.**
   `buildDisplayRows(foundWords: readonly FoundWordRow[], revealWords: readonly
   RevealWord<FoundWordsWord>[] | null)`; `buildWordListRows`'s `foundWords`
   is `readonly FoundWordRow[]` and its shipped lists `readonly
   FoundWordsWord[]`, dropping the generic `W` there (it was carrying boggle's
   `BoggleWord`, which is gone). `buildRevealWords<W>` keeps its generic — one
   line, and it is what lets the tag ride a word through unchanged. The two
   local types and the docstring paragraph go. **Recommended:** the types
   exist for exactly this, and the folder should read as one data model.
2. **Keep structural, declare once.** `Pick<FoundWordRow, 'word' | 'user_id' |
   …>` in one place, imported by both. Honest about needing five of seven
   columns, but a `Pick` of a sibling type is the same claim as the type.
3. Leave it, with the paragraph corrected.

Predicted under (1): `wordListRows.test.ts`'s `found()` helper builds a row
without `game_id` and fails `tsc`; it takes the field (or the helper in
`foundWordsDisplayRows.test.ts`, which already builds a whole `FoundWordRow`,
moves to a shared fixture — a tiny one for two files).

### F-found-words-9 · `finderids-dead-fallback` · A `??` arm that cannot run

`foundWordsDisplayRows.ts:76`: `finderIds: findersByWord.get(r.word) ??
[r.user_id]`. The loop above fills `foundByWord` and `findersByWord` for the
same keys in the same iteration, so for every row of the first the second has
an entry; the fallback is unreachable and reads as a case that exists. One map
instead of two — `Map<string, { first: FoundWordRow; finderIds: string[] }>` —
removes the second lookup and the fallback together, and says what the loop is
building. No decision in it; an obvious fix, waiting for the go.

### F-found-words-10 · `screen-print-tautology` · A test that any implementation passes

`wordListRows.test.ts:67–79`, *"answers identically for two callers given the
same game — the screen and the print"*: it calls `buildWordListRows(args)`
twice with the same object and asserts the two results are equal. A pure
function's `f(x)` equals `f(x)`; a `return []` passes. The comment defends it
(*"Not a tautology about one function: the printer used to re-derive this
recipe"*) with archaeology, and the property it wants — that the screen and
the printer make the SAME CALL — is a fact about three PlayAreas that no test
in this folder can see. Delete the case; the sentence it stands for is already
`buildWordListRows`'s docstring, which is where a by-construction property is
stated. `docs/games/spellingbee.md:641` names the case in its test table and
loses the clause with it (F-15). The alternative — a guard that greps the
three PlayAreas for exactly two `buildWordListRows(` each — is a real check,
and more mechanism than the property is worth.

### F-found-words-11 · `unpinned-branches` · Four behaviors no spec reaches, confirmed by planting

Planted in the hook, then the file's spec run: both `recordReject` calls
removed, the `already_found` `onAnswer` call removed, and the input
normalization (`raw.trim().toLowerCase()` → `raw`) removed — **13 of 13
pass.** The file reverted clean. So nothing pins:

- `recordReject` firing for `too_short` and `not_legal`, and NOT for
  `already_found` — the rule the docstring sets in bold, and the one wordiply's
  turn economy rests on;
- `onAnswer` firing for every answer including `already_found` — the
  docstring's stated difference from `recordReject`;
- the word being trimmed and lowercased before lookup, with `lastWord` keeping
  the raw text for recall;
- the commit's REJECTION arm (`:326`), which raises a fault modal — the store
  is already reachable from the test (`clearFaultsForTest` is imported and
  nothing reads it back).

Four cases, no decision. wordiply's `PlayArea.test.tsx` may reach the first
through the page, but the contract is this hook's to pin.

### F-found-words-12 · `loading-empty-rule` · A dead declaration, two px literals, and a marker on the wrong selector

`foundWordsPlayArea.module.css:96–102`, `.loading, .empty { padding: 48px 16px;
text-align: center; color: var(--page-text-muted-color); grid-column: 1 / -1 }`:

- **`grid-column: 1 / -1` is inert.** The two divs are early RETURNS — they
  replace the `.layout` root, not sit inside it — so their parent is
  `GamePage`'s `.pageHeaderAndPlaySurface`, a flex column; `PauseBoundary`,
  `PlayAreaSlotLog` and `PlayAreaErrorBoundary` all pass children through
  (verified). The declaration came with the rule from a layout that was once a
  grid and has had no grid to span since.
- **`48px 16px`** — padding is deliberately parked outside the vocabularies
  guard today (its `properties` comment says why), so the pair is not on the
  pending row; still two px literals in a folder whose other lengths are rem,
  and `--spacer-…` has no 48. A near-miss to look at together, per §5: `3rem
  1rem`, or the ramp's nearest.
- **The `/* @@ */` marker sits before `.empty`**, the second selector of one
  rule — the same mechanical fault corecss corrected at `input,\ntextarea`
  (the marking script anchored on the `{` line). Convention is one marker per
  rule, before it.

### F-found-words-13 · `below-board-margin-literal` · The pending row is a straight conversion

`foundWordsPlayArea.module.css:91`, `.belowBoard { margin-top: 1.5rem }` — the
one value on this file's `vocabularies.test.ts` pending row (`:288`). It equals
`--spacer-1` exactly, so it converts silently and the row is deleted. Listed
rather than just done because the same `1.5rem` is one of the three terms
`--avail-h` hand-sums (F-14), and converting it here without F-14 would leave
`5rem` summing a token by its old value.

### F-found-words-14 · `avail-h-hand-sum` · The todo item: three terms written as one guess, with a "keep in sync" instruction

`foundWordsPlayArea.module.css:43–44`: `--avail-h: calc(100svh -
var(--game-chrome-height) - 5rem)`, where the comment (`:37–42`) says the `5rem`
is the below-board slot (~2.75rem) + the board column's gap (~0.75rem) +
`.belowBoard`'s margin (1.5rem), and ends *"Keep this in sync with
`.belowBoard`'s margin-top below."* `todo.md`'s one item is this number,
and it is the shape `--game-chrome-height` had until 2026-09-15, when a
hand-written 5rem turned out to omit a 1px rule. The three terms exist as
values today: the swap box's height is `--swap-box-min-height` with a
`2.75rem` default in the shared scaffold (`playArea.module.css:279`), the
column gap is a `0.75rem` literal on the scaffold's `.boardCol` (`:171`), and
the margin is F-13's token.

1. **Compose it.** `--below-board-gap: var(--spacer-1)` declared on `.layout`
   and read by `.belowBoard`'s `margin-top`; `--avail-h: calc(100svh -
   var(--game-chrome-height) - var(--swap-box-min-height, 2.75rem) -
   var(--board-col-gap) - var(--below-board-gap))`, with the mobile line
   subtracting the same three plus the status block. The column gap needs a
   name in the scaffold (`--board-col-gap: 0.75rem`, read by `.boardCol`'s
   `gap`) — a two-line edit in blessed `game-page`, the conformance kind this
   area may make since it owns the rule being hand-copied. Same 5rem, so no
   pixel moves; the "keep in sync" sentence and the `~` estimates go. The
   `todo.md` item is deleted as worked. **Recommended:** it is exactly what
   the item asks, and the terms already exist.
2. **Keep the sum, name the terms in the comment only**, and rule the item
   into Won't do: a composed value reads three `var()`s deep for a number
   that has not changed. Against: the chrome-height precedent, and the mobile
   line already composes two of its five terms.
3. Leave the item open for a game area. Against: it is this folder's number.

Under (1) the board-geometry spec is the proof no pixel moved — an e2e, so it
runs only on Joel's word; the baseline artifact is gitignored and re-seeded
first.

### F-found-words-15 · `game-docs-stale-paths` · The family's own subject, stale in two game docs

Outside the folder, found by grepping every doc for the folder's exports:

- `docs/games/spellingbee.md:398` and `wordwheel.md:352` name
  `common/components/game/foundWordsPlayArea.module.css` — two reorgs ago —
  and wordwheel's says it *"holds the whole surface (layout vars, mobile status
  block, the `--u` arithmetic, below-board slot)"*, which is now two files.
- `wordwheel.md:356`: `TypedWord.module.css` *"collapsed into
  `common/…/entry/typedWord.module.css`"* — it is `shared/found-words/`.
- `spellingbee.md:219`: *"both word-list games share the FE `useFoundWordSubmit`
  engine"* — four.
- `spellingbee.md:641`: the test-table row for `wordListRows.test.ts` ends with
  the screen-equals-print clause F-10 deletes.

`plans/found-words.md` step 5 said the only stale paths left in those tables
were two rank-ladder ones; these four are found-words' own and were missed.
Fixed here, as the sweep this folder's move caused.

## What checked out

Claims re-verified against code rather than taken from the docstrings, listed
so the closing re-read does not redo them: the pending set + event-time ref
pair and the same-tick guard (pinned, `:124–173`); the coop/compete dedup rule
(pinned); `useCaptureKeys` DOES live in `<WordEntryArea>` (`:7`), as the hook
docstring says; `useFeedbackSlot` exists and is what a PlayArea makes; the two
doc cites resolve (`ui.md → Feedback pill` at `:54`, `outcomes.md → One event,
one outcome` at `:142`); `usePeerFeedback` exists; all three games compose
`.layout`, `.belowBoard`, `.loading` and `.empty` and all three declare
`--board-reserve` and `--mobile-status-height` on their own `.layout`;
`--avail-h` is read by `beeBoard.module.css` and boggle's sheet and by nothing
else in the family; all three `TypedWord.tsx` wear `typedWord.module.css`;
`--entry-illegal-ink-color` is declared in both palettes; no `word-hunt`,
`useWordSubmit`, `makeFoundWordsGame` or `FoundWordsGame` survives in `src/`,
`docs/`, `e2e/` or the root docs; `orphanedDocstrings` has no entry for the
folder; the `finderIds` docstring matches the code; `foundWords.ts`'s
column-for-column claim was checked against the three migrations by the plan's
C-pass the same day.

## Notes

- **The `@@` marker's meaning, for this file's reader:** a rule Joel has not
  yet seen in place and said looks right; it comes off at his read, never at
  Claude's. F-12 moves one; nothing here removes one.
- **The area's real find is about the day before.** Eleven of fifteen
  findings are prose written or moved into this folder by `plans/found-words.md`
  on 2026-09-21 — the same lesson word-list's re-read recorded: a restructure's
  tail is prose, and its own check pass (C-1 to C-9) read the plan's bullets
  against the code, not the docstrings against the callers.
- **Padding is outside the vocabularies guard on purpose** (its `properties`
  comment) — so a padding literal is found by reading, not by a red spec.

## Predicted test breaks

- F-6 (1): `tsc -b` in three `lib/answer.ts` and their `answer.test.ts` until
  the rename lands; a find-and-replace.
- F-7: `tsc -b` at every `WordEntry` import — the hook, its test, four
  PlayAreas — until the sweep lands.
- F-8 (1): `wordListRows.test.ts` — `found()` builds a row without `game_id`.
- F-10: one case fewer in `wordListRows.test.ts` (five → four).
- F-11: four cases more in `useFoundWordSubmit.test.ts` (13 → 17).
- F-13: `src/guards/vocabularies.test.ts:288` — the pending row is deleted
  with the conversion, or the guard reports a converted value still listed.
- F-14 (1): `e2e/board-geometry.e2e.ts` is the proof, not a break — 21 boxes
  within 0.5px, on Joel's word.
- F-1: `src/guards/folderDocs.test.ts` — `shared/found-words` comes off
  `INTROS_OWED` in the same commit as the intro, or the guard fails either way.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
