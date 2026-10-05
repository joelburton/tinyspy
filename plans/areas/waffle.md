# Area: waffle

**Brand: SyrupSwap.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/waffle/todo.md`, not here.

**Status: NOT OPENED.**

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The roster

*(agreed with Joel when the area opens — `src/waffle/`, its two SQL files,
and `docs/games/waffle.md`. List the files and STOP)*

## Findings

*(`F-waffle-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/waffle.md` instead; a note here never stands in for either)*

## The convenience RLS

The policies and views the frontend leans on before the page blobs, listed
before the game converts onto them (plans/seat-view.md → How a game converts,
step 1: "each one is taken over or dropped by name"). Listed 2026-10-05; the
last column is what the conversion will do, filled in as it does it.

| what | mentioned | taken over or dropped |
|---|---|---|
| `events_select`'s mode arm — coop shows every member every row, a racer always sees their own, an ended game opens everybody's | `auth.uid()`, `ended_at` | the arm is **dropped** (2026-10-05) and the policy keeps the member gate alone; to be **taken over** by `makeGameData`'s seat rule at step 7 |
| `games_state` view, with `_solution_for` — the game row, the solution in coop always and in compete once ended | `ended_at` | **dropped** (2026-10-05): `game_data` carries the solution once the game ends, in both modes, and the column grant on `solution` stays the real guard |
| `players_state` view, with `_player_board_for`, `_player_colors_for` and `_board_visible` — each player's board and colors, null for a compete rival mid-race | `auth.uid()`, `ended_at` | **dropped** (2026-10-05): the blob carries every board, the seat rule to withhold a rival's mid-race; the column grant on `players.board` stays |
| `games_select`, `players_select` — club-member reads | neither | **kept** (2026-10-05) |
| `_write_statuses` — `game_status` {max_swaps, par_swaps}, `player_status` {swaps_used, player_ended_reason}, `clubpage_info` {swaps_used, max_swaps, band, winner_user_id, winner_swaps_count} | neither | **dropped** (2026-10-05): `_rebuild_data_cols` writes the blobs after every move |
| the postgres-changes subscription on `games`, `players` and `events` (`useRealtimeRefetch` in `hooks/useGame.ts`), and its reads of the two views and `events` | — | the frontend's, at its conversion: the page reads `game_data` |

**The status keys the page shows:** the leaderboard's per-player swaps (the
opponent strip), `winner_user_id` (the compete verdict), `max_swaps` /
`par_swaps` (the state line, read off the game row today). The club card
(`manifest.ts` → `summaryFor`) reads `swaps_used`, `max_swaps`, `band`,
`reason`, `winner_username` and `winner_swaps`, through the pre-common-tables
`row.status` / `row.play_state`.

**A coop solve stamps every teammate:** yes — `submit_swap` sets `solved_at`
on every coop player and ranks them all 1.

**Coop's count is lock-step**, as wordle's was before plans/team-facts.md:
`submit_swap` writes the team's `swaps_used` and board onto every coop
`waffle.players` row. Making a player's count their own needs a data
migration, as wordle's did (`20261002000001_wordle_players_own_counts.sql`).
75 coop games locally, no compete.

**Seen while listing** (each is fixed by the conversion, not before it,
unless noted):

- **The page cannot load today.** `useGame` asks `games_state` for `id, mode,
  scramble` and `players_state` for `solved, solved_at`, none of which those
  views have; and `submit_swap` is called with `target_game` / `pos_a` /
  `pos_b` (in `PlayArea.tsx`, `db.ts`'s comment and the gallery) where it
  takes `p_` names. The page reads the common layer's old shapes too
  (`authSession`, `playState`, `status`).
- **The club card reads `row.status` and `row.play_state`**; it moves onto
  `summary_data` at step 7.
- **`todo.md`'s "does coop still get the solution mid-game?"** is decided at
  step 2: the builder decides when `puzzle.solution` is written.
- **`todo.md`'s "`create_game` accepts a one-player compete game"** is a real
  gap (no `< 2` check for compete). Not part of the conversion; its own fix.
- **`todo.md`'s "collapse the action row"** is the InfoCol pass's, and its
  "act-new-game active before load" goes with step 9, as wordiply's did.

## The `gd` and `summary_data` sketch — approved 2026-10-05

Seat-view step 2. Step 6 moves it into `types.ts` as the shape comment, and
this section goes then.

```
gd:
  …the common part
  puzzle:                                  # frozen at create
    dealtTiles                             # the scramble: [{id, letter}, …], the 21 cells by position
    parSwaps
    solution                               # [{id, letter}, …]; null until the game ends, in both modes
  team: {nSwapsUsed}                       # null in compete
  events: [event, …]                       # every swap; my rows only, mid-race
  stateLineData: {nSwapsUsed, maxSwaps, parSwaps}   # the team's in coop, mine in compete

player:
  …the common player
  maxSwaps                                 # the budget: the same on every player
  nSwapsUsed                               # own, in every mode
  board: {tiles}                           # what this seat sees; null for a rival mid-race

tile:                                      # GTile
  id                                       # the cell's position, as text: '0'…'24', holes left out
  letter
  color                                    # g / y / x

event:
  id
  by
  swaps: [{id, letter}, {id, letter}]      # the two cells, each with the letter it held before the swap
  colors                                   # the board's colors after the swap
  at

summary_data:
  …the common part
  team: {nSwapsUsed}                       # null in compete
  maxSwaps
  band                                     # setup.difficulty
  nWinnerSwaps                             # compete, once won; null in coop
```

The rulings behind it (2026-10-05):

- **The solution arrives when the game ends, in both modes**, wordle's rule.
  Coop had it mid-game only for a history viewer that recolored past boards;
  each swap stores its own colors now.
- **A coop player's count is their own** (plans/team-facts.md): a data
  migration rewrites each coop row from the player's own swaps and renames
  the column `n_swaps_used`, as wordle's did. The board stays lock-step: it
  is one shared board.
- **The board's unit is the tile** (`GTile`): a player picks single tiles.
- **`maxSwaps` is the budget, not the puzzle** (Joel): on every player, as
  wordle's `maxGuesses` is. `parSwaps` is the deal's.
- **An event's swap is `swaps: [tile, tile]`** (Joel), each `{id, letter}`
  with the letter that cell held before the swap; the event's `colors` is the
  whole board's after it. `kind` and `tookTurn` (one value each) leave the
  blob.

## Predicted test breaks

- **Step 4 (2026-10-05), fixed at step 5:** every pgTAP assertion that read
  the statuses or the two views now reads the blobs, `game_data_test` pins
  them, and `statuses_test` went; `solution_hide_test` and `gameplay_test`
  pin coop's solution waiting for the end, by the step-2 ruling.
- **Steps 4–9:** the frontend reads the two views and the old common shapes,
  so the page stays broken until `useGame` reads `game_data` and the PlayArea
  pass moves its readers onto `gd`.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/waffle.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
