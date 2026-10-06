# bananagrams on the page blobs — the conversion plan

**Status: PROPOSED 2026-10-05, nothing decided.** The seat-view conversion
for bananagrams, which [plans/seat-view.md](seat-view.md) names a problem
child: its exception is decided with Joel before step 1. This file holds the
proposal — the tables, the blobs, the exception — and the numbered questions
at the end. Joel named the two ideas files for it
([DO-NOT-READ-smaller-payload.md](DO-NOT-READ-smaller-payload.md),
[DO-NOT-READ-crosswords.md](DO-NOT-READ-crosswords.md)); what was taken from
them is in [What the ideas files offer](#what-the-ideas-files-offer), and
nothing else cites them.

The steps are seat-view's ([How a game converts — the
steps](seat-view.md#how-a-game-converts--the-steps)); scrabble is the nearest
sibling (a shared bag, private per-player state, a move that writes outside
the builder). What follows is only what bananagrams adds to them.

## Why bananagrams does not fit the shape as written

Every converted game's page is written by a move: an RPC changes the tables
and the builder rewrites the blobs, so the page re-reads and is up to date.
bananagrams' board is not written by a move. It is the page's own scratch
state (drag a tile, type a letter, many times a second), saved back by
`save_player_board` about 0.8 s after the last edit and when the board
unmounts, and the page never reads it back while it runs. Three facts follow:

- **The page owns the board; the server owns the tiles.** `player_boards.board`
  is the FE's, `player_boards.tiles` (everything a player holds, hand and board
  together) is the server's, and the hand is derived as `tiles − board`. A peel
  grows every racer's `tiles` at once without touching anyone's board.
- **A save is not a move.** It changes nothing a rival's page shows unless the
  saver's count of tiles not yet in their main block changed, so today a save
  rewrites the statuses only then.
