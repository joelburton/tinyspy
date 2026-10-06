# Area: strands

**Brand: PaulPath.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/strands/todo.md`, not here.

**Status: NOT OPENED.**

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The roster

*(agreed with Joel when the area opens — `src/strands/`, its two SQL files,
and `docs/games/strands.md`. List the files and STOP)*

## Findings

*(`F-strands-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

### F-strands-1 · `unread-view` · `club_game_status` has no reader, and its comment says New game is one

Found from the connections area, 2026-09-19, when connections' twin view was
dropped for having no reader (F-connections-6). strands copied the shape, and
the same two things are true of it: **nothing reads it** — not `src/`, not the
schema's own SQL, not its pgTAP — and its comment claims "New game reads it to
advance to the next UNPLAYED date", which `strands.next_puzzle_for_club`
plainly does not: it answers from `strands.puzzles` joined to
`common.game_players`, and never names the view.

The false sentence was fixed on the spot (it also pointed at connections'
deleted view "for the full rationale"), and the comment now says the view is
unread and names this finding. What is left is the decision: *drop it* — a
tombstone `drop view if exists` in the repeatable file, the pattern
`psychicnum.sql` and `letterboxed.sql` already use, which is what connections
did — or *keep it* as a club-history read a future surface might want, with
the comment saying that is the reason.

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/strands.md` instead; a note here never stands in for either)*

## The convenience RLS

The policies and views the frontend leans on before the page blobs, listed
before the game converts onto them (plans/seat-view.md → How a game converts,
step 1: "each one is taken over or dropped by name"). Listed 2026-10-05; the
last column is what the conversion will do, filled in as it does it.

| what | mentioned | taken over or dropped |
|---|---|---|
| `events_select`'s mode arm — coop shows every member every row, a racer always sees their own, an ended game opens everybody's | `auth.uid()`, `ended_at` | the arm is **dropped** (2026-10-05) and the policy keeps the member gate alone; to be **taken over** by `makeGameData`'s seat rule at step 7 |
| `players_state` view, with `_player_state_visible`, `_hint_points_for` and `_active_hint_for` — a rival's hint bar and ringed hint nulled mid-race | `auth.uid()`, `ended_at` | **dropped** (2026-10-05), and the column grant on `players` with it; to be **taken over** by the seat rule at step 7 |
| `games_state` view, with `_solution_for` — the game row, the solution once the game has ended | `ended_at` | **dropped** (2026-10-05): `game_data` carries the words once the game ends, and the column grant on `solution` stays the real guard |
| `games_select`, `players_select` — club-member reads; the column grant on `games.solution` | neither | **kept** (2026-10-05) |
| `_write_statuses` — `game_status` {hint_cost}, `player_status` {found_words_count, hint_points, hints_count, player_ended_reason}, `clubpage_info` {found_words_count, winner_user_id, winner_hints_count} | neither | **dropped** (2026-10-05): `_rebuild_data_cols` writes the blobs after every move |
| the postgres-changes subscription on `events`, `players`, `games` and `common.games` (`useRealtimeRefetch` in `hooks/useGame.ts`), and its reads of `games_state`, `events` and `players_state` | — | **gone** (2026-10-05): `useGame` is `makeGameData` over `game_data`, with no read and no subscription; its seat rule takes over the events arm and `players_state` |

**The status keys the page shows:** none. `PlayArea.tsx` reads no status; the
club card (`manifest.ts` → `coopLabel` / `competeLabel`) reads `words_found`,
`best_hints` and `reason` through the pre-common-tables `row.status` /
`row.play_state`, and `_write_statuses` writes none of those three.

**A coop solve stamps every teammate:** yes — `submit_path` sets `solved_at`
on every coop player and ranks them all 1.

**Coop's counts are not each player's own:** the hint pool —
`hint_points`, `hints_spent`, `active_hint_coords` — is written onto every
coop row in lock-step by `submit_path` and `spend_hint`. Found words have no
column; they are counted off `events`. Who cashed each hint is on its
`events` row.

**Seen while listing** (each is fixed by the conversion, not before it,
unless noted):

- **The page cannot load.** `useGame` asks `games_state` for `id`,
  `club_handle`, `mode` and `clue`, and `players_state` for `solved` /
  `solved_at`, which the view and 20260928000000 renamed or dropped;
  `PlayArea.tsx` calls `submit_path`, `spend_hint`, `next_puzzle_for_club` and
  `create_game` with the old argument names where they take `p_` names, and
  so does `e2e/helpers/fixtures.ts`'s strands `create_game`.
- **The club card's counts are always empty**: it reads keys the statuses
  never wrote (above).
- **F-strands-1 is already resolved**: `supabase/sql/strands.sql` drops
  `club_game_status` and never recreates it.
- **The words are stored in capitals** — `puzzles.board` / `solution`,
  `games.board` / `solution`, `events.word` — where step 10's one-case rule
  wants them lowercase, as codenamesduet's were made (20261004000003).
- **No local strands game is compete** (38 coop), so `game_data_test` will be
  the compete branches' only pin before e2e.

## The rulings behind the shape

The `gd` sketch, approved 2026-10-05 (step 2, Joel: "5. puzzle.title …
otherwise, i'll take your recs"):

- **A tile is `{id, letter, row, col}`**, its id `"r,c"` — the key
  `coordKey` and `_path_key` already spell. The trace, a hint and a found
  word are tile ids in the blob and held as ids; the RPC seam turns them back
  into `[r, c]`.
- **The coop hint pool**: the ringed hint is the board's (`board.hintTiles`,
  the shared board in coop); the bar is `team.hintPoints` in coop and the
  racer's `hintPoints` in compete; `nHintsUsed` is each player's own, counted
  off the log. `hints_spent` becomes `n_hints_used` by a migration that
  rewrites each coop row to that player's own count, with a sum check, and
  `spend_hint` bumps the caller's alone; the bar and the ring stay on every
  coop row in lock-step.
- **The hidden words are one list**, `puzzle.words: [{word, tiles,
  spangram}]`, spangram first, null until the game ends; a seat's found words
  wear the same shape.
- **One case, the data's**: a migration lowercases the board, the solution and
  the event words; the importer lowercases on import.
- **The theme prompt is `puzzle.title`.**
- **`stateLineData: {nFoundWords, nHintsUsed}` and `hintBarData:
  {hintPoints, hintCost}`**, each the team's in coop and mine in compete.
- **A rival mid-race shows `nHintsUsed` alone**: their `nFoundWords`,
  `hintPoints` and `board` are null.
- **`summary_data`** carries the same `team` and `nWinnerHints`.

## The type sweep

Step 6 (2026-10-05): `types.ts` holds the `gd` sketch and every `G` type; the
setup pair (`GSetupValues`, `GSetup`), `GPuzzleAnswer` and `GAnswer` moved
in. The other exports are old shapes that go with their readers, so strands
joins `CONVERTED_GAMES` once they have:

- ~~`lib/board.ts`'s `Coord` and `Board`~~ — at step 11 `Coord` moved in as
  `GCoord`, which the importer reads from `types.ts`, and `Board` stopped
  being exported.
- ~~`lib/trace.ts`'s `Trace`, `TraceResult`, `TypeResult`~~ — gone at step 10.
- ~~`lib/history.ts`'s `FoundPath`, `HistoryRow`, `HistorySnapshot`, and
  `components/Board.tsx`'s `FoundPath`~~ — gone at steps 9 and 11.

Strands joined `CONVERTED_GAMES` at step 11.

## The PlayArea pass

Step 9 (2026-10-05, Joel took the recommendations: "commit and do it"):
`PlayAreaLoader` builds `gd` and draws `PlayArea`, the coordinator, in its
sections — page hooks, the local slot, the turn-history view, the commands,
render; no Narration, since strands narrates nobody's move. Its hooks:
`useActionsAndMenu` (Stop, Concede, Restart, Reveal, New game with the
spent-archive notice, Print, and the menu), `useGetGameEndingMessage` /
`useGetPlayerEndingMessage` over `lib/gameEndingMessage.ts` /
`lib/playerEndingMessage.ts` (`buildOver`'s words), and `useHistoryView`
over `lib/history.ts`, now a fold over `GEvent`s that hands back a `GBoard`.
PlayArea picks `shownBoard` and the reveal's `missedWords`. The move — the
trace, submit, typed letters, the cursor, the ambiguous flash, `act-hint` and
the theme prompt — moved, as it was, into `BoardCol`, which still feeds the
coordinate-based `Board` (`coordOf`, `makeLetterRows`) until the Board pass.
`GAnswer` is the roster of seven answers; `lib/answer.ts` says each as `{
outcome, text }` (`answerMessage`) and reads a row's (`answerOf`,
`eventToOutcome`); `ANSWER_OUTCOME` went. `InfoCol`, `GameEventLog` and the
print model read `gd`; the printer draws the capitals. The board's letters,
the traced word and the log's words take their capitals in CSS.
`PlayArea.test.tsx` builds its blob from the fixture, mocking only `db`; its
loading case went with the loading.

## The BoardCol pass

Step 10 (2026-10-05, Joel took the recommendations: "commit and do it"):
BoardCol is in its three sections — which board is on screen, the pending
move, render. `isInteractive` is computed once and `canPick` beside it adds
the one in-flight guard, the Submit action's own `pending`; the `busy` flag
went, and `act-hint` asks the same `pending`. The trace is `hooks/useTrace.ts`
(`GTrace`): held as tile ids, handed out as tiles, with the teammate's-find
clear derived as before; `lib/trace.ts`'s `clickTile` and `typeLetter` take
and give tiles, and `clearTrace` went with no caller. The ambiguous flash
holds tiles. The board's letters stay live over a past turn, since a click
there is how the board goes back to live. `.echoSlot`, `.echo` and
`.wordEntryRow` moved verbatim to `BoardCol.module.css`. No
`MobileStatusBar`.

## The Board pass

Step 11 (2026-10-05, Joel took the recommendations: "commit and do it"): the
letter is its own piece, `Tile.tsx` with `Tile.module.css` (the tile rules
moved verbatim out of `Board.module.css`, which keeps the board, the drawing
layer and the grid). Board takes tiles — `tiles`, the `GBoard` to show,
`missedWords`, `traceTiles` and `BoardMarks` (`litTileIds`,
`ambiguousTileIds`) — draws the paths, discs and rings in its SVG, and
decides each letter's marks; the tile draws them and hands itself up
(`onPick(tile)`). `data-tile` is the id: `PlayArea.test.tsx` and the strands
e2e specs find tiles by it. The cursor stays `useBoardSelectionCursor` over
the fixed grid, its cell and a tile's id one step apart (`cellOf`,
`tileIdAt`); no `useTileShuffle`. The frontend's coordinates are gone but at
the RPC seam (`coordOf`). `HintBar`'s undefined `styles.hint` went, and its
`cssClasses` pending line with it.

**Left alone, for Joel:** `lib/board.ts` still holds `letterAt`,
`coordKey`, `wordFromPath`, `samePath`, `isValidPath`, `consumedCells` and
`inBounds`, which no source file reads any more — only `board.test.ts`. The
importer reads `adjacent` and the dimensions. Deleting them, with their
tests, was not in the proposal.

## The InfoCol pass

Step 12 (2026-10-05, Joel took the recommendations: "commit and do it"): one
action row, every action listed once in the menu's order — Concede, Stop, the
bar, Reveal, Restart, New game, back-to-club — each answering whether its
BUTTON shows: Reveal and New game once the game has ended, back-to-club
always, filled once it has. The menu's end group took the same order. The
line is the ending that applies to me. The state line is `StateLine`, drawing
`gd.stateLineData` under the theme prompt. Help shows on my move. The strip
reads "out" for any racer who has ended while the race runs on, and the
verdict on their hints at the end. `.clue` and `.solutionWords` moved
verbatim to `InfoCol.module.css` and `.hintsUsed` to `StateLine.module.css`,
so `PlayArea.module.css` holds `.layout` alone. Two new tests, each verified
by planting its bug: back-to-club in every phase, and "out" in the strip.

## The words for the words

2026-10-05, its own slice before the naming pass (Joel: "let's call 'hidden
words' 'puzzle words' … hint word : non-puzzle word; spangram; theme word :
puzzle word, not spangram; puzzle words : theme+[spangram]"). docs/games/strands.md
gained "Naming the words". Every comment, doc line, test description and SQL
fault string that meant all of them now says **puzzle word**; every "valid
(non-theme) word" that meant a word earning a hint point says **hint word**;
the narrow "theme word" stayed where it meant the narrow thing. No identifier
needed to change: `themeWords`, `'theme'`, `'spangram'`, `hint_word` and
`puzzle.words` already meant what the table says. What a player reads was
left alone and listed in `todo.md` for Joel's wording; so was a sampled
statistic in the doc ("33 of 148 sampled theme words"), which is about theme
words in the narrow sense.

## The naming pass

Step 13 (2026-10-05, Joel took the recommendations: "commit and do it"):
"clue" is the puzzle's **title** wherever it meant the theme prompt — the
info column's `.title` class, the comments, and the e2e helper's `title`
key and its readers (`strands.e2e.ts`, `puzzle-pickers.e2e.ts`); Help's
"The clue at the top…" is player copy and waits in `todo.md`. "echo" is the
**entry**: `.entrySlot` and `.entryWord`, and the spec's locator. The
manifest's "locally terminal" is "ends their own race". N25 ("race" →
"player") waits for its one sweep.

The words' names reached the identifiers too (Joel: "i should be able to read
the code and variables and props to understand which category of 'word' is
this"): the blob's `puzzle.puzzleWords`, a seat's `board.foundPuzzleWords`,
`nFoundPuzzleWords` on the player, the team, the state line and the summary;
`GPuzzleWord` / `GPuzzleWordRaw`, `missedPuzzleWords`, InfoCol's and the
print model's `puzzleWords` (they were `solution`), `PrintPuzzleWord`, and the
SQL builders `_make_json_puzzle_words`, `_make_json_found_puzzle_words` and
`_count_found_puzzle_words` (the old names dropped by name). `HintBar` takes
`hintPoints` / `hintCost`. A bare `word` is the word a trace spelled; the doc's
"Naming the words" says so.

## The prose and the comments

Step 14 (2026-10-05, Joel: "commit and continue"): `docs/games/strands.md`
describes the blobs, the answers, the seat rule, the component tree and the
tests as they are, with the reads, the views, the statuses and the "how it
used to work" passages gone; plans/seat-view.md has strands' done line and
plans/component-readability.md "What strands added". The comment pass, every
file including the SQL, the scripts and the tests: dates and attributions out
of comments, past tense about the code rewritten as what is, two CSS comments
moved onto the rules they describe and `.ringLast`'s corrected (a click never
submits), `db.ts` on the blobs, and `//` on single members (`HintBar`'s props,
the importer's `solutions`). No Restart defenses were found.

