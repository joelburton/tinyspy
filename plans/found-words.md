# The found-words family — the plan

**A PLAN, not a description.** Drafted 2026-09-21 from a conversation with
Joel during the `word-list` area, and re-read against the code the same day;
**nothing in it has been built, and no step starts until Joel says so.** When
it ships, the durable parts move into
[docs/common-folders.md](../docs/common-folders.md) and each folder's `doc.md`,
and this file is deleted. Decisions marked **(Joel)** are his and made;
questions under "Open calls" are his. **All seven are answered as of
2026-09-21**, each recorded on its own entry with the reasoning that produced
it. Nothing here is precedent for anything else.

## What the walk found

Three folders serve the games that find words on a board, and the folders were
drawn by history rather than by what is shared. Boggle and spellingbee were
written independently; wordwheel was written to look and act like spellingbee.
So `shared/bee-games` is "spellingbee and its fork", and boggle was never in
the room when anything was factored out of them.

Who imports what today, from the import graph and not from the docs:

| file | folder | importers |
|---|---|---|
| `useWordSubmit` | word-hunt | spellingbee, wordwheel, boggle, wordiply |
| `revealWords` | word-hunt | boggle (spellingbee + wordwheel reach it through `wordListRows`) |
| `foundWordsDisplayRows` | word-hunt | `wordListRows` only |
| `wordListRows` | word-hunt | spellingbee, wordwheel |
| `foundWords.ts` (the types) | bee-games | spellingbee, wordwheel — and `word-hunt/foundWordsDisplayRows.test.ts`, a family importing a family, which common-folders.md says has no instance today |
| `makeFoundWordsGame` | bee-games | spellingbee, wordwheel |
| `foundWordsLeaderboard` | bee-games | spellingbee, wordwheel |
| `foundWordsPlayArea.module.css` | bee-games | spellingbee, wordwheel |
| `typedWord.module.css` | bee-games | spellingbee, wordwheel |
| `WordList` (the panel) | common/word-list | spellingbee, wordwheel, boggle |

And what boggle duplicates rather than imports:

- `boggle/lib/displayRows.ts` is the shared merge line for line, minus the
  pangram flag the shared row type already makes optional. Its todo has said so
  since before this plan.
- `boggle/components/PlayArea.module.css` carries the bee stylesheet's layout
  half — `.layout`, the mobile block, `.belowBoard`, `.loading` / `.empty` —
  with three differences: the mobile status height (4.5rem against 4.25rem),
  the width token `.belowBoard` reads (`--side` against `--board-width`), and
  the loading pair's padding and ink (`2rem` / `--page-text-color` against
  `48px 16px` centered / muted). The board half is a square and genuinely its
  own.
- `.unreachable` in that stylesheet is `typedWord.module.css`'s one rule under
  another name: the same declaration, the same token.
- Two inline `status?.leaderboard as LeaderRow[]` casts in its PlayArea are
  the shared reader's whole job.
- Its found-word row and shipped word are the bee types minus `is_pangram`;
  its game header is genuinely different (a board string and a side, not a
  center letter and outer letters). Its leaderboard row is the bee row minus
  `rank_idx`.

`word-hunt` is also the wrong name for the hook's folder: strands is a
word-hunt game by any reading and cannot use the hook, because its acceptance
is the server's — the FE has neither the solution nor a dictionary. What the
hook models is narrower than "hunting words": **a typed word, a shipped legal
list to look it up in, and a growing set of found words to dedup against.**
Wordiply fits that model exactly (its guesses are the found set) even though
it has no `found_words` table and no word list.

## The target shape

Three folders and one common file. **(Joel)**: the three-folder shape — a
family folder for what boggle, spellingbee and wordwheel share; `word-list`
kept as the panel and only the panel, so a game could use the list without
the family or the family without the list; `bee-games` reduced to what only
spellingbee and wordwheel use.

