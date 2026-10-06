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
