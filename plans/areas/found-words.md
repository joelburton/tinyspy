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

**Shipped since the read**, in the order Joel ruled them: F-6 (the answer
union, which he named `WordSubmitAnswer`), F-7 (`WordEntry` → `LegalWord`),
F-8 (the structural row types), F-12 (the loading/empty rule), F-9 (the dead
`??`), F-10 (the tautology, with its `spellingbee.md` clause), F-3 (the
pangram wording, Joel's second option) and F-14 with F-13 (the composed
`--avail-h`, proved by board-geometry), and then the rest in one sitting on
*"fix remaining items"* — the prose pass F-1, F-2, F-4 and F-5 (F-7's held
`doc.md` sentence landed with F-1), F-11's four cases and F-15's stale paths.
**All twenty-one findings are worked** — fifteen from the read, six from the
closing re-read. What the area owes now is the bless, which is Joel's.

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

**SHIPPED, 2026-09-21** (Joel: *"fix remaining items"*). `doc.md` has its
`## Intro to area` and a `## Details`; `shared/found-words` is off
`INTROS_OWED`. The intro states the model as the membership test it is (a game
with all three parts fits the engine), why the folder is drawn around that
rather than around a family of boards, what "shipped" buys — the optimism and
the trusting commit — the one thing the games disagree about and why the engine
has no view of it, and F-7's held sentence about the two spellings of a word.
Details carries the call tree, the screen-equals-printer property and
`hasBonus`. The reveal-sizing section moved under it unchanged.

**The guard shaped it.** `folderDocs`'s in-shape case rejected the first draft:
*"1 intro paragraph(s) open with bold — a bolded claim is a Details item, and
the intro is narrative"*. The two-spellings paragraph opened with a bold claim
and now opens narratively. Worth recording because the rule is not about
emphasis: an intro paragraph that starts by asserting is a Details item wearing
an intro's clothes.

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

**SHIPPED, 2026-09-21.** Both cites are gone. The hook's *"Why this exists as
one hook"* paragraph went with the first — it was how boggle used to work, and
its one durable sentence is the "Optimistic, never blocking" paragraph below it
already. The spec's header keeps its list of cases and loses the parenthetical;
it also moved above the imports, which F-5 owed.

**A correction to the finding:** it says the grep *"comes back with these two
lines and nothing else"*. There is a third — `docs/games/bananagrams.md:64`,
*"Known race — accepted (code-review §1.4)"*. Left alone: bananagrams is its
own area (row 50), and this is its doc, not this folder's. Recorded here so
that area does not have to rediscover the document does not exist.

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

**RULED AND SHIPPED, 2026-09-21.** Joel took the second wording, so both sites
say *optional: only some games in the family have the concept* — the
`LegalWord` docstring and the accepted-word comment. Neither names a game now.

**A correction to the finding:** it credits that wording to `foundWords.ts`,
which does not say it. `foundWords.ts:12` says *"`is_pangram` is optional
because boggle has no pangram concept and its table has no such column"* —
naming a caller for the same flag, the shape F-4 is about. The phrase actually
lived on `DisplayableFound`, which F-8 deleted, so nothing in the folder
carried it when this shipped. **`foundWords.ts:12` is left as it is**: it is
not one of F-3's two sites, and its sentence is a claim about a TABLE (boggle's
column does not exist), which is a fact about the schema rather than a roster.
Flagged for F-4's pass to look at rather than settled here.

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

**SHIPPED, 2026-09-21.** All five name the condition now and quote no game's
wording: `line()` is "every game in the family"; `wordWithBonusDot` says WHY it
is exported (a peer-narration pill names a found word too, and the two would
drift); `explainReject` says the wording is the game's because one board's
misses divide differently from another's; `revealWords`'s lede is "the games
that keep a list of what was found and can therefore say what was not";
`FoundWordsWord` drops the wrong claim that it is also a reveal entry and
points at `RevealWord<FoundWordsWord>` instead.

**Two sentences beyond the five, both handed here.** F-3 flagged
`foundWords.ts:12` (*"optional because boggle has no pangram concept"*), and
the file docstring above it rostered the same three games. Both now state the
condition — "not every board has the concept", "a game in the family keeps a
`<schema>.found_words` table" — which keeps the reason each sentence exists
while losing the count that rots. The wordiply sentence F-4 preserves is
untouched: it explains this file's own shape.

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