| file | today | target | why |
|---|---|---|---|
| `useWordSubmit` | word-hunt | **found-words** | the model is a shipped list + a found set; wordiply is a found-words user without the table |
| `revealWords`, `foundWordsDisplayRows`, `wordListRows` | word-hunt | **found-words** | the family's rows-in adapter to the panel: what they know is the family's data (finder, time, which shipped list) |
| `FoundWordRow`, `FoundWordsWord` (in `foundWords.ts`) | bee-games | **found-words, per call 2** | the row and the word are the family's once `is_pangram` is optional. If call 2 keeps boggle on its own two types, they have only bee readers and stay where they are |
| `FoundWordsGame` (the same file today), renamed **`BeeGame`** | bee-games | **bee-games** | the header — a center letter, outer letters, a ladder denominator — is the hive's and the wheel's, and the factory's return type. It does not move with the row, so `foundWords.ts` splits if the row moves. Its NAME had to move too: it is bee-specific and was calling itself found-words (call 2) |
| `typedWord.module.css` | bee-games | **found-words** | boggle duplicates its one rule |
| the layout half of `foundWordsPlayArea.module.css` | bee-games | **found-words** | `.layout`, the mobile block, `.belowBoard`, `.loading` / `.empty` are the same in boggle but for three numbers |
| the board half of that stylesheet | bee-games | **bee-games** | `.boardCol`'s rectangle-in-units geometry and the 20rem `.mobileStatus` are the hive's and the wheel's |
| `makeFoundWordsGame`, renamed **`makeBeeGame`** | bee-games | **bee-games** | boggle keeps its own hook (the standing ruling, below), so the factory answers for the two bee games and says so |
| `readLeaderboard` | bee-games | **common** | generic over every compete game; five games hand-write its guard |
| `LeaderboardEntry` (the row with `rank_idx`) | bee-games | **bee-games** | its writers are `spellingbee.submit_word` and `wordwheel.submit_word`, and two of its three columns are found-words facts. rank-ladder's doc says there is no data model behind that folder, which is what lets any ladder game take it; this row would give it one |
| `word-list/*` | common | **unchanged** | the panel, its filter, its recent mark, its stylesheet |
| `boggle/lib/displayRows.ts` + test | boggle | **deleted** | replaced by the shared merge |
| `boggle`'s `.unreachable` | boggle | **deleted** | replaced by the shared `.illegal` |

`word-hunt` as a folder name goes away. `found-words` is the name the repo
already uses in prose ("the found-words family"), and the three games with a
`found_words` table are exactly its members; wordiply takes one file from it
and that is not wrong, because the file's inputs are found words.

### The standing rulings this plan keeps

