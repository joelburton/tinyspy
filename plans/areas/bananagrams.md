# Area: bananagrams

**Brand: MonkeyGrams.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/bananagrams/todo.md`, not here.

**Status: NOT OPENED.**

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The conversion — rulings before step 1

Joel, 2026-10-05, answering [plans/bananagrams-conversion.md](../bananagrams-conversion.md)'s
questions by number before any code:

- **The board rides the blob, seeded once.** `save_player_board` rebuilds the
  blobs on every save; `usePlayerBoard` seeds its board state from
  `gd.me.board.letters` at mount and owns it after; `useGame` is pure.
- **`bananagrams.progress` is dropped.** The builder computes
  `nUnplacedTiles` from `player_boards` at build time.
- **`bananagrams.events` is built and carried as `gd.events`** (`peel` /
  `dump` / `went_out` rows). The page shows of it only the acknowledgment
  under the board; whether the log is drawn as a list waits on whether it
  fits the info column (Joel: "it's possible we may not show it yet").
- **The acknowledgment says who peeled and nothing about the draw** (Joel:
  "players know how many they get from a peel and there isn't space for
  fluff").
- **`player_boards` and `games` keep the club-member gate**, scrabble's
  shape: the policy for any club member, `board` and `tiles` out of the
  column grant as scrabble's `rack` is (Joel: "we don't care about cheating").
- **The board in the blob is one 625-character string**, no `GTile`; `tiles`
  is one string.
- **`player_boards` stays in the `supabase_realtime` publication**; every
  game's listings are dropped together after the last conversion
  (plans/seat-view.md → When every game has converted).
- **The Broadcast nudge and one-read-in-flight are not this conversion's**;
  both are common changes after the last game converts.
- **"Engine" goes.** The hook `usePlayerBoard` returns the **board editor**
  (`BoardEditor`): my board as it is on screen, the hand derived from it, the
  cursor, the drag, the zoom and the autosave. Nothing is called an engine.

## The inventory (step 1)

- **The loader** (`hooks/useGame.ts`): `useGame` reads my own `player_boards`
  row (`board, tiles`) and subscribes to the table through
  `useRealtimeRefetch`, seeding the board once and keeping `tiles` live;
  `useProgress` reads every `progress` row (`user_id, unplaced, placed,
  solved` — the last two gone since 2026-09-28) and subscribes;
  `usePeerBoards` reads every board once at the end for the printout.
  PlayArea reads the old page props (`authSession`, `isTerminal`,
  `isConceded`, `isLocallyTerminal`, `status`, `players`).
- **The convenience RLS.** `player_boards_select` (owner-only while
  `ended_at` is null, the club after) is taken over by the seat rule in
  `makeGameData` (a rival's `tiles` and `board` null mid-race) and replaced
  by the club-member gate, with `board` and `tiles` out of the column grant.
  `progress_select` goes with its table. `games_select` is a club-member gate
  and stays; `bunch` and `bag` leave its column grant (the page counted them;
  the builder counts them now). No view, no definer helper.
- **The status keys** `_write_statuses` writes: `game_status {}`,
  `player_status {unplaced_count, player_ended_reason}`, `clubpage_info
  {bunch_tiles_count, winner_user_id}`. The page shows each rival's
  `unplaced_count` (`PeersStrip`) and reads the bunch count and the winner by
  stale names (`status.bunch_remaining`, `status.bag_remaining`,
  `status.winner_username`, `status.reason`), so today's info line shows
  "Bunch: —" and the verdict falls through to "someone went out".
- **A coop solve**: none; bananagrams is compete only. The winning peel
  stamps the peeler's `solved_at` and ends the game in the same call.
- **The event log**: none today. The two acknowledgments are guessed from
  `tiles` growing plus a `dumpPending` ref (docs/games/bananagrams.md →
  Deferred: a peer's peel shows the peel pill).
- **Case**: every letter column is uppercase (`_full_bag`, `bunch_at_setup`,
  `bunch`, `bag`, `board`, `tiles`); `dump` uppercases its argument;
  `_win_blockers` lowercases a word to look it up; `onLetter` uppercases the
  shared cursor's lowercase letter.
- **Known red going in**: `PlayArea.test.tsx` imports a `whereIStand` that no
  longer exists; the folder's tsc errors; `PeersStrip` reads `unplaced` and
  `solved` off `progress` rows that have had neither since 2026-09-28;
  `stop_game_test.sql` test 9.
- **e2e:** bananagrams, bananagrams-block, bananagrams-print;
  `createBananagramsGame` (sends `target_club` / `setup` / `player_user_ids`),
  `saveBananagramsBoard` (sends `target_game`), `drainBananagramsPool`
  (filters on `id` where the column is `game_id`; must rebuild the blobs),
  `getBananagramsTiles` (reads `player_boards.tiles` as the member; moves to
  `game_data`). Left for the sweep after the last game.
- **Prod**: not counted this session; prod's last applied migration is
  20260925000001, so the lowercase migration's letter-count check runs over
  whatever bananagrams rows prod holds.

## The sketch (step 2) — answered

Joel, 2026-10-05: the proposal's shape, with the recommended choices.

```
gd:
  the common part
  setupRows
  nBunchTiles                       # the live draw pile's count; its order never leaves the server
  nBagTiles                         # the out-of-play reserve's count
  team: null                        # compete only
  events: [event, …]
  players: [player, …]
  playersById
  me
  stateLineData: {nTiles, nBunchTiles, nBagTiles}   # "Tiles: You 14 · Bunch 60 · Bag 3"