**SHIPPED, 2026-09-21.** Every member of both types takes `//`, and both types
have a one-line docstring of their own — the config is "everything the engine
cannot know", the api is "the typed word and the three ways a game touches it".

The two essays are their contract now. `onAnswer` keeps what a caller must know
(presentational, writes nothing, fires for EVERY answer including the
already-found one) and loses the paragraph about which game colors what.
`outcomeFor` keeps required-no-default, `accepted` goes through it too, it takes
the word because one `not_legal` may cover several things, and whatever it
returns is what the pill says — and points at `doc.md` for WHY that judgment is
the game's, which is the folder's design and now lives there once (F-1).
`lastWord` gained the one line its own contract was missing: it keeps the RAW
text, not the lookup key.

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

**RULED (1) AND SHIPPED, 2026-09-21.** Joel named the type: *"make it
`WordSubmitAnswer`, then do engine names it"*. The hook declares and exports
`WordSubmitAnswer`; `onAnswer` and `outcomeFor` read it, `recordReject` reads
`Exclude<WordSubmitAnswer, 'accepted' | 'already_found'>` inline (Q2 went
unanswered and a second exported name was not asked for); the three games'
local `Answer` is gone and their `ANSWER_OUTCOME` is `Record<WordSubmitAnswer,
Outcome>`; wordiply's `answerFor` takes `WordSubmitAnswer` and still returns
its own `Answer`, which is now what that seam looks like. One spelling left in
`src/`. `tsc -b` and lint clean, 32/32 green across the folder and the three
answer specs, 640 green across the four games.

**Two corrections to the finding as read.** It is **seven** spellings, not six
— `wordiply/components/PlayArea.tsx:181` wrote the union out as `answerFor`'s
parameter. And the predicted `tsc` break in the three `answer.test.ts` was
wrong: none of them names the type, they assert on `ANSWER_OUTCOME`'s value.
Nothing broke and no test changed.

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

**RULED (1) AND SHIPPED — `LegalWord`** (Joel, 2026-09-21). Thirteen lines in
six files: the declaration, `lookup` and `commit` in the hook; four in its
spec; an import and a `Map<string, …>` in each of the four PlayAreas. No doc
named the type, and `WordEntry` now means one thing in `src/` — the typed-word
control in `common/word-entry` and stackdown's own component. `tsc -b` and lint
clean, 386 green across the folder and the four games.

**A correction to the finding below:** its parenthetical calls `FoundWordsWord`
"the DB row". It is not — `FoundWordRow` is. `FoundWordsWord` is the SHIPPED
list entry in snake, straight off the board data. So the pair to describe in
`doc.md` is two shapes of one shipped word: snake off the data, and camel once
the game's two lists are merged into one index with `isBonus` recording which
list a word came from (`spellingbee/components/PlayArea.tsx:253–261`). Whether
that sentence is written now or with the rest of `doc.md` at F-1 is unanswered.

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

**RULED (1) AND SHIPPED, 2026-09-21.** `buildDisplayRows` takes `readonly
FoundWordRow[]` and `readonly RevealWord<FoundWordsWord>[]`; `buildWordListRows`
drops its `<W>` and takes the family's two types. `DisplayableFound`,
`DisplayableReveal`, the inline found-row shape and the test's `Shipped` are
gone. `tsc -b` and lint clean, 308 green across the folder and the three games.

On Q2, Joel took the rec: **no shared fixture.** `wordListRows.test.ts`'s
`found()` gained its `game_id` and is typed `FoundWordRow`; the two spec files
keep a small helper each, which reads locally.

**Two corrections to the finding as read.** It is **four** structural copies,
not two-plus-one — `wordListRows.test.ts:12` declared `Shipped`, a fourth
spelling of `FoundWordsWord`. And the dead justification was in **three**
docstrings: `revealWords.ts:7–10` and `wordListRows.ts:27–29` both said the
generic existed *"since spellingbee's and wordwheel's entries carry
`is_pangram` and boggle's do not"*, equally dead now that all three pass the
same type with the flag optional on it. `wordListRows`'s paragraph went with
its generic; `revealWords` keeps its generic and now states the real reason —
it adds a tag and takes nothing away, so the entry rides through unchanged.
Its lede still names the three games, which is F-4's to fix, not this one's.

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