- **Boggle does not take the game factory** (`boggle/todo.md`, Joel: *"i
  prefer clarity and not over-generalizing"*). Its header comes from a different
  table with different columns; sharing the factory would parameterize the
  table, the select and the row mapping. Revisit only if a fourth game turns up.
- **`revealWords` stays in `shared/`** while `useSolutionReveal` is
  `common/reveal` ([common-folders.md → Judgment
  calls](../docs/common-folders.md#judgment-calls-recorded-so-they-dont-get-re-litigated)).
  This plan renames its folder and nothing else about that split.
- **Common never imports shared.** `readLeaderboard` moving to common means its
  default row type cannot come from a family: the generic loses its default,
  and every caller names its row (`readLeaderboard<LeaderRow>(status)`), which
  is what the boggle todo already asks for.
- **The merge, the reveal and the rows call are structural over the row and
  the word.** `buildRevealWords<W extends { word }>`, `buildWordListRows<W
  extends { word; points; is_pangram? }>` and `buildDisplayRows`'s two local
  types accept boggle's `FoundWordRow` and `BoggleWord` as they are — boggle's
  PlayArea already calls `buildRevealWords` with them. So step 3 does not
  depend on call 2: boggle adopts the functions whichever way the types go.

## Open calls

1. **ANSWERED (Joel, 2026-09-21): rename to `useFoundWordSubmit`.** Keep
   `useWordSubmit` under the new folder, or rename
   it. My recommendation: `useFoundWordSubmit`, which says the folder's word.
   Not `useTrustingCommit` — scrabble and letterboxed are trusting-commit too
   and could never use it, so the trust model is the part that is not
   distinctive. **The cost, so the call is made with it visible:** the name
   appears at fifty-six sites in twenty-four files outside `plans/` — fourteen
   in `src/` (the four callers' PlayAreas and BoardCols, their tests, the hook
   and its test, strands' and letterboxed's PlayArea comments explaining why
   they do not use it), nine game and hub docs, one e2e header — and a rename's
   tail is prose, not identifiers: every one is read, not sed'd. Keeping the
   name costs nothing at step 1 beyond the import path.
2. **ANSWERED (Joel, 2026-09-21): (a), optional on the shared type.** So the
   row and the word move to found-words, boggle deletes its own two, and
   `foundWords.ts` splits — the header goes to bee-games, into the factory
   file whose return type it is rather than a one-type file of its own.

   **And the sub-question below was answered the other way, on Joel's
   correction: nothing bee-specific is called found-words.** *"why is
   `FoundWordsGame` called that when it's specific to bee games? it has stuff
   like center letters and stuff, so it's not for found-word games; it's for
   bee games."* He is right, and the plan's own answer below — that leaving it
   is honest enough because the factory is called `makeFoundWordsGame` — was
   not an argument: it defended one wrong name with another. The word
   `found-words` meant the two bee games only because boggle was never in
   their folder; this plan is what gives it a second, real meaning, and the
   collision is the plan's to clean up.

   **The five names, and where each is fixed:**

   | was | is | when |
   |---|---|---|
   | `FoundWordsGame` | `BeeGame` | step 1 |
   | `makeFoundWordsGame` | `makeBeeGame` | step 1 |
   | `useFoundWordsGame` | `useBeeGame` | step 1 |
   | `foundWordsLeaderboard.ts` | a bee name | **step 2**, when it loses `readLeaderboard` and is left holding one bee row |
   | `foundWordsPlayArea.module.css` | a bee name for the half that stays | **step 4**, when it splits |

   The first three had no other work scheduled, so they were done at step 1.
   The last two are being restructured anyway, and renaming them twice would
   be churn — so each takes its name at the step that opens it.

   **How boggle's row gets `is_pangram`** — which is really *whether boggle
   imports the family's types at all*, and that decides where `foundWords.ts`
   lives. The types are hand-written to match each hook's explicit select;
   boggle's table has no such column. Three ways:
   - **(a)** the shared `FoundWordRow` and `FoundWordsWord` make `is_pangram`
     optional (`is_pangram?: boolean`); boggle imports them and deletes its
     own two; their readers already treat absent as false (`isPangram:
     r.is_pangram` into an optional field, `e.isPangram ?? false`, `r.is_pangram
     ? 'pangram' : 'found'` — nothing reads it as a required boolean). The
     panel's own row type does exactly this with `isPangram?`, and so do the
     merge's structural types. Then the two types move to found-words and the
     header stays in bee-games (the file splits; see step 1).
   - **(b)** the shared types stay strict and boggle's hook maps each row to
     `is_pangram: false` at the read. Same move for the file; boggle's rows
     then claim a column its table does not have.
   - **(c)** boggle keeps its own `FoundWordRow` and `BoggleWord` (two short
     types that say what its table has) and the shared functions take them
     structurally, as they do today. Then `foundWords.ts` has only bee readers
     and stays in bee-games, unsplit, and the family folder holds the
     functions and the look but no types.
   My recommendation: **(a)** — it is the row boggle's hook literally
   duplicates, and an optional flag is the shape the panel already settled.
   **A sub-question if (a) or (b):** the header type keeps the name
   `FoundWordsGame` in a folder that is no longer the found-words one. Leaving
   it is honest enough (the factory's own name is `makeFoundWordsGame`); if it
   changes, the two `useGame.ts` re-exports are the whole tail.
3. **ANSWERED (Joel, 2026-09-21): `common/game-page/readLeaderboard.ts`, its
   own file beside `gamePageCtx.ts`.**

   **Where `readLeaderboard` lives in common.** `game-page/gamePageCtx.ts` is
   the file that documents the `status.leaderboard` convention and hands games
   their status, so `game-page/readLeaderboard.ts` beside it is the obvious
   home. `game-page` is a closed, blessed area; closed is not locked, and a new
   file there lands `cs-unmet` until an area reads it. Mechanics: the stamps
   guard reads the git index, so the new file must be `git add`ed to be seen
   at all, and must carry `// cs-unmet` on line 1 or the guard fails it.
4. **ANSWERED (Joel, 2026-09-21): the per-game token.** The shared mobile
   block reads `--mobile-status-height` and stops declaring it; spellingbee
   and wordwheel each declare `4.25rem` on their own `.layout`, boggle
   `4.5rem`, beside the board numbers already there.

   **The mobile status height.** The shared layout block sets
   `--mobile-status-height: 4.25rem`; boggle's measured value is 4.5rem
   (its three-line stat cells). Either the shared block reads a per-game token
   the game's own stylesheet sets, like the four board-units numbers already
   do, or boggle overrides it in its own `.layout`. **The override is the
   fragile one:** two `.layout` rules of equal specificity from two modules are
   ordered by stylesheet order in the bundle, not by their order in `cls()`,
   and that order is per lazy chunk — so which 4.xrem wins is decided by the
   bundler. The token has no such contest: the shared mobile block reads
   `var(--mobile-status-height)` and stops declaring it, and each of the three
   games declares its own on its `.layout`, unconditionally, beside the numbers
   it already sets there (`<MobileStatusBar>` is display-none on desktop, so the
   value is inert above the breakpoint). The bar's own stylesheet reads the
   same token with a 1.75rem fallback and needs no change.
5. **ANSWERED (Joel, 2026-09-21): `bee-games` keeps its name.** The doc stops
   calling it a placeholder.

   **bee-games' name.** Its doc calls the name a placeholder. After this plan
   it holds the factory, the bee header and leaderboard row, and the
   hive-and-wheel board geometry. The two games' shared trait is a center
   letter the word must use, so `center-letter` would say what they share;
   keeping `bee-games` costs nothing. Not load-bearing.
6. **ANSWERED (Joel, 2026-09-21): leave them `cs-unmet`.** This plan stamps
   nothing, in boggle or anywhere else. Boggle's own area reads and stamps
   those files when it opens — the same answer the three previous
   cross-cutting passes reached (app-audit.md §3 rows 39, 40 and 41).

   **Stamps for boggle's converted files.** This work happens outside boggle's
   area, at Joel's word (*"we'll do this during the plan rather than waiting
   for a boggle audit"*), the same way the post-close connections work did.
   Those files carry `cs-unmet` today; whether the plan stamps them for the
   audit or leaves them for boggle's area is Joel's.
7. **ANSWERED (Joel, 2026-09-21): the alias.** Boggle's `.boardCol` gains one
   line, `--board-width: var(--side)`. `--side` stays boggle's own, so it
   keeps the square-board idiom it shares with waffle, scrabble, stackdown
   and letterboxed, and the shared rule has one name to read.

   **The width token the shared `.belowBoard` reads.** spellingbee's board
   column computes `--board-width`; boggle's computes `--side`, the idiom every
   square board in the app uses (waffle, scrabble, stackdown, letterboxed) and
   that `playArea.module.css` documents as the square variant. Either boggle
   renames `--side` to `--board-width` (five declarations and reads in its
   stylesheet, two comments elsewhere, and boggle becomes the one square board
   not on the idiom), or its `.boardCol` adds one line, `--board-width:
   var(--side)`, the alias the shared rule reads. My recommendation: the alias.

## The steps

Each step is one commit-sized unit that leaves the tree green. Order matters:
the rename first so every later import path is written once. Steps 2 and 3
are independent of each other; step 4 needs step 1's folder and, for boggle,
step 3's `.illegal`.

### 1. `word-hunt` becomes `found-words`, and takes the family's files — SHIPPED 2026-09-21

**Four deviations from what this step said, each small and each deliberate:**

- **The intro was NOT written, and the folder stays on `INTROS_OWED` under its
  new name.** This step said "a new lede and intro". But `folderDocs.test.ts`
  is explicit that the list "tracks the intro, not the file", that "each area
  deletes its own line when it writes its intro", and that the length of the
  list "is how much of the tree is still undescribed". The found-words area is
  NOT OPENED, so an intro written here would claim work nobody has done and
  shorten that marker by a folder. The LEDE is rewritten (it has to be — the
  H1 is the folder name and the folder is a different one now), the
  reveal-sizing section is kept, and the row is renamed in place.
- **The bee header went into the factory's own file**, not a `beeGame.ts` of
  its own — the step offered either. It is the factory's return type, the two
  `useGame.ts` files already import the factory from that path, and it saves a
  one-type file. That file is now `makeBeeGame.ts`, per the naming ruling in
  call 2, which also renamed the header to `BeeGame`, the factory to
  `makeBeeGame` and its hook to `useBeeGame`.
- **`WordSubmitConfig` and `WordSubmitApi` renamed with the hook**, to
  `FoundWordSubmitConfig` / `FoundWordSubmitApi`. They are named for the hook
  and read nowhere but the hook and its test, so leaving them would be the
  kind of rename tail that compiles and lies.
- **`common-folders.md`'s "there is no such edge today" sentence was corrected
  here, not at step 5.** This step is what makes bee-games import found-words,
  so this step is where the sentence stops being true.

Also worth knowing: spellingbee.md's four stale `F-word-list-22` sentences had
their PATHS corrected here and their CONTENT left alone, which is what step 5
says. They still name `foundWordsDisplayRows.buildDisplayRows` where the call
is `buildWordListRows`. Three closed areas' files (`common-hosts.md`,
`supabase.md`) still name `useWordSubmit` as a live example; they are area
records and were left as written.


- `git mv src/shared/word-hunt src/shared/found-words`. `git mv`
  `bee-games/typedWord.module.css` into it. Then `foundWords.ts` per call 2:
  under (a) or (b), `git mv` it too and cut `FoundWordsGame` back out to
  bee-games (a small `beeGame.ts`, or into `makeFoundWordsGame.ts`, its one
  non-re-export reader); under (c) it does not move. `git mv` keeps each
  file's `cs-` stamp and its `/* @@ */` markers.
- `plans/areas/word-hunt.md` → `plans/areas/found-words.md`, its heading and
  its `F-word-hunt-N` slug pattern with it. NOT OPENED, so nothing is recorded
  in it yet.
- Rename the hook if call 1 says so, and its test with it. Either way its
  docstring's opening line stops saying "the two word-list games (boggle +
  spellingbee)" — it names the four callers and the model (a shipped list + a
  found set), not a genre.
- `foundWords.ts` per call 2; its docstring stops saying "the rank-ladder
  games" and says the family. `foundWordsDisplayRows.test.ts` imports its row
  type from next door (or types its fixture structurally, the way
  `wordListRows.test.ts` already does with a local `Shipped`).
- Every import path — spellingbee and wordwheel (`PlayArea`, `BoardCol`,
  `TypedWord`, `hooks/useGame`, and the `PlayArea.module.css` header comments
  that name the shared sheet), boggle's and wordiply's `PlayArea`,
  `makeFoundWordsGame.ts`'s `./foundWords` if the file splits, and the
  comments in `common/word-list/WordList.tsx:49` and `WordList.module.css:5`.
  There is no `vi.mock` of any moving module (checked), so the codemod trap
  common-folders.md records does not bite here.
- The word itself, in prose. The rule is that `grep -rn word-hunt` over
  `docs/`, `src/` and `plans/` comes back empty except this file and the area
  files that record history — and that covers the phrase "a word-hunt game",
  not just the path. The sites, complete at the re-read: the three moved
  modules' own docstrings (`revealWords.ts:4`, `foundWordsDisplayRows.ts:6,13`,
  `wordListRows.ts:11`), `word-list/doc.md:8,63,100`, `WordList.module.css:5`,
  `WordList.tsx:49`, `boggle/todo.md:74`, `docs/playarea.md:500,504`,
  `docs/common-folders.md:335,353`, `docs/games/spellingbee.md:477,479,639,655`,
  `src/guards/folderDocs.test.ts:85`, `plans/app-audit.md:649`, and the
  `CLAUDE.md` row for this plan. Where the phrase means the family, it says
  "a found-words game"; where it means the genre (strands is one), it is not
  this folder's word to spend and the sentence is recast.
