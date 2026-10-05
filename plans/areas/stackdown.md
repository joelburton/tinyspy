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
| the postgres-changes subscription on `games`, `players` and `events` (`useRealtimeRefetch` in `hooks/useGame.ts`), and its reads of `games_state`, `players` and `events` | — | |

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

## Predicted test breaks

- **Step 4 (2026-10-05), to be fixed at step 5:** every pgTAP assertion that
  reads the statuses or `games_state` — `create_game_test`, `gameplay_test`,
  `reveal_test`, `replay_test` — and the whole of `statuses_test`, which goes;
  `compete_test` and `rls_test` pinned the events mode arm, which is gone.
  `players.found_count` is `n_found_words` (20261005000003); the four tests
  that read it by name follow.
- **Steps 4–9:** the frontend reads `games_state` and the old common shapes
  until the PlayArea pass moves every reader onto `gd`; it could not load
  before this began.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/stackdown.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
