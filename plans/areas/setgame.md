# Area: setgame

**Brand: HareTrigger.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/setgame/todo.md`, not here.

**Status: NOT OPENED.**

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The roster

*(agreed with Joel when the area opens — `src/setgame/`, its two SQL files,
and `docs/games/setgame.md`. List the files and STOP)*

## Findings

*(`F-setgame-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/setgame.md` instead; a note here never stands in for either)*

## The conversion — rulings before step 1

Joel, 2026-10-05, opening the seat-view conversion:

- **The claim's marks are simplified.** A found set wears a RING in the won
  color — not a filled background, which hides the colored symbols — for
  `WORD_ANSWER_MS`, then goes; tiles newly ADDED to the table wear the shared
  yellow attention flash (`useMoveAttention`, `ATTENTION_FLASH_MS`). A tile
  moved or rearranged by the claim (the tail compaction) does not flash; a
  grow's three appended tiles do. The claimer wears the shared in-flight dim
  from the third click until the answer, then the same ring as everyone; the
  `held` mark goes. Everyone holds the found set for the same ring length
  after the claim lands, so the claimer still cannot see replacements early.
  The `--setgame-leaving-bg` / `-arriving-bg` / `-held-veil` colors go, and
  `lib/flash.ts` with them. Built in the Board pass; the ruling moves into
  plans/tile-feedback.md (whose "keep the choreography exactly" it replaces)
  and the game's doc there.
- **Card → Tile, everywhere in code** (Joel: "yes, we should rename card to
  tiles. The only place to keep 'card' is user-facing text, like in help").
  The piece on the board, the deck's contents, the 0–80 value, the libraries,
  the SQL — all "tile"; `Card.tsx` → `Tile.tsx`. Help and other copy a player
  reads keep "card".
- **A `GTile` is `{id, num}`** (Joel: "get rid of tile.card; it'll be
  confusing … `.num` … to be the number of the id"): `id` the string key,
  `num` the same tile as the 0–80 number the set arithmetic works on.

## The sketch (step 2) — answered

Joel, 2026-10-05: the table is a top-level `gd.board: {tiles, tilesById}`;
no `puzzle` key (nothing shows the deck's order) and `nTilesInDeck` sits
top-level; no seat rule — every row and count is public in both modes;
`stateLineData` shows what the page shows today; the builder writes the
summary's `perfectClear` and `winnerIds`; the hint ring is a BoardCol hook,
not a `gd` key.

## Steps 3–8

- **The migration** `20261005000006_setgame_tiles.sql` converts every stored
  tile (the deck, the board, each event's tiles and board) to four digits of
  1..3 with a count check and a shape check, renames `events.cards` →
  `tiles`, `players.sets_found` → `n_sets_found` and `hints_used` →
  `n_hints_used`. Applied locally over 876 games and 19,637 events.
- **The SQL** says "tile" throughout; `_third` works per digit; `create_game`
  shuffles the digit deck; the builders and `_rebuild_data_cols(_for_all)`
  replace `_write_statuses`; `games_state` is dropped and `_deck_size` is no
  longer granted. `submit_set` answers no outcome.
- **pgTAP**: `game_data_test.sql` (22) pins the blobs; `statuses_test.sql` is
  gone; every other file follows the renames and the digit form.
- **The frontend's data**: `types.ts`; `lib/cards.ts` → `lib/tiles.ts` on
  `GTile`; `hint`, `picks`, `history` and `letters` on tiles; `useGame` is
  `makeGameData`; `lib/gameData.fixture.ts`; the manifest's labels read
  `summary_data`; setgame joined `CONVERTED_GAMES` and `gameSummaries`.
- **Left for the passes**: every component, `SetupForm`, `pdf/`, and
  `e2e/helpers/setgame.ts` (still the 0..80 algebra and `games_state`, fixed
  before e2e runs).

## The summary's table count

Joel, 2026-10-05: the club card counts the table's sets in compete too —
`summary_data.nTableSetsFound`, one key in both modes ("a … otherwise, i'll
take your recs"). The old label read stale status keys and printed 0; the
conversion had dropped the count until this.

## The PlayArea pass (step 9)

Joel took the recs. `PlayAreaLoader` (`useGame`) → `PlayArea(gd)`; the
loading, failure and not-found screens and their classes went. The endings
are `lib/gameEndingMessage.ts` / `lib/playerEndingMessage.ts` behind
`useGetGameEndingMessage` / `useGetPlayerEndingMessage`, `buildOver`'s words
kept, the winners every player ranked first. The answers are `lib/answer.ts`'s
`answerMessage` (claim, claim_peer, hint, not_a_set) and `eventToOutcome`;
`ANSWER_OUTCOME` went. A teammate's claim is `useShowTeammateMoves` (free-for-all
coop only, as before); the commands and the menu are `useActionsAndMenu`, whose
New game hides its button mid-game as the siblings' does; the history view is
`useHistoryView`. The printer reads `gd`. The move (picks, the claim, the hint
and its ring, the letter keys) is the BoardCol pass's.

## The BoardCol pass (step 10)

Joel took the recs ("commit and do it"; steps 1–9 are bf52c054d). BoardCol
owns the move: `usePickedTiles` (ids held, the table's tiles handed back, a
rival's claim drops a pick), `useSubmitClaim` (the in-flight ids, derived
against the live table, so a landed claim holds nothing), `useSpendHint` (the
ring from the log, cleared by any claim; the ladder; the third rung claims)
and `useBoardColActions` (the letter key, ⌫, Hint, `canPick`, `pickTile`).
`.boardCol`, `.pillSlot`, `.mobileStatus` and the portrait rule moved
verbatim into `BoardCol.module.css`. `db.ts` regenerated for `p_tiles`.
The letter key's action is `act-pick-by-letter` (Joel, 2026-10-05): "pick"
is the shared verb for putting a tile in the move, and "by letter" tells it
from the cursor's Space (`act-toggle-tile`) and a click (`pickClicked`).

## The Board pass (step 11)

`Card.tsx` → `Tile.tsx` (one tile, its `TileMarks` decided by the board), and
the stripe patterns their own `TileDefs.tsx` (the todo's "two components in
one file" closed). The claim's marks are `hooks/useClaimMarks.ts`, called by
Board: the found set held in a won ring (`shared.verdictWon` + `.found`) for
`WORD_ANSWER_MS` on the table from before the claim, then the dealt tiles in
the shared attention flash — only tiles new to the table; the claimer's
three wear the shared in-flight dim. `lib/flash.ts` and its three theme colors
are gone; the ruling moved into plans/tile-feedback.md and docs/games/setgame.md
(whose three settled Deferred items went). setgame's CSS says "tile"
(`--tile-w`, `--setgame-tile-*`). `e2e/setgame-flash.e2e.ts` asserts the new
marks; its helper calls are step 15's. Not yet seen on screen: the page needs
the InfoCol pass to render.

## The InfoCol pass (step 12)

One action row, every action listed once (Hint, Concede, Stop, the bar,
Restart, New game, Back to club — filled once the game has ended); the line is
the ending that applies to me. Hint is the board column's action, placed here
through `useAction('act-hint')`. `StateLine` (`gd.stateLineData`, its words
unchanged, `withTilesInDeck` false on the phone's bar) replaces `Counts` and
`lib/readouts.ts`; its rules moved verbatim into `StateLine.module.css`, and
the dead `.breakdown` rules went (the cssClasses allowlist is empty).
`LastSet`, `GameEventLog` and `SetupForm` read `gd`'s types; the strip is
`getSetsOrOut`. `PlayArea.test.tsx` is rewritten on the fixture (15 cases,
verified by planting). Three todo items closed: the action row's branches,
`act-new-game` before load, and the doubled `LeaderRow`.

## The naming pass (step 13)

Joel, 2026-10-05: `submit_set` answers `{result: 'claimed'}` — its unread
`terminal` went; `record_hint` and `useSpendHint` keep their names. "race" /
"racer" waits for N25's sweep; the comments' "terminal" and "clock" are step
14's.

## Prose and comments (step 14)

docs/games/setgame.md: the tile and its digits (§1), the page blobs in place of
the statuses and `games_state` (§3), the claim's marks (§5), contention, the
component tree and the answers (§7), the RPCs (§8) and the tests (§10); the
"how it used to work" passages went. seat-view's done line and
component-readability's "What setgame added". The todo: stale names fixed, the
two green rings noted on the hint-ring item, the deck's order under Won't do.
The comment pass over every file: "card" → "tile" outside player copy and
real-world cards, "terminal" → the end, "clock" → timer, the dead `cards-gone`
key, the history passages, and `//` on members.