## BoardCol, decomposed

2026-10-05, after step 14 (Joel: "there a lot in boardcol; it's not as
decomposed as others … i'll take your recs and do it now"): the send is
`useSubmitTrace`, the hint `useSpendHint`, the four commands
`useBoardColActions` (returning `canPick` and the ambiguous tiles), the title
prompt `useShowPuzzleTitle`; `useTrace` stays the buffer. The cursor is
`useTileCursor`, the siblings' hook and shape (`cell`, `pickClicked`) plus
`moveTo`, which only strands needs: a typed letter and Submit move the cursor,
so the column calls it rather than the board, and hands the actions a
`moveCursorTo` that only an action's run calls. BoardCol went from ~370 lines
to under 200.

## The checks and the e2e

Step 15 (2026-10-05, Joel: "commit and run e2e"): `tsc -b`, the strands
vitests, lint, the guards and every strands pgTAP file green after the last
edit. The strands e2e specs, `solved-reveal` and `puzzle-pickers`' strands
cases pass; three needed the conversion's follow-through — `strands-typing`
reads the entry in the data's lowercase (as letterboxed's specs do), and the
shield case watches `game_data.puzzle.puzzleWords` crossing the wire where it
watched `games_state`. `puzzle-pickers`' crosswords case fails on crosswords'
own unconverted helpers, the sweep plans/seat-view.md → When every game has
converted owes.

