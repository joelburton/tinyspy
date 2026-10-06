# crosswords on the page blobs — the conversion plan

**Status: ANSWERED 2026-10-06; steps 1–2 done, step 3 next.** This is the seat-view
conversion for crosswords, the last game to convert and one of the games
[plans/seat-view.md](seat-view.md) names a problem child. This file holds the
inventory (step 1), the proposed tables and blobs, the sketch (step 2), and
the numbered questions at the end. Joel named the ideas file for it
([DO-NOT-READ-crosswords.md](DO-NOT-READ-crosswords.md)), and its idea is what
this file proposes. Nothing else cites it.

The steps are seat-view's ([How a game converts — the
steps](seat-view.md#how-a-game-converts--the-steps)); scrabble and bananagrams
are the nearest siblings (a board decoded by `makeGameData`; a move written
many times a second). What follows is only what crosswords adds to them.

**Out of scope, by Joel's word (2026-10-06):** `static_game_data` (the
template split out of `game_data` and read once) and the move from the
`common.games` subscription to Broadcast nudges. Both come later. Until then
the template rides in `game_data` and every page re-reads it on every move.
**One read in flight** in `useCommonGame` waits with them, following
bananagrams' ruling (plans/areas/bananagrams.md → The conversion).

**No BoardCol and no InfoCol** (Joel, 2026-10-06). The documented layout
exception stands: the grid, the active-clue bar, the clue lists and the
control strip, with the clue lists and the strip in the info sheet on a
phone. Steps 10 and 12 have no column to work on. The move goes into hooks
under PlayArea, and the clue lists and the strip are PlayArea's leaves.

## Why crosswords does not fit the shape as written

Every converted game's page is written by a move: an RPC changes the tables,
the builder rewrites the blobs, and the page re-reads. crosswords bypasses
that today:

- **The grid is not in `common.games`.** A typed letter updates one
  `crosswords.cells` row and nothing else (except the letter that solves the
  grid). The page subscribes to `crosswords.cells` itself (`useCells`), merges
  each row change by a per-cell `version`, and re-reads the grid only on
  joining and reconnecting.
- **Moves come at typing speed**, one `set_cell` per keystroke, no batching.
- **A letter shows before the server has it.** `useCells.setCell` draws it at
  once and rolls it back if the RPC fails, unless a newer write landed on that
  cell. That rollback is the longest comment in the hook.
- **The flash travels on its own.** A row change does not say who wrote the
  letter, so the typist also sends a Broadcast `fill` (and a reveal sends
  `fills`) for teammates to flash the cell in the typist's color. The letter
  and its flash can arrive one without the other, and a lost row change leaves
  a stale cell until the next reconnect.

## The idea, as proposed

crosswords moves onto the blobs like every other game. Every move rebuilds
`game_data`, the page hears the `common.games` row change and re-reads, and
`makeGameData` hands the surface a fresh `gd`. `useCells`, its subscription
and the per-cell `version` go. What that buys: any later move brings the
whole grid, so a lost nudge heals at the next one, and the flash is read off
the same grid as the letter, so the two cannot disagree.

Three pieces make it work at typing speed:

- **A compact grid in the blob** (question 2). One object per cell with
  readable keys is about 90 bytes a cell, about 33 KB for a 21×21 and eight
  times that for an eight-player race. Parallel arrays bring a grid to 2–3 KB.
- **My own letters overlaid on `gd`** (question 6). A keystroke still shows
  at once. The page keeps my unconfirmed writes in an overlay drawn over `gd`,
  so a read that started before my keystroke cannot briefly undo it. An entry
  leaves the overlay once `gd` is known to be at least as new as my write,
  whatever `gd` shows for that cell: a teammate who overwrites my letter right
  after me is not hidden behind it. A failed write leaves the overlay at once,
  which is today's rollback with nothing to compare.