## Checks (step 15)

`e2e/helpers/setgame.ts` speaks the digit tiles, reads `setgame.games.board`
by `game_id` and claims with `p_game_id` / `p_tiles`; `createSetgameGame`
sends `p_` names; the specs find a tile by `button[data-tile]`, plant boards
by `game_id`, call the RPCs with `p_game_id`, and say "tile". The gallery's
timeout call too. e2e run (Joel: "do both"): 7 of 10 passed first; the three that
plant a board by `psql` drew the stale blob, so the plant now rebuilds it
(`setgame._rebuild_data_cols`), and all ten pass. Seen on screen: the found set's
won ring during the hold, then the yellow on the three new tiles, symbols above it.

## The inventory (step 1)

- **The loader** (`hooks/useGame.ts`) reads `setgame.games_state` (`id,
  club_handle, mode, deck_kind, board, deck_left` — three of which the view
  no longer has: the frontend is stale against the 2026-09-28 common tables),
  `setgame.players` (`sets_found, hints_used`) and `setgame.events` (`kind,
  cards, board_after`), and subscribes to all three through
  `useRealtimeRefetch`. PlayArea reads the old page props (`isTerminal`,
  `status`, `authSession`, `isBoardInteractive`…).
- **The convenience RLS.** No policy or view mentions `auth.uid()` or
  `ended_at`: `games_select`, `players_select` and `events_select` are each a
  club-member gate, in both modes, with no end-of-game unlock — nothing in
  this game is private but the deck's order. `games` is column-granted
  without `deck`; that grant stays. `setgame.games_state` (a
  `security_invoker` view adding `deck_left`) is dropped by name.
- **The status keys** `_write_statuses` writes: `game_status
  {deck_remaining_count}`, `player_status {found_sets_count, hints_count,
  player_ended_reason}`, `clubpage_info {found_sets_count,
  deck_remaining_count, deck_kind, winner_user_ids,
  winner_found_sets_count}`. What the page shows of them: the sets found,
  the deck left and the hints, and compete's winners and their sets. The
  frontend reads none of them by their written names today (`status.sets_found`,
  `status.leaderboard`, `status.reason` — all stale).
- **A coop solve** is the last claim clearing the table: `_finish` ranks every
  player 1 through `common._end_game`, so every teammate is stamped by the one
  ending. There is no per-player solve in either mode.
- **Ties** are ordinary in compete (no speed tiebreak): every tied player is
  ranked 1. `ending.winner` is one of them; the game names all, from
  `finalRanking`, as letterboxed does.
- **e2e:** setgame, setgame-flash, setgame-mobile, setgame-print,
  setgame-turn-order; `createSetgameGame` in `e2e/helpers/fixtures.ts`.

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/setgame.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
