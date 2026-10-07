# Area: scrabble

**Brand: RackAttack.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/scrabble/todo.md`, not here.

**Status: NOT OPENED.**

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The roster

*(agreed with Joel when the area opens — `src/scrabble/`, its two SQL files,
and `docs/games/scrabble.md`. List the files and STOP)*

## Findings

*(`F-scrabble-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/scrabble.md` instead; a note here never stands in for either)*

## The conversion — rulings before step 1

Joel, 2026-10-05, opening the seat-view conversion with a database-structure
discussion before any code:

- **A coop player's `score` is their own** (docs/common-schema.md → A
  player's facts): the points from the words they committed, in both modes. `coop_score` goes; the team's
  score is the players' sum plus the leftovers rows.
- **The leftover and going-out rows are written in the conversion**, where the
  deduction happens (`_score_leftovers`), on every ending in both modes: a
  `leftovers` row per rack (negative) and a `went_out` row (positive) for the
  player who went out. A fifth `kind`; the check constraint is a migration.
- **`coop_rack` → `team_rack`**: the blob names the group `team`, and the old
  name said the mode rather than whose it is. It stays on the games row — one
  shared rack is one object, not a count that sums.
- **`ai_level` stays on each bot's row** (Joel: "it's a reasonable future
  feature for each ai player to have a different level").
- **The board column keeps its shape** (a flat 225-array of `{l, b}`): the
  RPC's working state behind the version gate, which both edge functions read
  as the engine's own shape. The builder reshapes on the way out.
- **The board in the blob is one 225-character string**, row-major, `.` for an
  empty cell, a lowercase letter for a tile, an UPPERCASE letter for a blank
  played as that letter. A deliberate exception to the one-case rule: case
  carries a fact, and `makeGameData` is its only reader, decoding each
  character into the letter and the blank flag once. An event's placements
  take the same convention, `"x,y:c"`. (Joel: the square objects "puff up the
  json with so many repeated key names".)
- **A cell is the board's spot, a tile the piece placed on it**
  (docs/naming.md → `cell` vs `tile`; Joel, 2026-10-05, correcting "the square
  is the `GTile`"): `GCell` is `{id "x,y", tile}` (x the column, y the row, as
  the placements already say), `tile` null while empty; `GTile` is `{id,
  letter, blank}`, its id its cell's. `gd.board` is `{cells, cellsById}`, and
  `lib/` takes the cell list — the one array, no second copy of the board.
- **The rack I play from is picked in `BoardCol`** (`gd.team?.rack ??
  gd.me.rack`); no `gd.my…` key, so that rule stays unwritten.
- **The row size is accepted.** A blob at the bag's end measures about 10 KB
  (the log is three quarters of it); no pass-through view (Joel: "people take
  at least a few seconds before making a move").
- The letter values and the premium grid stay frontend constants; SQL mirrors
  the values only for the leftover subtraction.

## The sketch (step 2) — answered

Joel, 2026-10-05: the shape below, as `src/scrabble/types.ts` carries it. The
one departure from the sketch as shown: the summary carries `winnerIds` beside
`winnerScore`, as setgame's does, since a compete tie shares rank 1 and
`ending.winner` names only one of them.

```
gd:
  the common part
  setupRows
  version                                  # the move counter every move sends back
  nBagTiles
  board: {cells, cellsById}                # the one board, shared in both modes; 225 cells
  team: {rack, score, nRackTiles}          # null in compete
  events: [event, …]
  stateLineData: {score, nBagTiles}        # the team's score in coop; null in compete

player:
  the common player
  aiLevel                                  # a bot's strength in this game; null for a person
  score                                    # own, in every mode
  rack                                     # compete: own; a rival's null mid-race; coop: null
  nRackTiles                               # compete; null in coop

cell:                                      # GCell: a spot a tile is placed onto
  id                                       # "x,y"
  tile                                     # null while the cell is empty

tile:                                      # GTile: a tile placed on a cell
  id                                       # its cell's
  letter
  blank

event:
  id, by, kind                             # word / exchange / pass / leftovers / went_out
  placements: [tile, …]                    # a word's; null otherwise
  words, score, nTiles, tookTurn, at

summary_data:
  the common part
  team: {score}                            # null in compete
  nBagTiles
  winnerIds                                # compete; null until a winner
  winnerScore                              # compete; the score the winners share
```

## The inventory (step 1)

- **The loader** (`hooks/useGame.ts`) reads `scrabble.games_state` (`id,
  club_handle, mode, board, version, bag_count, shared_rack, team_score` —
  five of which the view no longer has: the frontend is stale against the
  2026-09-28 common tables), `scrabble.players_state` (`user_id, seat, score,
  rack, rack_count, ai_level`; `seat` went with the same migration) and
  `scrabble.events` (with `seat`, gone too), and subscribes to all three
  through `useRealtimeRefetch`. The coop show-a-move Broadcast
  (`useSharedMove`) is ephemeral and stays beside `gd`. PlayArea reads the old
  page props (`isGameEnded`, `status`, `authSession`, `turnHolderId`…).
- **The convenience RLS.** `scrabble._rack_for` (definer: a rack to its owner,
  or to everyone once `ended_at` is set) and `_rack_count_for`, read through
  the `security_invoker` view `players_state`, are taken over by the seat rule
  in `makeGameData` (a rival's `rack` null mid-race, `nRackTiles` always) and
  dropped by name with the view. `games_state` is dropped by name; the `bag`
  column leaves the grant with it (the page counted it; the builder counts it
  now). `games_select`, `players_select` and `events_select` are club-member
  gates, in both modes, with no end-of-game unlock; they stay, as do the column
  grants without the bands and the rack. The two context RPCs
  (`get_suggest_context`, `get_ai_context`) are definer doors for the edge
  functions and stay.
- **The status keys** `_write_statuses` writes: `game_status
  {bag_tiles_count}`, `player_status {score, rack_tiles_count,
  player_ended_reason}`, `clubpage_info {coop_score, bag_tiles_count,
  winner_user_id, winner_score}`. What the page shows of them: the bag, each
  score and rack count, coop's score, compete's sole winner and their score.
  The frontend reads none by their written names (`status.team_score`,
  `bag_count`, `winner_username`, `reason`, `play_state` — all stale).
- **A coop solve**: none per player in either mode. The bag played out ranks
  every teammate 1 through one `_finish` call; `solved_at` is never written.
- **Ties** in compete share rank 1 (`rank()` over the final score; the
  pre-leftover tiebreak is a todo). The summary names every player ranked
  first; `gd` reads them off `finalRanking`.
- **Leftovers today**: deducted on every ending, logged only on a coop Stop
  (todo's table). The rows become complete in the conversion (the rulings).
- **e2e:** scrabble, scrabble-ai-player, scrabble-mobile, scrabble-print,
  scrabble-show-move, scrabble-suggest; `createScrabbleGame`, `pinScrabbleSeat`
  (reads `seat`, stale) and `setScrabbleRack` in `e2e/helpers/fixtures.ts`.
- **Prod**: two scrabble games, one finished compete game (30 events) and one
  coop game never played; prod's last applied migration is 20260925000001.

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/scrabble.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
