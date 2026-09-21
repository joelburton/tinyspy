# The found-words family — the plan

**A PLAN, not a description.** Drafted 2026-09-21 from a conversation with
Joel during the `word-list` area; **nothing in it has been built, and no step
starts until Joel says so.** When it ships, the durable parts move into
[docs/common-folders.md](../docs/common-folders.md) and each folder's `doc.md`,
and this file is deleted. Decisions marked **(Joel)** are his and made;
questions under "Open calls" are his and not yet made. Nothing here is
precedent for anything else.

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
| `foundWords.ts` (the types) | bee-games | spellingbee, wordwheel |
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
  half — `.layout`, the mobile block, `.belowBoard` — with the mobile status
  height (4.5rem against 4.25rem) and the width token (`--side` against
  `--board-width`) as the differences. The board half is a square and genuinely
  its own.
- `.unreachable` in that stylesheet is `typedWord.module.css`'s one rule under
  another name: the same declaration, the same token.
- Two inline `status?.leaderboard as LeaderRow[]` casts in its PlayArea are
  the shared reader's whole job.
- Its found-word row and shipped word are the bee types minus `is_pangram`;
  its game header is genuinely different (a board string and a side, not a
  center letter and outer letters).

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
| `foundWords.ts` | bee-games | **found-words** | the row and the word are the family's, with `is_pangram` optional; the header stays per game |
| `typedWord.module.css` | bee-games | **found-words** | boggle duplicates its one rule |
| the layout half of `foundWordsPlayArea.module.css` | bee-games | **found-words** | `.layout`, the mobile block, `.belowBoard` are the same in boggle |
| the board half of that stylesheet | bee-games | **bee-games** | the rectangle-in-units geometry is the hive's and the wheel's |
| `makeFoundWordsGame` | bee-games | **bee-games** | boggle keeps its own hook (the standing ruling, below) |
| `readLeaderboard` | bee-games | **common** | generic over every compete game; five games hand-write its guard |
| `LeaderboardEntry` (the row with `rank_idx`) | bee-games | **rank-ladder** | the rank index is a ladder fact, not a bee fact |
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

## Open calls

1. **The hook's name.** Keep `useWordSubmit` under the new folder, or rename
   it. My recommendation: `useFoundWordSubmit`, which says the folder's word.
   Not `useTrustingCommit` — scrabble and letterboxed are trusting-commit too
   and could never use it, so the trust model is the part that is not
   distinctive.