- `doc.md` and `todo.md`: found-words gets a new lede and intro (the family,
  the files, the wordiply exception, the adapter-to-the-panel sentence, and
  the reveal-sizing section the old doc already carries); bee-games' doc loses
  what moved. Both todos are empty today except bee-games' hand-tuned-reserve
  item, which follows the stylesheet's layout half in step 4.
- The guards keyed on paths (predicted breaks, below).
- The docs that cite the folder by path — `common-folders.md`'s family table
  (two rows) and its judgment-call line, `playarea.md`'s link, the four
  `spellingbee.md` sites — and, only if call 1 renames the hook, the docs that
  name it: `features.md:238,242`, `boggle.md`, `spellingbee.md`,
  `wordwheel.md`, `wordiply.md`, `strands.md`, `letterboxed.md`,
  `envelopes.md:111,896`, `playarea.md:324`, and `e2e/spellingbee.e2e.ts`'s
  header. (`docs/supabase.md` names neither the folder nor the hook.)
- `plans/app-audit.md` §3: row 55 `word-hunt` becomes `found-words` with the
  new roster; row 54 `bee-games` names what is left. **Joel's edit to approve,
  since §3 is the plan's order.** Both areas are NOT OPENED, so no blessing
  is disturbed.

### 2. The leaderboard reader goes common

