# Area: boggle

**Brand: MothCubes.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/boggle/todo.md`, not here.

**Status: NOT OPENED.**

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The roster

*(agreed with Joel when the area opens — `src/boggle/`, its two SQL files,
and `docs/games/boggle.md`. List the files and STOP)*

## Findings

*(`F-boggle-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/boggle.md` instead; a note here never stands in for either)*

- **The `games` subscription waits on a write nothing makes** (seen
  2026-10-04, at seat-view step 1). `hooks/useGame.ts` subscribes to
  `boggle.games` for "replay_board's realtime TOUCH", but `replay_board`
  writes no `boggle.games` row: it deletes `found_words` and calls
  `common._reset_game`. The conversion retires both the subscription and the
  comment, since the page will follow `game_data` on `common.games`.

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## The convenience RLS

The policies and views the frontend leans on before the page blobs, listed
before the game converts onto them (plans/seat-view.md → How a game converts,
step 1: "each one is taken over or dropped by name"). Listed 2026-10-04; the
last column is what the conversion will do, filled in as it does it.

| what | mentioned | taken over or dropped |
|---|---|---|
| `found_words_select`'s three arms — coop shows every club member every row, a player always sees their own, an ended game opens everybody's | `auth.uid()`, `ended_at` | to be **taken over** by `makeGameData`'s seat rule over `game_data`; the policy keeps the member gate alone |
| `games_select` — a club member reads the board row | neither | to be kept: a member reading a row for a page they can open |
| `_write_statuses` — `game_status` {required_words_count, required_words_score, bonus_words_count, bonus_words_score}, `player_status` {found_required_words_count, found_required_words_score, found_bonus_words_count, found_bonus_words_score, player_ended_reason}, `clubpage_info` {found_words_count, found_words_score, target_win_percent, top_score, winner_user_id} | `ended_at` (the compete top score waits for it) | to be **dropped**; `_rebuild_data_cols` writes the blobs |
| the postgres-changes subscription on `found_words` and `games` (`useRealtimeRefetch` in `hooks/useGame.ts`), and the one-shot read of the `games` header | — | the frontend's, at its conversion: the page reads `game_data` |

boggle has no view.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/boggle.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
