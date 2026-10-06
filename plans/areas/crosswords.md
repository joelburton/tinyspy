# Area: crosswords

**Brand: CrossPlay.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/crosswords/todo.md`, not here.

**Status: NOT OPENED.**

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The conversion — rulings

Joel, 2026-10-06, answering the conversion proposal (deleted at the close) before and during
the build:

- **No `BoardCol` or `InfoCol`.** The crossplay layout stays.
- **`static_game_data` and the Broadcast nudge come later**, not in this
  conversion; one read in flight waits with them.
- **One jsonb per grid** in `crosswords.grids`; `crosswords.cells` dropped after
  every letter is copied with a count check.
- **The board in the blob is packed and flat**: `fills` one string per cell row
  by row, a penciled letter lowercase ("easy to read when debugging, and will
  keep the json sent small"); the flags and the edge marks as flat cell
  indices; the writers one digit per cell; coop's grid written once, under
  `team.board`. The template is not packed: it is sent once after the static
  split.
- **Fills apart**: `gd.puzzle.cells` is the template; a seat's `board.cells`
  are `GCell`s (`GPuzzleCell` the puzzle's cell, `GCell` a seat's;
  `GPuzzleTemplate` the stored template, `GPuzzle` the template plus the
  solution).
- **Uppercase stays crosswords' case** (todo.md → Won't do).
- **The solution is in the blob**, null until the game ends; `games_state` and
  `_solution_for` dropped.
- **A revision counter**, not timestamps, says when the blob carries my write.
- **The summary counts the filled cells**: "60% filled".
- **A Restart starts every grid exactly as the game started it**, the
  template's saved letters and bars included.
- **The name stays `Grid`.** Player-facing copy never says "commits": it says
  "submits".

## The inventory (step 1)

- **The loader** read `crosswords.games` once (`useGame`) and the caller's
  grid off `crosswords.cells` with its own subscription (`useCells`, a
  per-cell `version` merge); the reveal read `games_state.solution`; teammates'
  cursors, fills and note asks rode one Broadcast room (`usePeerCursors`).
- **The convenience RLS.** `cells_select` (coop for any member, compete your
  own rows until the end) went with its table, taken over by the seat rule in
  `makeGameData`; `games_state` and `_solution_for` were dropped, taken over by
  `puzzle.solution` in the blob. `games_select` (a club-member gate) and
  `puzzles_select` with its column grant (the library picker) stay.
- **The status keys** `_write_statuses` wrote: `game_status {}`,
  `player_status {}`, `clubpage_info {winner_user_id}`. The page read
  `status.winner_username` and `status.reason`, which nothing wrote, so
  compete's timeout verdict never showed.
- **A coop solve** stamps every teammate's `solved_at`; a compete solve the
  solver's.

## The roster

*(agreed with Joel when the area opens — `src/crosswords/`, its two SQL files,
and `docs/games/crosswords.md`. List the files and STOP)*

## Findings

*(`F-crosswords-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

### F-crosswords-1 · `club-nyt-status-does-not-exist` · two references to a view nobody ever wrote

Found from the connections area, 2026-09-19, while checking whether its own
`club_game_status` has a reader (F-connections-6). `crosswords.club_nyt_status`
is named twice and **exists nowhere** — not in `supabase/sql/crosswords.sql`,
not in a migration, not in the local database's view list:

- `supabase/sql/crosswords.sql`, in `create_game`: "what the setup dialog's
  calendar colors by (`club_nyt_status` below)" — there is nothing below, and
  the calendar picker itself went at `53e71cc1` (2026-08-13).
- `supabase/migrations/20260813000002_crosswords_games_puzzle_date.sql`, in the
  `comment on column`: "Read by crosswords.club_nyt_status to color the setup
  calendar." **An applied migration, so it is not edited** — the comment is in
  prod's catalog, and changing it means a new migration that does
  `comment on column` again, or accepting it.

Both sentences also describe `puzzle_date` as a calendar's input when nothing
reads it that way any more. Options at this area's opening: *fix the
`crosswords.sql` comment only* and let the catalog comment stand · *fix both*,
the second through a new migration · *leave both* until `puzzle_date` itself
is re-examined.

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/crosswords.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/crosswords.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