- `readLeaderboard` to common per call 3, as `readLeaderboard<T>(status:
  Record<string, unknown> | null): T[]` with no default. Its docstring keeps
  the defensive-read sentence and loses the "`LeaderboardEntry` is only the
  default" one. `LeaderboardEntry` stays in bee-games — in what is left of
  `foundWordsLeaderboard.ts`, and spellingbee and wordwheel write
  `readLeaderboard<LeaderboardEntry>(status)` at their two sites each.
- **That leftover file takes a bee name here** (call 2's naming ruling): it
  holds one bee-specific row and must stop calling itself found-words. Either
  a `beeLeaderboard.ts` of its own or folded in beside the header in
  `makeBeeGame.ts` — Claude's call at the step, since one short type is on the
  line either way.
- The inline casts become the reader. From the grep: boggle's PlayArea (two
  sites, lines 481 and 561), letterboxed's, setgame's and wordiply's PlayArea
  (one each, a `useMemo` over the cast), and the three manifests (letterboxed,
  setgame, wordiply) that read the same array for the club-page label —
  their `s` is already `Record<string, unknown>`, so the signature fits.
  Scrabble's SQL writes a leaderboard that its FE does not read, so no site
  there; `wordiply/pdf/model.ts` takes the array as a prop, so not a site
  either.
