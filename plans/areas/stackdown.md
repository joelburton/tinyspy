# Area: stackdown

**Brand: StackDown.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/stackdown/todo.md`, not here.

**Status: NOT OPENED.**

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The roster

*(agreed with Joel when the area opens — `src/stackdown/`, its two SQL files,
and `docs/games/stackdown.md`. List the files and STOP)*

## Findings

*(`F-stackdown-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/stackdown.md` instead; a note here never stands in for either)*

## The convenience RLS

The policies and views the frontend leans on before the page blobs, listed
before the game converts onto them (plans/seat-view.md → How a game converts,
step 1: "each one is taken over or dropped by name"). Listed 2026-10-05; the
last column is what the conversion will do, filled in as it does it.

| what | mentioned | taken over or dropped |
|---|---|---|
| `events_select`'s mode arm — coop shows every member every row, a racer always sees their own, an ended game opens everybody's | `auth.uid()`, `ended_at` | the arm is **dropped** (2026-10-05) and the policy keeps the member gate alone; to be **taken over** by `makeGameData`'s seat rule at step 7 |
| `games_state` view, with `_solution_for` — the game row, the six words once the game has ended | `ended_at` | **dropped** (2026-10-05): `game_data` carries the six words once the game ends, and the column grant on `solution` stays the real guard |
| `games_select`, `players_select` — club-member reads | neither | **kept** (2026-10-05) |
| `_write_statuses` — `game_status` {}, `player_status` {found_words_count, hints_count, spoilers_count, player_ended_reason}, `clubpage_info` {found_words_count, band, winner_user_id} | neither | **dropped** (2026-10-05): `_rebuild_data_cols` writes the blobs after every move |
| the postgres-changes subscription on `games`, `players` and `events` (`useRealtimeRefetch` in `hooks/useGame.ts`), and its reads of `games_state`, `players` and `events` | — | **gone** (2026-10-05): `useGame` is `makeGameData` over `game_data`, with no read and no subscription; its seat rule takes over the events arm |

**The status keys the page shows:** none it can still read. `PlayArea.tsx`
reads `status.winner_user_id` and `status.winner_username` (the compete
verdict), and works out the found, hint and spoiler counts from the rows it
reads; the club card (`manifest.ts` → `summaryFor`) reads `found_words_count`,
`required_words_count`, `winner_username` and `reason` through the
pre-common-tables `row.status` / `row.play_state`.

**A coop solve stamps every teammate:** yes — `submit_word` sets `solved_at`
on every coop player and ranks them all 1.

**Coop's counts are already each player's own:** `submit_word` bumps the
caller's `found_count` alone, in both modes. The board is the shared one: a
coop word clears its tiles for everyone, read off every valid `events` row.

**Seen while listing** (each is fixed by the conversion, not before it,
unless noted):

- **The page cannot load.** `useGame` asks `games_state` for `id`,
  `club_handle`, `mode` and `created_at`, and `players` for `solved` /
  `solved_at`, which 20260928000000 renamed or dropped; `PlayArea.tsx` calls
  `submit_word`, `reveal_next_word` and `reveal_next_hint` with `target_game`
  / `tile_ids` where they take `p_` names, and so does the gallery's
  `submit_word`.
- **`todo.md`'s "a compete win writes no `reason`"** is stale: `submit_word`'s
  compete win ends `reached_goal` / `cleared`, as coop's does.
- **`todo.md`'s "act-new-game active before load"** goes with the PlayArea
  pass, and its "collapse the action row" with the InfoCol pass.
- **No local stackdown game is compete** (9 coop), so the compete branches
  have nothing to rebuild from locally; `game_data_test` will be their only
  pin before e2e.

## The rulings behind the shape

The `gd` sketch, approved 2026-10-05 (step 2, Joel: "i'll take your recs"):

- **A seat's board is its remaining tiles**, `board: {tiles}` — the shared
  stack in coop, each racer's own in compete; the page works out which are
  exposed from their places.
- **A hint row's clue is `clue`**, not `word`; `word` is a played word's or a
  spoiler's.
- **Six words is the puzzle's**, `puzzle.nReqdWords`.
- **The team carries all three counts**, `{nFoundWords, nHintsUsed,
  nSpoilersUsed}`, the players' own summed; null in compete.
- **An event's tiles are ids in the blob** (`tileIds`), made `GTile`s by
  `gd` through `tilesById`; `for_word_index` stays out.
- **The solution waits for the end**, and `players.found_count` becomes
  `n_found_words` by a migration.

## The type sweep

Step 6 (2026-10-05): `types.ts` holds the `gd` sketch and every `G` type; the
setup pair (`GSetupValues`, `GSetup`), `GAnswer` and `GWordFlash` moved in, and
`HistorySnapshot` stopped being exported. Five exports are old shapes that go
with their readers, so stackdown joins `CONVERTED_GAMES` once they have:

- ~~`useGame.ts`'s `PlayerRow`, `EventRow`, `StackdownGame`~~ — gone at step 7.
- ~~`lib/history.ts`'s `Submission`~~ — gone at step 9.
- ~~`lib/board.ts`'s `Tile` (a numeric id)~~ — gone at step 9.

Stackdown joined `CONVERTED_GAMES` at step 9.

## The BoardCol pass

Step 10 (2026-10-05): `isInteractive` is computed once, and `canPick` beside it
adds the one in-flight guard, the Submit action's own `pending`; `useWordMove`
keeps no flag of its own. The word is read through its group
(`move.currentWord.tileIds`). My own word's flash holds tile ids, read against
the puzzle's tiles, so nothing changes case in state. No `MobileStatusBar`
(Joel, 2026-10-05: "no, it shouldn't get a mobilestatusbar").

## What the PlayArea pass changed that a player can see

Step 9 (2026-10-05), each a consequence of reading `gd` rather than a ruling:

- **A compete winner gets the confetti too.** It fires on MY `outcome` being
  `won`, as letterboxed's does; it fired on coop's `won` play state alone.
- **The printout leaves the word being built on the board.** The print model
  takes the stack as the blob has it; it took the picked-up tiles off too.
- **A conceder's line wears their outcome** (`lost`), from the player-ending
  message; it was `neutral`.
- **"Watching — not in this game"** is gone with spectating.

## Predicted test breaks

- **Step 4 (2026-10-05), fixed at step 5:** every pgTAP assertion that read
  the statuses or `games_state` now reads the blobs, `game_data_test` pins
  them, and `statuses_test` went. `compete_test` and `rls_test` pin the member
  gate alone: the blob and the table carry a rival's rows, and withholding
  them mid-race is the hook's. `players.found_count` is `n_found_words`
  (20261005000003).
- **Step 7 (2026-10-05):** the old `useGame`'s shapes went; their readers
  (`PlayArea`, `GameEventLog`, `InfoCol`, `pdf/model.ts`) fail to compile
  until the component passes move them onto `gd`. The club card reads
  `summary_data`, and its labels read as they did (`npm run
  report:summaries`). The word being built moved, as it was, into
  `hooks/useCurrentWord.ts`; the two things the old read did to it on every
  refetch — dropping the optimistic hold on tiles the server has confirmed,
  and emptying a word a teammate's clear has taken a tile from — are owed to
  the PlayArea pass, where the hook will be handed the cleared tiles.
- **Step 8 (2026-10-05):** `lib/gameData.fixture.ts` builds the blob from
  facts on setup.psql's stack, as the builder would; `hooks/useGame.test.ts`
  pins the links, the counts, the stacks and the seat rule.
- **Step 9 (2026-10-05):** every reader is on `gd`, and stackdown has no type
  errors; its vitests run on the fixture, nothing mocked but `db`. Tile ids are
  the blob's text everywhere in the frontend, and `submit_word` gets them back
  as numbers. The gallery helper sends `p_` names. Not run: the e2e, which
  waits for the asking.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/stackdown.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