**SHIPPED, 2026-09-21** (Joel: *"do it"*). One map, `Map<string, { first:
FoundWordRow; finderIds: string[] }>`, so the `if (!seen)` branch states the
whole rule at once — the first row of a word wins the attribution AND opens the
finder list — where it was split across two ifs on two maps and re-asserted by
the `??`. The reveal's shadow check reads the same map. 29 of 29 green in the
folder, `tsc -b` and lint clean.

**The rewritten loop is pinned, confirmed by planting:** reversing the sort to
latest-first failed 3 of the spec's 8 cases. So the earliest-finder rule is a
real assertion, not an accident of fixture order.

`foundWordsDisplayRows.ts:76`: `finderIds: findersByWord.get(r.word) ??
[r.user_id]`. The loop above fills `foundByWord` and `findersByWord` for the
same keys in the same iteration, so for every row of the first the second has
an entry; the fallback is unreachable and reads as a case that exists. One map
instead of two — `Map<string, { first: FoundWordRow; finderIds: string[] }>` —
removes the second lookup and the fallback together, and says what the loop is
building. No decision in it; an obvious fix, waiting for the go.

### F-found-words-10 · `screen-print-tautology` · A test that any implementation passes

**SHIPPED, 2026-09-21** (Joel: *"do it"*). The case is gone (five → four), and
`docs/games/spellingbee.md`'s test-table row lost the clause with it — the F-15
half that belonged to this edit. The property it was reaching for stays where
it was already stated by construction, in `buildWordListRows`'s own docstring.
28 of 28 green in the folder.

**One site beyond the finding.** The spec's own header docstring made the same
claim — *"the SAME call answers for the screen and the printer — which is the
property that stops a printed board disagreeing with the one on screen"* — so
deleting the case alone would have left the file promising a case it no longer
has. Trimmed to the two properties it does pin. Found by re-reading the header
after the fix; nothing else in `src/` or `docs/` claims it.

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

**SHIPPED, 2026-09-21.** Four cases, 13 → 17, no production code touched:
`recordReject` fires for too-short and not-legal and NOT for already-found (as
one `mock.calls` assertion, so an extra call fails too); `onAnswer` gets all
four answers in order; the word is trimmed + lowercased for lookup while
`lastWord` keeps `'  ApPle  '`; and a commit that THROWS raises the fault modal,
read back with `peekFaultsForTest`.

**Planted to prove they bite:** with the `too_short` `recordReject` call, the
`already_found` `onAnswer` call and the normalization all removed at once,
three of the four fail (the fourth is the throw case, which those edits do not
touch). Before this, the same plant passed 13 of 13.

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

**RULED AND SHIPPED, 2026-09-21**, all three parts.

- **`padding: 3rem 1rem`.** Joel: *"we don't need to fit padding to ramps, so
  we won't. [but] this is probably best expressed in rem"* — so neither half is
  tokenized, though `16px` is `--spacer-2` exactly. No pixel moves.
- **`grid-column: 1 / -1` deleted.** Confirmed inert: both divs are early
  RETURNS, so their parent is `GamePage`'s `.pageHeaderAndPlaySurface`, which is
  `display: flex; flex-direction: column` (`GamePage.module.css:22–24`).
- **The marker: the finding had the convention backwards.** It said *"one
  marker per rule, before it"*; the repo says a marker on EVERY selector line,
  4 of 4 marked multi-selector rules — `wordiply/GuessBoard.module.css:63`,
  `FloatingPanel.module.css:263`, `PageHeaderButton.module.css:31`, and
  `strands/components/PlayArea.module.css:49`, which is the same `.loading,
  .empty` pair. So the fix was to ADD one to `.loading`, not move `.empty`'s.
  Caught by checking the precedent before editing.