- Every converted site keeps its own `LeaderRow` type; the reader adds the
  guard and removes the cast, nothing else.
- The new file: `git add` and `// cs-unmet` on line 1 (the stamps guard).

### 3. Boggle adopts the family's machinery

The work `boggle/todo.md` → "Adopt the two shared found-words modules"
describes, done here rather than at boggle's area **(Joel)**:

- `lib/displayRows.ts` and its test are deleted (`git rm`); the screen's rows
  (`PlayArea.tsx:546–554`) and the print's (`:309–312`) become one
  `buildWordListRows({ foundWords, requiredWords: game.required_words,
  bonusWords: game.bonus_words, hasBonus: hasBonusDifficulty, isTerminal })`
  each, as spellingbee's and wordwheel's are. The `buildRevealWords` import
  goes with them — boggle was its only direct importer, and afterwards every
  game reaches it through the rows call. The two comment blocks above those
  sites that narrate the reveal keep their sentences and lose the function
  name they narrate (`buildDisplayRows` dedups…). The prose that names the
  module follows: `docs/games/boggle.md:520,573,596`, `word-list/doc.md:63`,
  `WordList.tsx:50`, and `boggle/components/PlayArea.test.tsx:12`'s header.
- `TypedWord.tsx` imports the shared stylesheet and wears `.illegal`;
  `.unreachable` and its comment leave `PlayArea.module.css`. The positional
  logic (dim from the first untraceable letter to the end) stays in the
  component, whose docstring already says how it differs from the bee games'.
  The shared sheet's header drops its "shared by spellingbee + wordwheel"
  claim and its account of why their TypedWords differ, keeping one sentence:
  the styling of a rejected letter never differed, the logic that picks the
  letter is each game's. **`PlayArea.test.tsx:423` keys on the class name**
  (`c.className.includes('_unreachable_')`) and moves to `_illegal_`.