2. **How boggle's row gets `is_pangram`.** The types are hand-written to match
   each hook's explicit select; boggle's table has no such column. Either
   boggle maps each row to `is_pangram: false` at the read, or the shared type
   makes the field optional and its two readers treat absent as false (the
   panel's own row type already does exactly this with `isPangram?`). My
   recommendation: optional on the shared type, since the shared merge and
   reveal are already generic over "a word that may carry a pangram flag".
3. **Where `readLeaderboard` lives in common.** `game-page/gamePageCtx.ts` is
   the file that documents the `status.leaderboard` convention and hands games
   their status, so `game-page/readLeaderboard.ts` beside it is the obvious
   home. `game-page` is a closed, blessed area; closed is not locked, and a new
   file there lands `cs-unmet` until an area reads it.
4. **The mobile status height.** The shared layout block sets
   `--mobile-status-height: 4.25rem`; boggle's measured value is 4.5rem
   (its three-line stat cells). Either the shared block reads a per-game token
   the game's own stylesheet sets, like the four board-units numbers already
   do, or boggle overrides it in its own `.layout`. Either is one line; the
   token is the pattern the sheet already uses.
5. **bee-games' name.** Its doc calls the name a placeholder. After this plan
   it holds the factory and the hive-and-wheel board geometry. The two games'
   shared trait is a center letter the word must use, so `center-letter` would
   say what they share; keeping `bee-games` costs nothing. Not load-bearing.
6. **Stamps for boggle's converted files.** This work happens outside boggle's
   area, at Joel's word (*"we'll do this during the plan rather than waiting
   for a boggle audit"*), the same way the post-close connections work did.
   Those files carry `cs-unmet` today; whether the plan stamps them for the
   audit or leaves them for boggle's area is Joel's.

## The steps

Each step is one commit-sized unit that leaves the tree green. Order matters:
the rename first so every later import path is written once.

### 1. `word-hunt` becomes `found-words`, and takes the family's files

- `git mv src/shared/word-hunt src/shared/found-words`. `git mv` the two
  bee-games files (`foundWords.ts`, `typedWord.module.css`) into it.
- Rename the hook if call 1 says so; its docstring's opening line names the
  four games and the model (shipped list + found set), not a genre.
- `foundWords.ts`: `is_pangram` per call 2; its docstring stops saying "the
  rank-ladder games" and says the family.
- Every import path: spellingbee and wordwheel (`PlayArea`, `BoardCol`,
  `TypedWord`, `hooks/useGame`, `PlayArea.module.css` comments), boggle,
  wordiply, `common/word-list/WordList.tsx` (a comment) and its `doc.md`
  (a link and a sentence).
- `doc.md` and `todo.md`: found-words gets a new intro (the family, the four
  files, the wordiply exception, the adapter-to-the-panel sentence);
  bee-games' doc loses what moved. Both todos are empty today except
  bee-games' hand-tuned reserve item, which follows the stylesheet's layout
  half in step 4.
- The guards keyed on paths (predicted breaks, below).
- The docs: `common-folders.md`'s family table (two rows), `features.md:238`
  (names the hook), the game docs that cite the folder (`spellingbee.md`,
  `wordwheel.md`, `boggle.md`, `wordiply.md`, `strands.md`, `letterboxed.md`),
  `playarea.md`, `supabase.md`, `envelopes.md`. `grep -rn word-hunt` over
  `docs/`, `src/`, `plans/` must come back empty except this file and the
  area files that record history.
- `plans/app-audit.md` §3: row 55 `word-hunt` becomes `found-words` with the
  new roster; row 54 `bee-games` names what is left. **Joel's edit to approve,
  since §3 is the plan's order.** Both areas are NOT OPENED, so no blessing
  is disturbed.

### 2. The leaderboard reader goes common

- `readLeaderboard` to common per call 3, with no default row type.
  `LeaderboardEntry` to `shared/rank-ladder/` (its `rank_idx` is the ladder's
  position); spellingbee and wordwheel import the row from there and the
  reader from common.
- The inline casts become the reader. From the grep: boggle's PlayArea (two
  sites), letterboxed's, setgame's, wordiply's PlayArea, and the three
  manifests (letterboxed, setgame, wordiply) that read the same array for the
  club-page label. Scrabble's SQL writes a leaderboard that its FE does not
  read, so no site there.
- Every converted site keeps its own `LeaderRow` type; the reader adds the
  guard and removes the cast, nothing else.

### 3. Boggle adopts the family's machinery

The work `boggle/todo.md` → "Adopt the two shared found-words modules"
describes, done here rather than at boggle's area **(Joel)**:

- `lib/displayRows.ts` and its test are deleted; the screen's rows and the
  print's become one `buildWordListRows` call each, as spellingbee's and
  wordwheel's are. `docs/games/boggle.md:520` ("boggle builds its rows via
  `lib/displayRows`") follows.
- `TypedWord.tsx` imports the shared stylesheet's `.illegal`; `.unreachable`
  and its comment leave `PlayArea.module.css`. The positional logic (dim from
  the first untraceable letter to the end) stays in the component, where it
  is.
- `hooks/useGame.ts` takes the family's `FoundWordRow` and `FoundWordsWord`
  per call 2. `BoggleGame` (the header) stays boggle's.
