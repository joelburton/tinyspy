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
| `events_select`'s mode arm — coop shows every member every row, a racer always sees their own, an ended game opens everybody's | `auth.uid()`, `ended_at` | the arm is **dropped** (2026-10-05) and the policy keeps the member gate alone; **taken over** by `makeGameData`'s seat rule (step 7) |
| `players_state` view, with `_chain_for` — each player's chain, null for a compete rival mid-race | `auth.uid()`, `ended_at` | **dropped** (2026-10-05): the blob carries every chain, the seat rule to withhold a rival's mid-race; the column grant on `chain` stays |
| `_word_count_for`, `_covered_for` — the definer scalars `players_state` reads, so a rival's two counts show while the chain is hidden | neither | **dropped** (2026-10-05) with the view: `_make_json_players` writes a racer's two counts |
| `games_state` view — the game row, and `clean_words` computed on read by a join against `common.words` | neither | **dropped** (2026-10-05): `_make_json_puzzle` writes `uncleanWords` at every rebuild, still read against the live dictionary |
| `games_select`, `players_select` — club-member reads | neither | **kept** (2026-10-05) |
| `_write_statuses` — `game_status` {max_words}, `player_status` {words_used, letters_covered_count, player_ended_reason}, `clubpage_info` {words_used, letters_covered_count, max_words, best_letters_covered_count, winner_user_id, winner_words_count} | neither | **dropped** (2026-10-05): `_rebuild_data_cols` writes the blobs after every move |
| the postgres-changes subscription on `games`, `players` and `events` (`useRealtimeRefetch` in `hooks/useGame.ts`), and its reads of the two views and `events` | — | **gone** (2026-10-05): `useGame` is `makeGameData` over `game_data`, with no read and no subscription; its seat rule takes over the events arm |

**The status keys the page showed** (before the conversion): none it could
still read. `PlayArea.tsx` read `status.leaderboard` (per-player `username`,
`words_used`, `letters_covered`, `won`), `status.winner_id`,
`status.timed_out` and `status.reason`, which `_write_statuses` no longer
wrote; the club card read `row.status` / `row.play_state`.

**A coop solve stamps every teammate:** yes — `submit_word` sets `solved_at`
on every coop player and ranks them all 1.

**Coop's chain is lock-step**: `submit_word`, `undo_word` and `clear_chain`
write the chain onto every coop `letterboxed.players` row. It is one shared
chain, as waffle's coop board is one shared board, so it stays lock-step; its
two counts are the team's (`src/letterboxed/todo.md` → Won't do holds the
conversion's rulings).

**Seen while listing**, each fixed by the conversion:

- **The page could not load.** `useGame` asked `games_state` for columns
  20260928000000 renamed or dropped, and every RPC call — from the page and
  from the e2e helpers — sent pre-`p_` names. All send `p_` names now.
- **The board's word list had three names** (`playable_words`, `legal_words`,
  `words`); it is `words` everywhere (20261005000002).
- **`todo.md`'s "a compete timeout nobody made progress in crowns
  everyone"** was already done: `submit_timeout` ranks nobody when no chain
  covers a letter. `timeout-no-winner` is that outcome's name
  (docs/win-lose.md), not a reason, so the reason pair stays `timeout` /
  `timeout`, as wordiply's. Its "no ending writes a `reason`" was stale.
- **`hints_used` keeps its name**: it counts hints and spoilers together, so
  `n_hints_used` would say less than it holds, and nothing reads it.

## The backfill

2026-10-05, the conversion's grown steps applied after the fact:

- **The answers.** `GAnswer` is the roster of ten answers, mine and a
  teammate's, in the move RPCs' words; `lib/answer.ts` says each as
  `{ outcome, text }` (`answerMessage`) and reads a row's (`peerAnswerOf`,
  `eventToOutcome`), and the pill, a teammate's header line, the content echoed
  into my slot and the log bar all ask it. `ANSWER_OUTCOME` went, and the rung
  pill texts moved in from `lib/hintOrSpoiler.ts` (`hintPrefix` stays there,
  read by the log too). `submit_word`, `undo_word` and `clear_chain` answer `ok`
  with no outcome; pgTAP pins the nulls, `answer.test.ts` the words. Every
  sentence a player sees reads as before. `GEventRaw.kind` is its own union.
- **The stylesheet split.** `PlayArea.module.css` held eight components'
  rules; each class had exactly one reader, so each moved verbatim to its
  reader's module — `BoardCol`, `Board` (the sizing `.board` beside the look
  one), `StateLine`, `InfoCol`, `ChainStrip`, `TypedWord`, `GameEventLog` — and
  `PlayArea.module.css` keeps `.layout` alone.
- **The section order**: PlayArea gained its local-slot and narration
  headers; BoardCol is in its three sections.
- **No narrower `Outcome`** anywhere.
- **The cross-game names**: each piece of state carries its comment; "timer"
  / "timeout" not "clock", in the TypeScript, the SQL and the tests (the
  browser's clock, and "clockwise", stay).
- **The comment pass and the docstring marker**: history went ("an earlier
  version…", "the reasoning that used to…"); a member's note is `//`, in
  `pdf/model.ts`, `lib/solve.ts` and Board's ghost; the SQL stops saying how
  an undo or a clear reads. No Restart defenses were found.
- **The doc**: its answers section is the table of ten.

## Predicted test breaks

- **The summary's winner on a tied timeout:** the statuses named no sole
  winner when two racers tied; `ending.winner` (common's) names the first by
  seat, so a club card names one of the tied winners. Each tied player's
  `outcome` is `won` in `game_data`.
- **Steps 4–9 (2026-10-05), fixed at step 9:** the frontend read the views
  and the old common shapes until the PlayArea pass moved every reader onto
  `gd`; pgTAP read the statuses until step 5 moved it onto the blobs.
  letterboxed joined `CONVERTED_GAMES` at step 9.
- **What a player sees change** (steps 9–12): a coop Stop takes the shared
  neutral message, not "Lost: stopped"; a conceder's line wears the `lost` the
  server wrote; turn-order coop gets the turn flash and bell; Hint and Spoiler
  are gone once the game has ended; the help line shows on my move alone.
- **e2e, edited but not yet run:** the chain strip's words, the typed word
  and the tiles draw their capitals in CSS, so `letterboxed.e2e.ts` and
  `letterboxed-print.e2e.ts` expect the stored lowercase (`/^adg/`, `'g'`),
  and every board locator there and in `tap-targets.e2e.ts` is `[data-tile]`.
- **Deploy:** `letterboxed-build-board` and `supabase/sql/letterboxed.sql`
  ship together — `create_game`'s board key is `words`, and either one alone
  breaks starting a game. Migrations 20261005000001 and 20261005000002, then
  `letterboxed._rebuild_data_cols_for_all()`.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/letterboxed.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