player:
  the common player
  tiles                             # every letter they hold, hand and board together, one lowercase string; a rival's null mid-race
  nTiles                            # length(tiles); every seat, every time
  nUnplacedTiles                    # tiles not in their board's main block: the strip's number; every seat, every time
  board: {letters}                  # the 625-character grid as last saved, "." empty; mine is read once at mount; a rival's null mid-race

event:
  id
  by                                # a player
  kind                              # peel / dump / went_out
  tile                              # the letter dumped; null otherwise
  nDrawn                            # 1 on a dealt peel, 3 on a dump, 0 on going out
  at

summary_data:
  the common part
  nBunchTiles                       # "Playing · 12 tiles in the bunch"
```

## The component passes (steps 9–13)

- **PlayArea (step 9).** `PlayAreaLoader` builds `gd` and holds the desktop-only
  block; the two ending builders in `lib/`, a Stop on the shared neutral
  message; `lib/answer.ts` and `answerOfEvent`; `useShowDrawMessages` reads the
  log's newest row; the menu is Restart · New game, then Print.
- **The board editor (step 10).** `useBoardCursorKeys` says submit, and its
  submit answers `hidden` to a button while the board is inert (shared);
  Peel and Check words likewise, and the JSX guards went; Shuffle stays live
  after the game ends (Joel). The editor splits into `useBoardAutosave`,
  `useBoardZoom`, `useBoardDrag` and `useHandOrder`. Letters stay lowercase
  and the capitals are drawn.
- **The board and its pieces (step 11).** `Board` (was `BoardArena`; "arena"
  went everywhere), `Cell`, one `Tile` for board, hand and ghost, a CSS module
  each. The letter is `60cqmin` plus the borders cqmin measures inside, so
  every letter keeps its old size (Joel, 2026-10-06: "make sure it's now the
  same size it was").
- **InfoCol (step 12).** One action row with Peel left of the bar (Joel,
  2026-10-06: "move peel to the left"); `StateLine`; help on my move alone;
  `PeersStrip`'s `getScoreOrOut` keeps its words, out / done! / the count
  (Joel: "we're here to convert the game, not change what it shows");
  `HandCard` takes `showDumpZone`.
- **The naming pass (step 13).** `peel` answers `dealt` and `won` alone and a
  blocked peel says `invalid`; `check_board` answers `empty` and `clean` alone;
  the timer, not the clock; the club line's docstring reworded.

## Prose and comments (step 14)

docs/games/bananagrams.md rewritten to today: the rules and when a peel is
checked, the board and the derived hand, saving the board, the schema and
grants, the page blobs and the seat rule, the endings, the RPCs and their
answers, the component tree, the answers, setup, print and the tests; the
history passages, the prototype section and the drained Deferred item went.
seat-view's done line and component-readability's "What bananagrams added".
The todo: six bugs and two Soon items the conversion closed, a Maybe for
drawing the log, two rulings under Won't do. The comment pass over every
file: the docstring markers (`usePlayerBoard`'s onto its function, `/**` on
the top-level constants, `//` on the print model's members), "a blocked
peel" where a strict ordinary peel is blocked too, the dangling pointer to a
`player_boards` table comment, and the SQL's "realtime" and "terminal-row".

## The naming of the interactive part (2026-10-06)

Joel, after step 14: `PlayerBoard` and `Board` said nothing about their
difference, "board editor" nothing about its purpose, and the hook
(`usePlayerBoard`) did not match its type (`GBoardEditor`). The component that
holds the editing state and lays out the two columns is `EditingBoard`, its
hook `useEditingBoard`, its type `GEditingBoard` / `GEditingBoardInput`, the
prop `editing`; `Board` stays the grid. `HandCard` is `HandBox`. The split
from `PlayArea` stays, so a drag's per-move re-renders never reach
`PlayArea`'s hooks. The moves are a hook each: `usePeel`, `useDump`,
`useCheckBoard`, the check's RPC out of the editing board.

## The roster

*(agreed with Joel when the area opens — `src/bananagrams/`, its two SQL files,
and `docs/games/bananagrams.md`. List the files and STOP)*

## Findings

*(`F-bananagrams-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/bananagrams.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/bananagrams.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