## What the InfoCol pass changed that a player can see

- **Back-to-club is in the row while I am out of a race**; it was missing.
- **A rival who has solved reads "out"** in the strip mid-race; it read
  "done on N". Their hint count comes back at the end with the verdict.
- **Help hides while a teammate holds the turn** in turn-order coop.
- **The ended row's buttons keep their order** (Reveal, Restart, New game,
  back-to-club); the menu's end group now matches it (it was Restart, New
  game, Reveal).

## What the PlayArea pass changed that a player can see

Each a consequence of reading `gd` rather than a ruling:

- **An ending line wears my outcome, as the server wrote it.** A conceder's
  out-of-race line is `lost` (it was `neutral`); a racer who solved but lost
  on hints reads `near` at the end (it was `lost`).
- **"Game not found." and "Loading…" are gone** with the reads.

## Predicted test breaks

- **Steps 3–4 (2026-10-05), fixed at step 5:** every pgTAP assertion that
  read the statuses, `games_state` or `players_state` now reads the blobs or
  the tables, `game_data_test` pins the blobs, and `statuses_test` went.
  `compete_test`, `conceded_test` and `timeout_test` pin the member gate
  alone: the table and the blob carry a rival's rows, and withholding them
  mid-race is the hook's. The move envelopes carry no outcome, and pgTAP pins
  the nulls. The fixture boards are lowercase.
  `players.hints_spent` is `n_hints_used`, each coop row its player's own
  (20261005000005); the words are lowercase (20261005000004); the importer
  lowercases, and writes the clue to `title` — it had been writing a `clue`
  column the table no longer has.
- **Step 7 (2026-10-05):** the old `useGame`'s shapes went; their readers
  (`PlayArea`, `InfoCol`, `GameEventLog`, `pdf/model.ts` and their tests) fail
  to compile until the component passes move them onto `gd`. The club card
  reads `summary_data`, and its labels read as they did (`npm run
  report:summaries`). `SetupForm` and the manifest send `p_` names, and
  `SetupForm` reads a member's `id`.
- **Step 8 (2026-10-05):** `lib/gameData.fixture.ts` builds the blob from
  facts on setup.psql's board, as the builder would; `hooks/useGame.test.ts`
  pins the links, the counts, the boards and the seat rule (verified by
  planting `maySeeRival` → `true`). The e2e helper's `create_game` sends `p_`
  names and reads the puzzle's `title`; the specs themselves wait for the
  component passes and the asking.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/strands.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