- **The page reads three things today**: `common.games` (the shell), its own
  `player_boards` row (the board once, `tiles` live, over its own
  subscription), and every `progress` row (the peers' counts, live). At the
  end it reads every board once more for the printout.

Also: compete only, solo allowed, no shared board, no event log, no words
list, and the tiles have no identity — a tile is a letter, and the thing the
player acts on is a cell or a hand slot.

## What the ideas files offer

| idea | for bananagrams |
|---|---|
| A Broadcast nudge instead of row changes (Part 1) | Not this conversion's. After it, a bananagrams move writes `common.games` once (the builder) and a winning peel twice; the cost that is bananagrams' own is the SAVE, below. The nudge is a common change for the day it bites. |
| Split what never changes out of `game_data` (Part 2) | Nothing to split. bananagrams has no puzzle; the setup is a few numbers. |
| One read in flight in `useCommonGame` | Likely wanted, as a common change, once saves rebuild the blobs: six players editing at once can nudge every page several times a second. Measure first with two tabs editing (question 8). |
| My own letters overlaid on `gd`, dropped when a later read lands | bananagrams' whole board is "my own letters", and nobody else ever writes it, so the rule collapses to **seed once, never re-seed** — which is what `useGame` does today. No overlay, no versions. |
| The grid as one compact string, decoded by `makeGameData` | Already the case: a board is one 625-character string, and the engine, the printer and the word scan all work on it. The blob carries it as is. |
| One jsonb per grid rather than rows | Already one text column per board; nothing to change. |

## The exception — proposed

**`gd.me.board` is the server's copy of a thing the page owns, read once.**

- `save_player_board` writes the board and calls `_rebuild_data_cols` every
  time, not only when a count changed. So the blob's copy of every board is
  the board as last saved.
- `usePlayerBoard` seeds its board state from `gd.me.board.letters` once, at
  mount, and owns it after; a re-read never re-seeds. The engine's `board` is
  the live one; `gd.me.board` is the restore copy.
- `useGame` is `makeGameData(blob, auth.user.id)`, pure: no read, no
  subscription of its own. `useProgress` and `usePeerBoards` go — the counts
  and, at the end, every board are in the blob.

This is the whole exception. Everything else is the shape as written.

**What it costs.** A rebuild per save: every player's autosave rewrites
`common.games` and nudges every page on the game and every club-page viewer.
The blob is about 6 KB with six boards (625 bytes a board) and the change
message carries the old and new row, so some 15 KB a save to each subscriber,
and a re-read of the row. A player editing steadily saves about once a second.
That is more traffic than any other game's, and it is what the Broadcast
nudge and the one-read-at-a-time change are for if it is ever felt; neither
is needed to convert.

**Pause and resume.** `PauseBoundary` unmounts the surface and the unmount
save fires without being awaited. On resume the engine seeds from `gd`, which
is up to date once that save's rebuild has been re-read. If the resume beats
the re-read, the engine seeds from the previous save and the later re-read is
ignored: the race docs/games/bananagrams.md accepts today, the same size (one
round trip). The doc's fix — a save answers a version the remount refuses to
go behind — is unchanged by this plan and stays owed.

**The other way (not recommended): the board off the blob mid-race.** The
page reads its own `player_boards` row once (a read of its own, as crosswords
keeps), saves rebuild the blobs only when a count changed, and the blob
carries boards once the game has ended, for the end screen and the printout.
Fewer nudges, but `useGame` is impure, "my board" has two sources depending
on the phase, and `player_boards` keeps a policy the FE leans on. One path
beats fewer messages.

## The tables — proposed

What a new migration (`supabase/migrations/<ts>_bananagrams_page_blobs.sql`,
the name to be settled) and the re-applied `supabase/sql/bananagrams.sql`
change. Every item preserves prod's games; T1 drops only derived rows.

- **T1. `bananagrams.progress` goes.** Its two columns are projections of
  `player_boards` (`unplaced_count` = `length(tiles) − _main_block_size(board)`,
  `placed` = the filled cells) that existed only because `player_boards` was
  owner-only and the strip needed club-readable numbers. The builder computes
  `nUnplacedTiles` per player at build time (`_main_block_size` is about 1 ms
  a board, six boards at most); nothing reads `placed` (peel counts the
  filled cells itself). `_count_unplaced` goes with the table, and the "only
  when the count changed" rule goes with the exception above. Dropping the
  table also takes it out of the Realtime publication.
- **T2. Lowercase throughout** (Joel: capitals only at display; scrabble's
  20261005000007 is the precedent): `bunch_at_setup`, `bunch`, `bag`,
  `player_boards.board` and `player_boards.tiles` lowercased by the migration,
  with a per-game letter-count check that aborts on a mismatch; `_full_bag`
  lowercase; `dump` checks `^[a-z]$`; `_win_blockers` drops its `lower()`.
  On the FE, `onLetter`'s `toUpperCase()` goes (the shared cursor hands over
  lowercase already), `lib/words.ts` stops uppercasing its runs, and the
  capitals go on where a tile or a word is drawn — `text-transform` in the
  arena, the hand card and the drag ghost; by hand in the PDF
  (`boardToGrid` does already).
- **T3. The convenience RLS, by name** (the step-1 inventory, done here):
  - `player_boards_select` — owner-only while `ended_at` is null, the club
    after — is taken over by the seat rule in `makeGameData` (a rival's
    `tiles` and `board` null mid-race). What replaces it is question 4: the
    default club-member gate every other game table has, or no select grant
    at all, since the FE reads the table never.
  - `progress_select` — dropped with T1.
  - The column grant on `bananagrams.games` — `bunch` and `bag` leave it (the
    page counted them; the builder counts them now, as scrabble's `bag`
    left). What stays is question 4's answer applied to `games`.
  - No view, no definer helper: bananagrams has none.
- **T4. `_write_statuses` goes**; `statuses_test.sql` becomes
  `game_data_test.sql`. The three status columns are not written any more.
- **T5. An event log — question 3.** bananagrams logs nothing today, and the
  page's two acknowledgments ("🍌 Peel! You drew 1", "Dumped 1, drew 3") are
  guessed from `tiles` growing plus a `dumpPending` ref, which is why a
  peer's peel shows the peel pill on my screen (the doc's Deferred item). The
  server knows who peeled and who dumped (docs/code-conventions.md: read it if
  the server knows it). A `bananagrams.events` table — `id`, `game_id`,
  `user_id`, `kind` (`peel` / `dump` / `went_out`), `tile` (the letter dumped,
  null otherwise), `n_drawn`, `created_at` — written by `peel` and `dump`,
  carried as `gd.events`, lets the acknowledgment read the newest row ("alice
  peeled — you drew 1" / "Dumped a Q, drew 3") and drops the ref. Past games
  simply have no rows. Additive, and the todo's "let the table choose how
  many a peel and a dump draw" would want the same rows.
- **T6. The publication.** `player_boards` stays in `supabase_realtime` as
  the converted siblings' tables did (no conversion has dropped a table from
  it), unless Joel wants it out in the same migration (question 7). With no
  subscriber, nothing is sent.