**The rule is destined to go entirely, and that is now recorded.** Joel, on
reading the two divs: *"i suspect all game[s] will get a ..Loader component and
will move to NoSuchGamePage and Loading components, so it probably doesn't
matter what we do here."* It is already the settled shape —
[docs/playarea.md → The shape of a game's PlayArea.tsx](../../docs/playarea.md#the-shape-of-a-games-playareatsx),
harvested at psychicnum's close, three gates: `<Loading>`,
`<EnvelopeErrorPage>`, `<NoSuchGamePage>`. Each of the three games deletes its
own two divs as its area opens; **the shared rule is this folder's to delete
and nobody else's**, which nothing said before — now a Someday in `todo.md`
with the trigger and the grep that says it is time.

**A sibling difference, flagged and not touched:** strands' identical selector
pair is `padding: 2rem` with no `text-align: center`. Both are headed for the
same two components, so the drift resolves itself.

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

**SHIPPED with F-14, 2026-09-21**, which is the only way it could go. F-14's
composed sum reads `--below-board-gap`, and that token IS this conversion:
`.layout` declares `--below-board-gap: var(--spacer-1)` and `.belowBoard`'s
`margin-top` reads it. The `vocabularies` pending row is deleted, and the guard
fired to say so before it was — see F-14.

`foundWordsPlayArea.module.css:91`, `.belowBoard { margin-top: 1.5rem }` — the
one value on this file's `vocabularies.test.ts` pending row (`:288`). It equals
`--spacer-1` exactly, so it converts silently and the row is deleted. Listed
rather than just done because the same `1.5rem` is one of the three terms
`--avail-h` hand-sums (F-14), and converting it here without F-14 would leave
`5rem` summing a token by its old value.

### F-found-words-14 · `avail-h-hand-sum` · The todo item: three terms written as one guess, with a "keep in sync" instruction

**RULED (1) AND SHIPPED, 2026-09-21** (Joel: *"do it, and you can run the
e2e"*). Both lines compose now — desktop subtracts
`var(--swap-box-min-height, 2.75rem)`, `var(--board-col-gap)` and
`var(--below-board-gap)`; mobile subtracts those three plus
`var(--mobile-status-height)` and a second `--board-col-gap`. The `~`
estimates, the `5rem` and the *"Keep this in sync"* sentence are gone, and the
`todo.md` item is deleted as worked.

**Proved: no pixel moved.** `e2e/board-geometry.e2e.ts` cannot be trusted
against a stale local baseline, so the baseline was re-seeded on the
PRE-change tree (`git stash`, `rm` the artifact, run — 21 boards written), the
change restored, and the spec re-run: **21 of 21 match within 0.5px.**

**One deviation from the finding, and it matters.** It said to name the gap on
`.boardCol` — *"`--board-col-gap: 0.75rem`, read by `.boardCol`'s `gap`"*. That
cannot work: `.boardCol` is a DESCENDANT of `.layout`, and a custom property
declared on the descendant is invisible to the ancestor that does the
arithmetic, so `--avail-h` would have resolved to nothing and voided the whole
declaration — the exact silent damage this file's own mobile comment warns
about. It is declared on the scaffold's `.layout` instead, read by
`.boardCol`'s `gap` through inheritance. **Checked before relying on it:** 14
of 16 PlayAreas compose `shared.layout`, and the two that do not
(bananagrams, crosswords) do not use the shared `.boardCol` at all —
bananagrams has its own by a comment that says so, crosswords has none. So no
fallback is needed and none was added.

**The guard drove one improvement.** `--board-col-gap: 0.75rem` left the
scaffold clean of literals, which failed `vocabularies` with *"on the pending
list but write no literal at all any more"*. The honest fix was not to delete
the row quietly: `0.75rem` IS `--spacer-3`, so the token reads
`var(--spacer-3)` and sources its value from the ramp, exactly like
`--below-board-gap: var(--spacer-1)` beside it. Two pending rows deleted —
`playArea.module.css`'s `0.75rem` and this file's `1.5rem` (F-13).

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

**SHIPPED, 2026-09-21**, all four items — the fourth shipped early with F-10.
`spellingbee.md:398` and `wordwheel.md:352` name `shared/found-words/`;
wordwheel's sentence no longer claims one file holds the `--u` arithmetic too;
`wordwheel.md:357` points `typedWord.module.css` at this folder;
`spellingbee.md:219` says "every game that ships its legal list to the client"
where it counted two.

**Found while sweeping, and NOT fixed:** the pre-reorg path
`common/components/game/` survives in six game docs for OTHER folders' files —
`PlayArea.module.css` (stackdown, boggle, waffle, spellingbee), `RankBar` and
`Stats` (spellingbee), and `common/…/entry/GuessKeyboard` (wordiply ×2). Each
belongs to the area that owns that file, not to this one.

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

### The closing re-read — 2026-09-21

Every roster file read in one sitting after the last group, plus a
docstring-marker pass over the prose the area itself wrote today. **Six
findings, F-16 to F-21.** The effects are named (`syncConfigRef`), no `/**`
survives inside a type body, the call tree in `doc.md` matches the six call
sites, and nothing outside the folder still names a type this area deleted
(`WordEntry`, `DisplayableFound`, `DisplayableReveal`, `Shipped`) — those were
checked and are clean.

**Five of the six are this area's own fixes not reaching a sibling**, which is
now the seventh area running with that lesson. F-4 rewrote five docstrings to
name a condition instead of a roster and did not reach the file docstring above
them, the sentence four lines under the one it fixed in `revealWords.ts`, or
either stylesheet. F-3 ruled the pangram flag names no game and the spec still
names one. And F-1's new intro introduced a count of its own.

### F-found-words-16 · `file-docstring-roster` · The engine's own docstring opens with the roster F-4 removed from its members

**SHIPPED, 2026-09-21.** *"for a game that ships its legal list to the client"*,
and the sentence that counted four twice now says what such a game does. The
wordiply sentence stays.

`useFoundWordSubmit.ts:11-12` — *"used by boggle, spellingbee, wordwheel and
wordiply"* — and `:16`, *"All four ship their legal list to the FE, so all four
do the same thing on submit."* F-4 fixed five member docstrings in this file
for exactly this and never looked up at the file's own. A fifth caller makes
both lines wrong, and the second one twice in one sentence. The condition is
already written on the line below: a game that ships its legal list to the
client. The wordiply sentence at `:22` stays — F-4 preserved it on purpose,
because it explains this file's shape.

### F-found-words-17 · `reveal-three-games` · The same fault four lines under the fix

**SHIPPED, 2026-09-21.** The condition, not the count: *"where the word list
has a found/missed filter of its own that is control enough."*

`revealWords.ts:23`: *"for the three games that use this it's simply
`isTerminal`."* F-4 rewrote this file's lede today to stop rostering three games
and left the count in the next docstring down. Say the condition — a caller
whose word list has a found/missed filter — or drop the clause, since the
sentence's point is that WHEN to reveal is the caller's business.

### F-found-words-18 · `stylesheets-roster` · Neither stylesheet was in the prose pass's scope, and both carry its fault

**SHIPPED, 2026-09-21** — five sites in `foundWordsPlayArea.module.css`, one in
`typedWord.module.css`. The `.illegal` comment naming all three boards stays,
as recorded above.

F-4 was written as a docstring finding, so the CSS was never read for it. Six
sites: `foundWordsPlayArea.module.css:3` (a roster and a count — *"the three
found-words games share — boggle, spellingbee and wordwheel"*), `:11` (*"All
three games compose every class"*), `:22` (*"all three use 24rem"*), `:25`
(*"the three genuinely differ"*), `:70` (*"the three games here"*), and
`typedWord.module.css:8` (*"Worn by all three of the family's `TypedWord.tsx`
files"*).

`typedWord.module.css:14-16` names all three games too and should STAY: it says
what "illegal" means on each board — off the letters, past the tile count,
beyond a traceable path — which is the rule's whole subject, not a roster.

### F-found-words-19 · `pangram-spellingbee-in-spec` · The claim F-3 retired, one file away

**SHIPPED, 2026-09-21.** The parenthetical is gone; the case is about the
format.

`useFoundWordSubmit.test.ts:217`: *"A pangram entry (spellingbee) gets the
'pangram' prefix."* F-3 ruled this morning that the flag is not one game's —
wordwheel has set it since it was written — and fixed the two sites in the
hook. The spec's copy was not in F-3's two and survived. The parenthetical
buys nothing here: the case is about the format, not about whose board it is.

### F-found-words-20 · `model-sentence-two-homes` · The folder's defining sentence now has two copies

**SHIPPED under (2), 2026-09-21.** The docstring keeps the model in full;
`doc.md` names it and points there.

**The fix broke the paragraph under it, and that is the finding worth keeping.**
`doc.md`'s next paragraph opened *"What they share is the sentence above"* — a
back-reference to the sentence this fix had just removed. Caught by reading the
intro straight through after editing it, which no check does. It reads *"What
they share is the model"* now.

**RULED (2) — the DETAILED version lives in the docstring** (Joel, 2026-09-21:
*"prefer docstring for detailed version"*). Not yet built. So
`useFoundWordSubmit.ts` keeps the model stated in full, as the thing a caller
reads before calling; `doc.md`'s intro stops spelling the three parts out and
names the model instead, pointing at the docstring for the exact statement. The
intro's own argument is unchanged — it is about what the model DECIDES
(whether a game belongs here, why the folder is drawn around a data model, why
wordiply is the test of the rule rather than the exception) and that reasoning
stays in `doc.md`, where nothing else carries it.

F-1 wrote the model into `doc.md:13-15` as the intro's first claim, and it is
still verbatim at `useFoundWordSubmit.ts:14-16`: *"a typed word, a shipped legal
list to look it up in, and a growing set of found words to dedup against."* One
sentence, two durable homes, written by this area today — the drift starts the
first time either is edited.

1. **`doc.md` keeps the model; the hook's docstring says what the HOOK does.**
   The sentence is the FOLDER's identity — it is what decides whether a game
   belongs here, which is an orientation question and not a calling question.
   The docstring keeps its own subject (validate, show, commit optimistically,
   never block) and points at `doc.md` once. **Recommended**, and it is the
   same move F-5 made with `outcomeFor`'s reasoning.
2. **The hook keeps it; `doc.md` cites the docstring.** Against: an intro that
   sends a newcomer into a 280-line hook for the folder's one-sentence
   definition has the direction backwards.
3. Leave both. Against: it is one sentence with two owners, which is the thing
   a whole-repo read exists to find.

### F-found-words-21 · `intro-count` · A count in the intro the prose pass wrote

**SHIPPED, 2026-09-21.** *"A game whose board is in front of you"* against
wordiply, no count on either side, and the ragged break is closed.

**Four counts were read and KEPT**, so a later pass does not re-raise them:
`foundWordsPlayArea.module.css:38`'s "the three things" counts the three terms
of the `calc` directly below it; `doc.md`'s "so the three cannot disagree"
counts three surfaces the same sentence just enumerated; the call-tree diagram
names real callers, which is what a diagram is; and `todo.md`'s count is
load-bearing — the item fires when the LAST of those three converts.

**One flagged, not touched:** `doc.md`'s LEDE opens *"What spellingbee,
wordwheel and boggle share"* and closes *"the play-surface scaffolding all
three compose"* — the same fault the stylesheets just lost. It predates this
area, no finding covered it, and whether a folder's front door should name its
games is Joel's call.

`doc.md:39`: *"Three games read a word the list does not know as a wrong
move."* Written today, in the same pass that took seven counts out of the
docstrings. The paragraph does not need the number — the contrast is between
the games whose board is in front of you and wordiply, which is asking for
strange words, and that reads better without counting either side.

Also cosmetic, same paragraph: `doc.md:51-52` has a ragged line break mid-
sentence left by the reshaping that answered the `folderDocs` guard.

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

- ~~F-6 (1): `tsc -b` in three `lib/answer.ts` and their `answer.test.ts` until
  the rename lands; a find-and-replace.~~ Shipped, and the `answer.test.ts`
  half was wrong — none of the three names the type.
- ~~F-7: `tsc -b` at every `WordEntry` import — the hook, its test, four
  PlayAreas — until the sweep lands.~~ Shipped; nothing broke.
- ~~F-8 (1): `wordListRows.test.ts` — `found()` builds a row without `game_id`.~~
  Shipped; predicted correctly, and the fix was the one line.
- ~~F-10: one case fewer in `wordListRows.test.ts` (five → four).~~ Shipped.
- ~~F-11: four cases more in `useFoundWordSubmit.test.ts` (13 → 17).~~ Shipped,
  exactly 13 → 17.
- ~~F-13: `src/guards/vocabularies.test.ts:288` — the pending row is deleted
  with the conversion, or the guard reports a converted value still listed.~~
  Shipped, and it fired exactly as predicted — plus a SECOND row nobody
  predicted, `playArea.module.css`'s `0.75rem`, which the scaffold edit
  emptied. Both deleted.
- ~~F-14 (1): `e2e/board-geometry.e2e.ts` is the proof, not a break — 21 boxes
  within 0.5px, on Joel's word.~~ Run 2026-09-21 on his word: baseline
  re-seeded on the pre-change tree, 21 of 21 match within 0.5px.
- ~~F-1: `src/guards/folderDocs.test.ts` — `shared/found-words` comes off
  `INTROS_OWED` in the same commit as the intro, or the guard fails either
  way.~~ Shipped together. The guard ALSO caught the intro's shape, which was
  not predicted — see F-1.

## Closing

- [x] the whole area re-read in one sitting after the last group (2026-09-21,
      after F-1..F-15) — six more findings, recorded under *The closing re-read*
- [x] the folder's `doc.md` Design written; its row off `INTROS_OWED` (F-1)
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