- **The flash by comparing** (question 3). Each grid carries, in coop, who
  last wrote each cell. On each new `gd` the page compares fills with the
  previous `gd`, and every cell whose fill changed to something non-empty and
  whose writer is not me flashes in the writer's color. A reveal flashes the
  same way; a Restart blanks cells, which does not flash. The `fill` and
  `fills` Broadcast events go. Cursors and `showNotes` stay on Broadcast.

**Every grid write locks the game row first.** Today only the solving letter
locks it. Once each write rebuilds the blob, two writes that build at the same
moment would each read the grid without the other's letter, and the later
`common.games` update would overwrite the earlier one's blob with a grid
missing a letter. Locking `crosswords.games` before the write makes the
builds serialize. Teammates typing at once already serialize on the
`common.games` rewrite, so the lock costs nothing new. It also closes two
items in the todo: the cell RPCs' lock, and the coop solve race (two last
letters typed at once each missing the solve).

**What it costs**, until the Broadcast nudge and the static split land:

- Every keystroke rewrites `common.games` and nudges every page on the game
  and every club page in the club, as a bananagrams save does today.
- Every re-read carries the template, about 15 KB for a 15×15 and more for a
  Sunday, beside the grids. Two people typing make 5–10 reads a second on each
  open page. The generation counter in `useCommonGame` drops stale answers but
  fires every read.
- A teammate sees a letter after one Realtime hop plus one read round trip,
  where today it is one hop. The typist's own letter is still immediate.

Measure on a 21×21 with two tabs typing before step 9 closes. If it bites,
one read in flight is the first fix, then the static split.

## The inventory (step 1)

- **The loader.** `useGame` reads `crosswords.games` once (`mode, puzzle_id,
  meta`, under old column names, so it is broken today). `useCells` reads the
  caller's grid off `crosswords.cells` and subscribes to the table.
  `usePeerCursors` joins the Broadcast room (cursors, `fill`, `fills`,
  `showNotes`, plus Presence). The "Reveal solution" toggle reads
  `games_state.solution` on demand; Download as .ipuz and the answer-key PDF
  call `export_solution`. PlayArea reads the old page props (`authSession`,
  `gameId`, `players`, `isTerminal`, `isConceded`, `isLocallyTerminal`,
  `isBoardInteractive`, `playState`, `status`, `clubHandle`).
