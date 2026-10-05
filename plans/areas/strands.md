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

- `lib/board.ts`'s `Coord` and `Board`, which the importer shares
  (`supabase/scripts/lib/strandsPuzzle.ts`).
- `lib/trace.ts`'s `Trace`, `TraceResult`, `TypeResult`.
- `lib/history.ts`'s `FoundPath`, `HistoryRow`, `HistorySnapshot`, and
  `components/Board.tsx`'s `FoundPath`.

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