- The two leaderboard casts are step 2's.
- **Not** the factory. **Not** `Stats.tsx` (boggle's three-line cell is its
  own extension of the shared grid; it already imports the grid's stylesheet).
- The todo entry is deleted when this lands, being shipped.

### 4. The stylesheet splits, and boggle composes the shared half

- `foundWordsPlayArea.module.css` splits: `.layout` (with the mobile block),
  `.belowBoard`, `.loading`/`.empty` to `found-words/foundWordsPlayArea.module.css`
  (or a better name — it is the family's play-surface scaffolding); `.boardCol`
  with `--u` and `--board-width`, and `.mobileStatus` at 20rem, stay in
  bee-games as the hive-and-wheel geometry.
- `--mobile-status-height` per call 4.
- Boggle's `PlayArea.tsx` composes the shared `.layout` and `.belowBoard` the
  way spellingbee's does (`cls(shared.layout, …, surface.layout, styles.layout)`);
  its own stylesheet keeps `.boardCol` (`--side`), `.grid`, the tiles, and its
  `.mobileStatus` (sized to `--side` with the two stats knobs). Its `.layout`
  block loses the duplicated lines and its comment shrinks to one sentence and
  a pointer.
- `belowBoard`'s width: the shared rule reads one token. spellingbee sets
  `--board-width`, boggle sets `--side`; one of them renames so the shared
  rule has one name to read. `--board-width` is the more general word.
- bee-games' todo item (the hand-tuned `5rem` reserve) moves with `.layout`
  to found-words' todo — it is now three boards' number, not two.
- Headless layout check on all three games at desktop and phone widths before
  and after (the board size, the below-board row, the mobile status block),
  since this is the step that can move pixels.

### 5. Close: docs, census, this file

- `common-folders.md`: the family table's three rows say what each folder is
  now; the `@/shared/bee-games/…` example at the top of the file still reads
  true or picks another family. The judgment-calls list gets one line: the
  found-words family folder is drawn by the data model, and `word-list` is the
  panel and only the panel.
- `docs/features.md` rows that name the hook or the folder.
- Each game doc's word-list and submit lines (spellingbee's has four stale
  sentences already listed at `F-word-list-22`; this plan re-reads them after
  the moves rather than before).
- Census: moved files keep their stamps (`git mv` moves the header). The
  area rosters that named them (`word-list`'s F-31 for the two files it
  created) follow the file. New files (`readLeaderboard.ts` in common, the
  split stylesheet) land `cs-unmet`. Boggle's converted files per call 6.
- Delete this file. Its "What the walk found" table is history; its target
  table becomes the folders' docs.

## Predicted test breaks

- `src/guards/folderDocs.test.ts:83–85` — the feature-folder list names
  `shared/word-hunt`; a rename without the list edit reads as a folder with no
  `doc.md`. The `common/lib` empty-directory failures already present are not
  this plan's.
- `src/guards/vocabularies.test.ts:288` — the pending row for
  `foundWordsPlayArea.module.css` (`1.5rem`, `.belowBoard`'s margin) is keyed
  by path; it follows the rule to whichever file `.belowBoard` ends up in.
  Boggle's stylesheet has no rows today, so the lines it loses change nothing.
- `src/guards/commonNeverImportsShared.test.ts` — step 2 trips it if
  `readLeaderboard` keeps a default type from `rank-ladder`. The fix is the
  design (no default), not an exemption.
- `src/guards/docLinks.test.ts` — every `../../shared/word-hunt/doc.md` and
  `bee-games/doc.md` link in `docs/` and the folder docs.
- `tsc -b` — every moved import; the boggle hook's row type if call 2 goes
  the optional route and a reader still treats the flag as required.
- `boggle/lib/displayRows.test.ts` is deleted with its module; the shared
  merge's spec already covers the same dedup, and `wordListRows.test.ts`
  the composition. A boggle `PlayArea.test.tsx` case that pins the rows
  through the old module, if any, moves to the shared call.
- `useWordSubmit.test.ts` renames with the hook.
- e2e: nothing keys on a module path or a class name. **The suite has not run
  in full for some time; ask before running any of it.** Step 4 is the one
  step that can change what a player sees, and spellingbee-mobile,
  wordwheel and boggle specs are the ones that would show it.

## What this plan does not do

- Give boggle the game factory (the ruling stands).
- Touch strands, letterboxed or stackdown; their entry paths are their own for
  the reasons their PlayAreas state.
- Rename `word-list` or change the panel.
- Merge boggle's `Stats.tsx` into the rank-ladder grid.
- Run the e2e suite without asking.