- **The convenience RLS:**
  - `cells_select` (coop for any member; compete your own rows until the
    game ends) mentions `auth.uid()` and `ended_at`. It is taken over by the
    seat rule in `makeGameData` (a rival's `board` null mid-race), and goes
    with the table (question 1) or becomes the club-member gate.
  - `games_state` (a `security_invoker` view) and `_solution_for` (its definer
    helper, the solution once `ended_at` is set) are taken over by
    `puzzle.solution` in the blob, null until the end (question 5). Both are
    dropped.
  - `games_select` is a club-member gate and stays, as bananagrams' and
    scrabble's did. `puzzle_content` stays in the column grant; the page stops
    reading it.
  - `puzzles_select` (`using (true)`, the column grant hiding `solution`) and
    `library_for_club` (invoker, leaning on `common.games`' club RLS) back the
    setup form's library picker and are untouched.
- **The status keys** `_write_statuses` writes: `game_status {}`,
  `player_status {}`, `clubpage_info {winner_user_id}`. The page reads
  `status.winner_user_id`, and two keys nothing writes:
  `status.winner_username` and `status.reason`. So the compete loss names its
  winner only through the roster, and compete's "Out of time — no winner"
  never shows (a timeout falls to "Lost: all conceded"). The club card reads
  `winner_user_id`.
- **A coop solve** stamps every teammate's `solved_at` (`_maybe_finish`), and
  a compete solve stamps the solver. Both end `reached_goal` / `solved`.
- **No event log**, and none is proposed. A log of every keystroke would
  dwarf the grid, and nothing on the page draws one.
- **Case.** Every letter is uppercase: `set_cell` uppercases and checks
  `^[A-Z]{1,8}$`, `create_game` uppercases a saved fill, and the parsers, the
  NYT and Guardian conversions and the solution all speak uppercase
  (question 7).
- **Stale todo items**, struck in step 14: `replay_board` does lock the game
  row (`select … for update` at its top), and a compete win does write a
  reason (`_maybe_finish` passes `solved` in both modes).
- **Known red going in:** the folder's 43 tsc errors (old page props, the
  `target_game` / `target_club` / `seen_by` argument names, `Member.user_id`,
  the `games` columns); `PlayArea.test.tsx` imports a `whereIStand` that no
  longer exists; `statuses_test.sql`, which becomes `game_data_test.sql`.
- **e2e:** `crosswords`, `crosswords-mobile`, `scratchpad`. The three
  `create_game` helpers in `e2e/helpers/fixtures.ts` insert into
  `crosswords.puzzles` and call `create_game`; their argument names are
  checked at the end of the conversion, on Joel's word, as bananagrams' were.

## The tables — proposed

What a new migration (`supabase/migrations/<ts>_crosswords_page_blobs.sql`)
and the re-applied `supabase/sql/crosswords.sql` change. Every item keeps
prod's games and every letter in them.

- **T1. Where a grid is stored — question 1.**
  - **One jsonb per grid** (recommended): `crosswords.grids (game_id,
    owner_id, cells jsonb)`, one row per grid (coop's one, owner null;
    compete's one per racer), `unique nulls not distinct (game_id,
    owner_id)`. `cells` is sparse, keyed by place, holding only cells with
    something in them, so a blank grid is `{}`:
    `{"3,7": {"fill": "A", "pencil": true, "writer": "<uuid>"}}`. A write is
    one statement, `set cells = jsonb_set(cells, …)`, never a read into a
    variable and a write back. The migration builds each grid from its
    `cells` rows with `jsonb_object_agg`, checks per game that the count of
    non-empty fills matches, aborts on a mismatch, then drops
    `crosswords.cells`, its policy, its trigger and `_bump_cell_version`.
    Dropping the table also takes it out of the Realtime publication.
    `create_game` inserts one `{}` per grid and stops pre-inserting cells.
    `replay_board` sets every grid to `{}`. `_is_solved` walks the template's
    fillable, non-given cells and looks each up. `set_cell` and `set_mark`
    refuse a place that is not a fillable, non-given template cell
    (`PN467` / `PN472` as today). `check_cells` and `reveal_cells` rebuild
    the asked cells with `jsonb_object_agg`. A new per-cell fact is a key, not
    a column.
  - **Rows, as today:** `crosswords.cells` keeps its rows and gains
    `writer uuid`; `version` and its trigger go. The RPCs barely change, and
    the builder aggregates up to 441 rows per grid into the arrays on every
    move. The table stays in the publication until the after-the-last-game
    trim.
- **T2. The writer**, set by `set_cell` (to the caller, or null when the fill
  is cleared) and `reveal_cells` (to the revealer), cleared by
  `replay_board`. Coop only: in compete the grid's owner is its only writer.
  Past games' cells have no writer, so they do not flash until written again.
- **T3. The convenience RLS, by name:** `cells_select` goes with the table
  under T1's jsonb, or becomes the club-member gate under rows;
  `games_state` and `_solution_for` are dropped (question 5); `games_select`
  stays.
- **T4. `_write_statuses` goes**; the three status columns are not written
  any more. `statuses_test.sql` becomes `game_data_test.sql`.
- **T5. Every grid write locks the game row first** (above): `set_cell`,
  `set_mark`, `check_cells`, `reveal_cells` take `select … for update` on
  `crosswords.games` before touching a grid, then call `_rebuild_data_cols`.
  `set_cell`'s answer keeps `solved`; `version` goes from `set_cell` and
  `set_mark` (question 6 decides what replaces it).
- **T6. Nothing else moves.** `crosswords.games` keeps `puzzle_id`,
  `puzzle_date`, `puzzle_content`, `solution`; `crosswords.puzzles` and the
  library and NYT functions are untouched. `export_solution` and
  `reveal_solved_word` keep their answers. The endings are already common's.

## The sketch (step 2) — proposed

Both modes, so `team` would be coop's, but coop's grid is the only thing the
team shares and it sits on every seat (question 3), so `team` is null in both.
The names are proposals; the choices in them are the questions below.

```
gd:
  the common part
  setupRows
  puzzle:                    # the template as the parsers write it, frozen at create
    id                       # the source's id; the download's filename
    title
    author
    copyright
    note
    width
    height
    clues: {across, down}    # [{number, text}]
    cells                    # the template grid: blocks, numbers, circled, shaded, the givens and their letters
    solution                 # null until the game ends
  team: null
  players
  playersById
  me

player:
  the common player
  board: {cells, cellsById}  # this seat's grid; a rival's null mid-race

cell:                        # GCell: one per fillable, non-given cell, in reading order
  id                         # "r,c"
  row
  col
  fill                       # null when empty
  pencil
  wrong
  revealed
  markRight                  # break / hyphen / null
  markBottom
  writer                     # a player; null in compete and on an empty cell

summary_data:
  the common part
```

The raw board in `game_data`, under question 2's compact arrays:

```
board:                       # coop: once, under team; compete: on each player
  fills                      # flat, row by row, one string per cell; "" empty or a block; lowercase = pencil: ["C", "a", "", "REBUS"]
  wrong                      # flat cell indices (row × width + col): [3, 12]
  revealed                   # flat cell indices
  breaksRight                # flat cell indices
  hyphensRight               # flat cell indices
  breaksBottom               # flat cell indices
  hyphensBottom              # flat cell indices
  writers                    # coop only: one digit per cell, 0 nobody, else the 1-based place in players: "1002"
```

`makeGameData` rearranges all of it: `gd` is unchanged by the encoding, and no
component sees a flat index or a lowercase pencil letter.

Only the board is packed. `puzzle.cells` stays the template as the parsers
write it (Joel, 2026-10-06): once `static_game_data` lands it is sent once,
not per keystroke, so it is kept readable.

What the sketch settles, and why:

- **The template and the fills stay apart.** `puzzle.cells` is what never
  changes (and becomes `static_game_data` later); `board` is a seat's fills.
  `lib/cursor.ts` already walks the template alone, the Grid already joins the
  two per cell, and the PDF and the .ipuz writer already merge them. Decision
  9's "never assemble a tile from parallel lists" is met at the `GCell`: one
  object per cell, the flags on it, built once in `makeGameData`.
- **A `GCell`, not a `GTile`** (question 4). The player acts on a single cell
  (types into it, checks it, reveals it, marks its edge), so it has an
  identity, and the thing is a cell: there is no piece to move. Its id is
  `"r,c"`, strands' form, where `cellKey` writes `"r:c"` today.
- **The seat rule**, one named function in `makeGameData`: a rival's `board`
  is null while the game is played and filled once it has ended. Today's page
  draws one grid at the end too (decision C5), so nothing reads a rival's
  board yet; the blob carries it because the builder writes every seat.
- **No `stateLineData`.** crosswords has no readout: the active-clue bar is
  the clue or the slot's message.
- **The summary adds nothing.** `ending.winner` names the compete solver, and
  the card's endings read `ending.reason`.
- **No `events`.**

## The frontend after the conversion

- **`useGame`** is `makeGameData(blob, auth.user.id)`, memoized on the blob:
  the board decoded into `GCell`s, `cellsById`, the writer indexes resolved
  to players, the seat rule. No read, no subscription.
- **`useCells` goes.** In its place a hook (named in step 9) holds the overlay
  of my unconfirmed fills and marks, draws it over `gd.me.board`, and runs
  `set_cell` and `set_mark` with `p_` names. The rollback becomes "a failed
  write leaves the overlay".
- **The flash** is a hook comparing each `gd.me.board` with the previous one
  (question 3's rule). `usePeerCursors` keeps cursors, `showNotes` and
  Presence; `broadcastFill` and `broadcastFills` go.
- **The solution** is `gd.puzzle.solution`; the reveal toggle reads it, and
  the fetch, its cache and the `shownSolution` workaround go (question 5).
- **The answers** (`lib/answer.ts`, step 9): every sentence the game says, as
  `{ outcome, text }` — the check (`checked` with `wrong_count`, and the
  pencil acknowledgment), the reveal, the refusals a keystroke meets, the
  explainer's `unsolved`.
- **The component passes** (step 9's numbered proposals): PlayArea is hook
  calls and the render, with no columns between it and its leaves; Grid and
  its Cell (step 11); the clue lists, the active-clue bar and the strip as
  PlayArea's leaves; the endings read `gd.me.outcome` and `gd.ending`, which
  fixes compete's never-shown "Out of time — no winner".
- **`manifest.ts`**: `summaryFor` reads `summary_data`; the start and New game
  calls send `p_` names; the `gameSummaries` guard entry takes the new shape.
  The setup form and the pickers take `Member.id` and `p_` names, and nothing
  else.

## The steps, as crosswords walks them

1. **Inventory** — above; it moves into the area file once answered.
2. **The sketch** — above, approved by number.
3. **The builders** — `_make_json_puzzle`, `_make_json_board` (one grid into
   the compact arrays), `_make_json_players`, `_make_json_game_data`,
   `_make_json_summary_data`, `_rebuild_data_cols(id,
   p_update_status_changed_at)`, `_rebuild_data_cols_for_all()`; called from
   `create_game`, every grid write, `concede`, `stop_game`, `submit_timeout`,
   `replay_board`.
4. **The shape** — the migration (T1, T2); `_write_statuses`,
   `games_state` and `_solution_for` dropped by name; the lock (T5).
5. **pgTAP** — `game_data_test.sql`: a fresh game whole in both modes, the
   blob after a fill, a pencil fill, a mark, a check, a reveal, a clear, the
   writer, a rival's board present in the blob, the solution null until the
   end, the summary; the migration's conversion run against seeded rows; the
   other files on the new names.
6. **`types.ts`** — a game-level `types.ts` beside `lib/types.ts`'s template
   types: `GGameDataRaw` / `GGameData`, `GPlayerRaw` / `GPlayer`,
   `GBoardRaw` / `GBoard`, `GCell`, the setup pair under `G` names, and the
   exported types now in hooks and components (`CellState`, `CellsMap`,
   `SetCellAnswer`, `SetMarkAnswer`, `PeerCursor`, `CrosswordsGame`, …) moved
   in or unexported; the folder joins `CONVERTED_GAMES`. Where `lib/types.ts`
   goes (the parsers and the CLI import it) is settled in this step.
7. **`useGame`** — `makeGameData`, the seat rule, the club card.
8. **The fixture** — the raw blob from facts, under `ZTest_` names.
9. – 13. **The component passes** — PlayArea, Grid and its pieces, the leaves,
   the naming pass; proposed numbered, no code, one at a time.
14. **Prose** — `docs/games/crosswords.md` to today, seat-view's done line,
    the readability plan's "what this game added", the todo, the comments.
15. **Checks** — `tsc -b`, the vitests, lint, the guards, the game's pgTAP;
    the measurement above; e2e only when Joel says.

## Questions for Joel

**Answered so far** (Joel, 2026-10-06):

- **2. Compact, and flat.** The raw board is the sketch's block above:
  `fills` one flat array, row by row, which `makeGameData` slices by
  `puzzle.width`; a penciled letter is sent lowercase, so there is no pencil
  list (Joel: it reads easily when debugging, and keeps the JSON small, "a
  real goal for this game since it changes on every keystroke"); the other
  flags are lists of flat cell indices; the edge marks are four such lists,
  one per side and kind; the writers one digit string. The case trick is the
  blob's alone: the stored grid keeps the letter uppercase and a pencil flag,
  so `_matches`, check, reveal and the solve never learn it.
- **3. Coop's grid is written once** — Joel: "we need to make sure the
  payload for the json is as small as reasonable." Proposed: under
  `team.board` in the raw blob; `makeGameData` puts the same object on every
  coop seat's `board`, and `gd.team` stays null.
- **4. Fills apart.** `gd.puzzle.cells` is the static grid as the blob
  carries it; each seat's `board.cells` are `GCell`s holding the fills alone,
  and Grid looks each one up beside its static cell.
- **8. The summary adds how much of the grid is filled** ("Playing · 60%
  filled").

- **7. Uppercase stays crosswords' case**, unlike the games that went
  lowercase. Every edge of this game already uppercases: the .puz and .ipuz
  parsers, the NYT and Guardian conversions, the keyboard and the rebus box,
  `set_cell`'s check, `create_game`'s restored fills, and `writeIpuz` on the
  way out (Download as .ipuz). No migration; and the pencil encoding above
  relies on it.

- **1. One jsonb per grid** in `crosswords.grids`, T1's first option: the
  migration copies every letter out of `crosswords.cells`, checks the count
  per game, and drops the table, its policy, its trigger and `version`.
- **5. The solution is in the blob**: `puzzle.solution`, null until the game
  ends; `games_state` and `_solution_for` are dropped.
- **6. A revision counter**: a number column on `crosswords.games`, raised by
  every rebuild under the game-row lock and written into `game_data`;
  `set_cell` and `set_mark` answer the revision their rebuild wrote, and an
  overlay entry drops once `gd` carries that revision or a later one (at once
  if its RPC fails). It never resets. `useCommonGame` is untouched.

Every question is answered; the sketch is approved with these choices.

1. **Where a grid is stored.** *One jsonb per grid* in `crosswords.grids`,
   `crosswords.cells` dropped after the migration copies every letter
   (recommended, the ideas file's leaning: the lifecycle RPCs get simpler and
   a per-cell fact stops being a schema change) — or *rows, as today*, with a
   `writer` column?
2. **The grid's encoding in the blob.** *Compact arrays* — `fills` per row,
   the flags as lists of places, `writers` as digit strings, about 2–3 KB a
   grid (recommended) — or *one object per cell*, about 33 KB a 21×21 grid?
3. **Coop's grid in the raw blob.** *On every seat*, waffle's way, so
   `makeGameData` has one path for both modes (recommended) — or *once*,
   spread onto every seat by `makeGameData`, saving a copy per extra player?
4. **The cell.** *`GCell`, id `"r,c"`*, the fills only, with the template in
   `puzzle.cells` (recommended) — or *one merged cell* carrying the template's
   facts too (number, circled, shaded, given)?
5. **The solution.** *In the blob* as `puzzle.solution`, null until the end,
   `games_state` and `_solution_for` dropped (recommended, the precedent of
   every game that hides a solution) — or *fetched on demand* through
   `export_solution` when the reveal toggle is pressed?
6. **When an overlay entry drops.** *A game revision*: the builder writes a
   number that every rebuild raises, `set_cell` and `set_mark` answer the
   revision their own rebuild wrote, and an entry drops once `gd` carries that
   revision or a later one (recommended: exact, server-ordered under the lock,
   and no change to `useCommonGame`) — or *the ideas file's clocks*: each
   entry remembers when its RPC answered, `useCommonGame` hands over when the
   read behind each `gd` started, and an entry drops once a read that started
   after its answer has landed?
7. **Case.** *Keep uppercase*, the data's case: the puzzle files, the parsers,
   the NYT and Guardian conversions and the .ipuz writer all speak it, and
   crosswords never touches the word list (recommended) — or *lowercase
   throughout*, as scrabble, strands and bananagrams went, with a migration
   over every template, solution and fill?
8. **The summary.** *The common part alone* (recommended) — or add how much
   of the grid is filled ("Playing · 60% filled"), now that every move
   rewrites `common.games` anyway (the todo's Maybe)?