- **T7. Nothing else moves.** `bananagrams.games` keeps `hand_size`,
  `word_check`, `dict_2`, `dict_3plus`, `dump_to_bag`, `bunch_at_setup`,
  `bunch`, `bag`; `player_boards` keeps `board`, `tiles`, `updated_at`. The
  endings are already common's (`reached_goal`/`complete` with the peeler
  ranked 1 and `solved_at` stamped; `timeout`; all-conceded; Stop). The title
  (`#3F9A2C`) stays. No `_maybe_finish_compete`: the winning peel ends the
  game itself.

Two todo items this read closes as stale, to be struck in step 14:
`replay_board` and `save_player_board` both lock the game row today
(`select … for update` at the top of each).

## The sketch (step 2) — proposed

Compete only, so `team` is null and nothing is coop's. The names are
proposals; the three with a choice in them are questions 5 and 6.

```
gd:
  the common part
  setupRows
  nBunchTiles                       # the live draw pile's count; its order never leaves the server
  nBagTiles                         # the out-of-play reserve's count
  team: null                        # compete only
  events: [event, …]                # question 3; absent if there is no log
  players: [player, …]
  playersById
  me
  stateLineData: {nTiles, nBunchTiles, nBagTiles}   # "Tiles: You 14 · Bunch 60 · Bag 3"

player:
  the common player
  tiles                             # every letter they hold, hand and board together, as one string; a rival's null mid-race
  nTiles                            # length(tiles); every seat, every time
  nUnplacedTiles                    # tiles not in their board's main block: the strip's number; every seat, every time
  board: {letters}                  # the 625-character grid as last saved, "." empty; mine is read once at mount; a rival's null mid-race

event:                              # question 3
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

What the sketch settles, and why:

- **No `GTile`.** A tile is a letter and the player acts on a cell or a hand
  slot, never on a tile with an identity (seat-view decision 9: a game whose
  player never acts on a single tile has none). The board stays a string in
  `gd`, not scrabble's cells, because nothing draws it from `gd`: the arena
  draws the engine's live string, the printer crops it, the word scan walks
  it, and decoding 625 cells for six players on every read would serve no
  reader.
- **The seat rule**, one named function in `makeGameData`: a rival's `tiles`
  and `board` are null while the game is played; `nTiles` and
  `nUnplacedTiles` show always; at the end every seat shows everything. A
  conceded rival keeps their counts (the strip says "out" from `conceded`).
- **The summary adds one number.** `ending.winner` already names the peeler,
  and the four endings the card draws (`Won by alice`, `Lost (out of time) ·
  nobody finished`, `Lost (all conceded)`, `Ended`) read `ending.reason`;
  `clubpage_info`'s `winner_user_id` has no reader left.
- **`stateLineData`** copies three numbers so the line draws and picks
  nothing (scrabble's precedent).

## The frontend after the conversion

- **`useGame`** is `makeGameData`, memoized on the blob; `useProgress`,
  `usePeerBoards` and the `seeded` ref go; the `tiles` the engine takes is
  `gd.me.tiles`; the print's columns are `gd.players[*].board.letters` (mine
  from the live ref, as today).
- **`usePlayerBoard`** keeps its shape: the engine over the live board, the
  autosave, the unmount save, the cursor and the drag. It seeds from
  `gd.me.board.letters`. `save_player_board`, `peel`, `dump`, `check_board`
  send `p_` names. The peel's and check's answers keep `invalid_cells`.
- **The acknowledgment** reads the newest event's `by` and `kind` (with T5),
  or keeps today's diff of `tiles` (without).
- **The answers** (`lib/answer.ts`, step 9): peel `dealt` / `won` /
  `illegal`, check `clean` / `empty` / `invalid`, dump `dumped` — every
  sentence the game says, as `{outcome, text}`.
- **The components** stay the documented exception — one engine spanning both
  columns, `PlayerBoard` over `BoardArena` and `HandCard` — until step 9's
  numbered proposals say otherwise; whether the views take the roster's
  `BoardCol` / `InfoCol` names is decided there, not here.
- **`manifest.ts`**: `summaryFor` reads `summary_data`; `startGameInClub` and
  the New game call send `p_` names; the `gameSummaries` guard entry takes the
  new shape.
- **Known red going in**, all of it this conversion's: `PlayArea.test.tsx`
  imports a `whereIStand` that no longer exists; the folder's tsc errors;
  `PeersStrip` reads `unplaced` and `solved` off `progress` rows that have had
  neither since 2026-09-28; `stop_game_test.sql` test 9.
- **e2e, left for the sweep after the last game** (seat-view → When every game
  has converted): `createBananagramsGame` sends `target_club` / `setup` /
  `player_user_ids`; `saveBananagramsBoard` sends `target_game`;
  `drainBananagramsPool` filters on `id` where the column is `game_id`, and
  must rebuild the blobs after it empties the bunch; `getBananagramsTiles`
  reads `player_boards` as the member, so it moves to `game_data` or to psql
  under question 4.

## The steps, as bananagrams walks them

1. **Inventory** — this file is it; the area file gets the convenience-RLS
   list (T3) and the status keys (`player_status {unplaced_count,
   player_ended_reason}`, `clubpage_info {bunch_tiles_count, winner_user_id}`,
   `game_status {}`), of which the page shows the counts and nothing of the
   rest.
2. **The sketch** — above, approved by number.
3. **The builders** — `_make_json_players` (joined to `player_boards`, the
   count computed per row), `_make_json_events` (with T5), `_make_json_game_data`,
   `_make_json_summary_data`, `_rebuild_data_cols(id, p_update_status_changed_at)`,
   `_rebuild_data_cols_for_all()`; called from `create_game`, `save_player_board`
   (every save), `peel`, `dump`, `concede`, `stop_game`, `submit_timeout`,
   `replay_board`.
4. **The shape** — the migration (T1, T2, T5, T6 as answered); `_write_statuses`
   and `_count_unplaced` dropped by name; the policies and grants per T3.
5. **pgTAP** — `game_data_test.sql`: a fresh game whole, the blob after a
   save, after a peel, after a dump, the seat rule's inputs (a rival's board
   present in the blob), the summary; the other ten files on the new names.
6. **`types.ts`** — `GGameDataRaw` / `GGameData`, `GPlayerRaw` / `GPlayer`,
   `GStateLineData`, `GEventRaw` / `GEvent` (with T5), the setup pair and
   `BananagramsCheckResult` under `G` names; the folder joins
   `CONVERTED_GAMES` in `src/guards/gameTypes.test.ts`.
7. **`useGame`** — `makeGameData`, the seat rule, the club card on
   `summary_data`.
8. **The fixture** — the raw blob from facts, under `ZTest_` names.
9. – 13. **The component passes** — proposed numbered, no code, one at a time.
14. **Prose** — `docs/games/bananagrams.md` (State, Persistence, Schema, The
    statuses, Realtime + FE rewritten to today), seat-view's done line, the
    todo (the two stale lock items struck; the Deferred pill item closed by
    T5 or kept).
15. **Checks** — `tsc -b`, the vitests, lint, the guards, the game's pgTAP;
    e2e only when Joel says.

## Questions for Joel

1. **The exception.** The board rides the blob, seeded once, every save
   rebuilding (recommended) — or the board off the blob mid-race with a read of
   its own?
2. **`progress` dropped**, the count computed by the builder from
   `player_boards` (T1) — yes or no?
3. **An event log** — `bananagrams.events` with `peel` / `dump` / `went_out`
   rows (T5), or no log and the acknowledgment keeps diffing `tiles`?
4. **`player_boards` and `games` select** — the default club-member gate, or
   no select grant at all now that the FE reads neither table?
5. **The board in the blob** — one string under `board: {letters}` and no
   `GTile` (recommended), or scrabble's cells?
6. **`tiles` in the blob** — one string (`"aetrs"`, what the engine works on;
   recommended), or an array of letters as scrabble's rack is?
7. **The publication** — leave `player_boards` in it as the siblings did, or
   drop it in the same migration?
8. **One read in flight in `useCommonGame`** — measure first with two tabs
   editing (recommended), or make the common change now?
9. **The acknowledgment's words** with a log: "alice peeled — you drew 1" for
   a peer's peel, "🍌 Peel! You drew 1" for mine — or one sentence for both?
