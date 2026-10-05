# Area: letterboxed

**Brand: SnakeBox.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/letterboxed/todo.md`, not here.

**Status: NOT OPENED.**

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The roster

*(agreed with Joel when the area opens — `src/letterboxed/`, its two SQL files,
and `docs/games/letterboxed.md`. List the files and STOP)*

## Findings

*(`F-letterboxed-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/letterboxed.md` instead; a note here never stands in for either)*

## The convenience RLS

The policies and views the frontend leans on before the page blobs, listed
before the game converts onto them (plans/seat-view.md → How a game converts,
step 1: "each one is taken over or dropped by name"). Listed 2026-10-05; the
last column is what the conversion will do, filled in as it does it.

| what | mentioned | taken over or dropped |
|---|---|---|
| `events_select`'s mode arm — coop shows every member every row, a racer always sees their own, an ended game opens everybody's | `auth.uid()`, `ended_at` | |
| `players_state` view, with `_chain_for` — each player's chain, null for a compete rival mid-race | `auth.uid()`, `ended_at` | |
| `_word_count_for`, `_covered_for` — the definer scalars `players_state` reads, so a rival's two counts show while the chain is hidden | neither | |
| `games_state` view — the game row, and `clean_words` computed on read by a join against `common.words` | neither | |
| `games_select`, `players_select` — club-member reads | neither | |
| `_write_statuses` — `game_status` {max_words}, `player_status` {words_used, letters_covered_count, player_ended_reason}, `clubpage_info` {words_used, letters_covered_count, max_words, best_letters_covered_count, winner_user_id, winner_words_count} | neither | |
| the postgres-changes subscription on `games`, `players` and `events` (`useRealtimeRefetch` in `hooks/useGame.ts`), and its reads of the two views and `events` | — | |

**The status keys the page shows:** none of today's. `PlayArea.tsx` reads
`status.leaderboard` (per-player `username`, `words_used`, `letters_covered`,
`won`), `status.winner_id`, `status.timed_out` and `status.reason`, which
`_write_statuses` no longer writes. The club card (`manifest.ts` →
`summaryFor`) reads `letters_covered`, `words_used`, `max_words`,
`timed_out`, `leaderboard`, `winner_username` and `reason` through the
pre-common-tables `row.status` / `row.play_state`.

**A coop solve stamps every teammate:** yes — `submit_word` sets `solved_at`
on every coop player and ranks them all 1.

**Coop's chain is lock-step**: `submit_word`, `undo_word` and `clear_chain`
write the chain onto every coop `letterboxed.players` row. It is one shared
chain, as waffle's coop board is one shared board, so it stays lock-step.
`hints_used` is already each player's own (it counts hints and spoilers
together).

**Seen while listing** (each is fixed by the conversion, not before it,
unless noted):

- **The page cannot load.** `useGame` asks `games_state` for `id`,
  `club_handle`, `mode`, `playable_words` and `created_at`, which
  20260928000000 renamed or dropped; `PlayArea.tsx` calls `submit_word`,
  `undo_word` / `clear_chain` and `log_hint_or_spoiler` with `target_game` /
  `submitted` / `word_shown` / `kind`, where they take `p_` names; the e2e
  fixture calls `create_game` with `target_club` / `setup` /
  `player_user_ids` / `mode` / `board`.
- **The board key and the column disagree:** the edge function sends
  `p_board.playable_words`, stored as `legal_words`.
- **`todo.md`'s "a compete timeout nobody made progress in crowns
  everyone"** is half done: `submit_timeout` ranks nobody when no chain covers
  a letter, but the reason pair is still `timeout` / `timeout`, not
  `timeout-no-winner`.
- **`todo.md`'s "no ending of its own writes a `reason`"** is stale:
  `submit_word` ends `reached_goal` / `solved`, `submit_timeout` `timeout`.
- **`todo.md`'s `LeaderRow` item** goes with the leaderboard reads; its
  "act-new-game active before load" with step 9, and "collapse the action
  row" with the InfoCol pass.

## The `gd` sketch

Approved 2026-10-05 (step 2); moves into `types.ts` at step 6.

- **The word list is two lists in the blob**, `words` (every word the board
  accepts) and `uncleanWords` (the few a hint may not offer, about 5%), so
  the stored blob carries each word once; `makeGameData` makes them
  `gd.puzzle.words: [{word, clean}]`.
- **A tile's id is its letter**: the twelve are distinct by rule.
- **Coop's two chain counts are `team`'s alone**; a coop player carries
  neither, a racer carries their own chain's. The database stores only the
  chain (every coop row holds the shared one); `_make_json_team` and
  `_make_json_players` make the split.
- **Covered letters come from the chain's words**, on the board and in the
  history replay alike.
- **`hints_used` becomes two counts off the events**, `nHintsUsed` and
  `nSpoilersUsed`.

```
gd:
  id
  gametype
  brand
  club: {handle}
  mode
  coop
  compete
  oneBoard
  title
  setup
  setupRows
  puzzle:                                  # frozen at create
    tiles: [tile, …]                       # the box, in side order
    words: [{word, clean}, …]              # the blob's words and uncleanWords, joined by makeGameData
    nParWords
    solution: [wordA, wordB]               # null until the game ends
  team: {nWordsUsed, nCoveredLetters}      # the shared chain's; null in compete
  turns: {holder}
  ending: {reason, detail, by, winner}
  ended
  outcome
  events: [event, …]                       # my rows only, mid-race
  players: [player, …]
  playersById
  me
  stateLineData: {nCoveredLetters, nWordsUsed, maxWords, nParWords}   # the team's in coop, mine in compete

player:
  the common player
  maxWords                                 # the same on every player
  nWordsUsed                               # compete only: this racer's chain
  nCoveredLetters                          # compete only: this racer's chain
  nHintsUsed                               # own
  nSpoilersUsed                            # own
  board: {words}                           # this seat's chain, the shared one in coop; null for a rival mid-race

tile:                                      # GTile
  id                                       # the letter
  letter
  side                                     # 0–3

event:
  id
  by
  kind                                     # word / undo / clear / hint / spoiler
  word                                     # null for a clear
  nCoveredLetters                          # after this event
  tookTurn
  at

summary_data:
  team                                     # as gd's
  maxWords
  band
  nBestCoveredLetters                      # compete's best so far; null in coop
  nWinnerWords                             # null until a racer solves
  nWinnerCoveredLetters                    # compete's winner, on a solve or a timeout
```

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/letterboxed.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