- `hooks/useGame.ts` per call 2: under (a) it imports `FoundWordRow` and
  `FoundWordsWord` from found-words and deletes its own `FoundWordRow` and
  `BoggleWord` (the `BoggleWord` docstring's "no pangram concept in boggle"
  sentence moves to the header type's comment on `required_words`); under
  (c) it is untouched. `BoggleGame` (the header) stays boggle's either way.
- The two leaderboard casts are step 2's.
- **Not** the factory. **Not** `Stats.tsx` (boggle's three-line cell is its
  own extension of the shared grid; it already imports the grid's stylesheet).
- The todo entry is deleted when this lands, being shipped.

### 4. The stylesheet splits, and boggle composes the shared half

- `foundWordsPlayArea.module.css` splits. `git mv` the file to found-words as
  the family's play-surface scaffolding — `.layout` with its mobile block,
  `.belowBoard`, `.loading` / `.empty` — and cut `.boardCol` (with `--u` and
  `--board-width`) and `.mobileStatus` (at 20rem) into a NEW bee-games sheet,
  the hive-and-wheel geometry. **The bee half takes a bee name** (call 2's
  naming ruling), `beeBoard.module.css` saying it; the family half may keep
  `foundWordsPlayArea.module.css`, which is finally true of it. The moved file keeps its stamp and its markers and its row in the
  vocabularies guard follows its path; the new file lands `cs-unmet`, `git
  add`ed, its two rules' `/* @@ */` markers carried over by hand. Both headers
  are rewritten: the family sheet's says what the three games compose and
  what each sets on `.layout` (the four numbers, the mobile status height per
  call 4); the bee sheet's keeps the `--u` arithmetic and the TINKER note.
- The composition, before and after. Today spellingbee's and wordwheel's
  PlayArea root is `cls(shared.layout, shared.responsiveInfoCol,
  shared.mobileFill, surface.layout, styles.layout)` and their BoardCol wears
  `cls(shared.boardCol, surface.boardCol)`, `surface.mobileStatus`,
  `surface.belowBoard`, with `surface.loading` / `surface.empty` on the two
  early returns. After: `surface` is the family sheet for `.layout`,
  `.belowBoard`, `.loading`, `.empty`, and a second import (`bee`) supplies
  `.boardCol` and `.mobileStatus`. Boggle's root gains `surface.layout`
  between `shared.mobileFill` and `styles.layout`, its BoardCol's slot wrapper
  becomes `surface.belowBoard`, its two early returns take `surface.loading`
  / `surface.empty`, and its own sheet keeps `.boardCol` (`--side`), `.grid`,
  the tiles, and its `.mobileStatus` (sized to `--side` with the two stats
  knobs). Its `.layout` block loses the duplicated declarations and keeps
  only what it sets: `--mobile-status-height: 4.5rem` with the measured-not-
  guessed paragraph that justifies the number, and a one-sentence pointer at
  the family sheet.
- `--mobile-status-height` per call 4: the shared mobile `.layout` reads it;
  spellingbee's and wordwheel's `.layout` each declare `4.25rem`, boggle's
  `4.5rem`.
- `.belowBoard`'s width per call 7.
- `.loading` / `.empty`: boggle takes the shared pair, which changes what its
  loading screen looks like — centered muted text with the shared padding in
  place of its own left-aligned body-ink line. The one visible change in the
  plan that is not a no-op by construction; trivial, and said here so it is
  not found later.
- The hand-tuned `5rem` reserve item moves from bee-games' todo to
  found-words' — and `boggle/todo.md` carries the SAME item today about its
  own sheet, so the two collapse into one family item and boggle's copy is
  deleted with the lines it describes.
- **The headless layout check — and it is an e2e, so it needs Joel's word
  before it runs.** `e2e/board-geometry.e2e.ts` is the tool: `BASELINE=1 npx
  playwright test board-geometry` on the tree before this step seeds
  `e2e/.artifacts/board-geometry.json` (gitignored, and stale from any earlier
  run, so re-seed rather than trust one), and a plain run after asserts every
  box within 0.5px. It measures every game's `.boardCol` and the fork pair's
  board root at the default desktop viewport. It does NOT measure
  `.belowBoard`, the mobile status block, or any phone width — the three
  things this step can move. So either the spec grows a second viewport and
  two more boxes for these three games (a permanent gain; it is already the
  repo's tool for this) or a one-off Playwright script in the scratchpad
  measures them — either way it runs only after asking, and the
  `spellingbee-mobile`, `wordwheel` and `boggle` specs are the ones that would
  show a regression later.

### 5. Close: docs, census, this file

- `common-folders.md`: the family table's three rows say what each folder is
  now; the `@/shared/bee-games/…` example at the top of the file still reads
  true (bee-games survives); the "no such edge today" sentence under *Common
  never imports shared* is already false and becomes true (or is corrected)
  depending on call 2; the judgment-calls list's `revealWords` line takes the
  new path, and gains one line: the found-words family folder is drawn by the
  data model, and `word-list` is the panel and only the panel.
- `docs/features.md` rows that name the hook or the folder.
- Each game doc's word-list and submit lines (spellingbee's has four stale
  sentences already listed at `F-word-list-22`, one of them a pre-reorg path
  for the leaderboard file at `:548`; this plan re-reads them after the moves
  rather than before).
- `src/guards/folderDocs.test.ts`'s `INTROS_OWED`: `shared/word-hunt` becomes
  `shared/found-words` — a rename, not a removal, unless step 1 wrote the
  intro, in which case the row goes.
- Census: moved files keep their stamps (`git mv` moves the header). The
  area rosters that named them (`word-list`'s F-31 for the two files it
  created) follow the file. New files (`readLeaderboard.ts` in common, the bee
  board sheet) land `cs-unmet`. Boggle's converted files per call 6.
- `CLAUDE.md`'s plans table: this plan's row is deleted with the file.
- Delete this file. Its "What the walk found" table is history; its target
  table becomes the folders' docs.

## Predicted test breaks

- `src/guards/folderDocs.test.ts:83–85` — the `INTROS_OWED` list names
  `shared/word-hunt`; a rename without the list edit reads as a folder that
  has an intro it does not have (the list checks the intro, not the file). The
  `common/lib` failures already present — an untracked stray folder holding
  two files and no `doc.md` / `todo.md`, which the guard walks off the
  filesystem — are not this plan's.
- `src/guards/vocabularies.test.ts:288` — the pending row for
  `foundWordsPlayArea.module.css` (`1.5rem`, `.belowBoard`'s margin) is keyed
  by path; it follows the rule to whichever file `.belowBoard` ends up in.
  Boggle's stylesheet is outside that guard's scope (tuned surfaces are
  exempt), so the lines it loses change nothing.
- `src/guards/csStamps.test.ts` — every new file (`readLeaderboard.ts`, the
  bee board sheet) fails "no stamp" once `git add`ed, and is invisible to the
  guard until then.
- `src/guards/commonNeverImportsShared.test.ts` — step 2 trips it if
  `readLeaderboard` keeps a default type from a family. The fix is the
  design (no default), not an exemption.
- `src/guards/docLinks.test.ts` — every `../../shared/word-hunt/doc.md` link
  in `docs/` and the folder docs (`playarea.md:504`, `word-list/doc.md:100`),
  and this plan's own links until it is deleted.
- `tsc -b` — every moved import; under call 2 (a), nothing else (no reader
  treats the flag as required); under (b), boggle's row mapping.
- `boggle/lib/displayRows.test.ts` is deleted with its module; the shared
  merge's spec already covers the same dedup, and `wordListRows.test.ts`
  the composition. `boggle/components/PlayArea.test.tsx` only proves the tree
  mounts, and pins nothing through the old module — but its `:423` keys on
  the `_unreachable_` class-name substring, which step 3 renames.
- `useWordSubmit.test.ts` renames with the hook, if it does.
- e2e: **one spec keys on a class name this plan touches** —
  `e2e/boggle.e2e.ts:150` locates `[class*="belowBoard"]`, and eight specs
  locate `[class*="boardCol"]`. Both names survive (`.belowBoard` keeps its
  name in the family sheet; `.boardCol` stays per game), so nothing breaks,
  but a step that renamed either would. **The suite has not run in full for
  some time; ask before running any of it.** Step 4 is the one step that can
  change what a player sees, and spellingbee-mobile, wordwheel and boggle
  specs are the ones that would show it.

## What this plan does not do

- Give boggle the game factory (the ruling stands).
- Touch strands, letterboxed or stackdown; their entry paths are their own for
  the reasons their PlayAreas state.
- Rename `word-list` or change the panel.
- Merge boggle's `Stats.tsx` into the rank-ladder grid.
- Run the e2e suite, or the board-geometry spec, without asking.
