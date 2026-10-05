# Area: wordiply

**Brand: WordWire.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/wordiply/todo.md`, not here.

**Status: NOT OPENED.**

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The roster

*(agreed with Joel when the area opens — `src/wordiply/`, its two SQL files,
and `docs/games/wordiply.md`. List the files and STOP)*

## Findings

*(`F-wordiply-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/wordiply.md` instead; a note here never stands in for either)*

## The convenience RLS

The policies and views the frontend leans on before the page blobs, listed
before the game converts onto them (plans/seat-view.md → How a game converts,
step 1: "each one is taken over or dropped by name"). Listed 2026-10-04; the
last column is what the conversion will do, filled in as it does it.

| what | mentioned | taken over or dropped |
|---|---|---|
| `events_select`'s mode arm — coop shows every member every row, a player always sees their own, an ended game opens everybody's | `auth.uid()`, `ended_at` | the arm is **dropped** and the policy keeps the member gate alone; **taken over** (2026-10-04) by `makeGameData`'s seat rule: mid-race in compete a rival's rows leave `gd.events` and their `board` is null |
| `games_state` view — the game row, every column (`base`, `max_word_length`, `longest_words`, `legal_words`) | neither | **dropped** (2026-10-04): the page reads `game_data` |
| `games_select` — a club member reads the board row | neither | **kept** (2026-10-04): a member reading a row for a page they can open |
| `_write_statuses` — `game_status` {}, `player_status` {guesses_used, length_score, letter_count, player_ended_reason}, `clubpage_info` {guesses_used, length_score, letter_count, winner_user_id, winner_length_score}; the scores null until the game ends | `ended_at` (the scores wait for it) | **dropped** (2026-10-04): `_rebuild_data_cols` writes the blobs after every move, a reject included |
| the postgres-changes subscription on `events` and `games` (`useRealtimeRefetch` in `hooks/useGame.ts`), and the one-shot read of `games_state` | — | **gone** (2026-10-04): `useGame` is `makeGameData` over `game_data`, with no read and no subscription |

**The status keys the page shows:** the leaderboard's per-player
`guesses_used` (the opponent strip mid-race), `length_score` (the strip at the
end, the verdict) and `won`; `letter_count` (the printout's final scores);
the ending's `reason` and `winner_user_id` (the verdict). The club card
(`manifest.ts` → `summaryFor`) reads `guesses_used`, `length_score`,
`letter_count`, `reason` and the leaderboard's `won` / `length_score` /
`winner_username`, through the pre-common-tables `row.status` /
`row.play_state`.

**A coop solve stamps every teammate:** wordiply has no solve. Coop's fifth
accepted word ends the game `resource_exhausted` / `complete` with every
player ranked 1 (a win); a compete fifth word ends that racer the same way.
Neither writes `solved_at`.

**Seen while listing** (each is fixed by the conversion, not before it,
unless noted):

- **The frontend's RPC calls send the old argument names**: `submit_guess`
  {target_game, word, fe_legal} at both of `PlayArea.tsx`'s call sites. Every
  RPC took `p_` names on 2026-09-28, so no guess lands today.
- **The club card reads `row.status` and `row.play_state`**, the shape before
  common-tables; it moves onto `summary_data` at step 7. Its co-winner branch
  is dead: the earlier-last-word tiebreak always resolves.
- **`todo.md`'s concede bug was already fixed**: `wordiply.concede` locks
  `wordiply.games` before `common._concede`, as `submit_guess` does, so a
  concede and a fifth word serialize. Dropped from the todo at step 14.
- **`todo.md`'s "coop's fifth word is a win" is half done**: the SQL ranks
  every player 1 and the outcome reads `won`; the club card's "Ended (out of
  guesses)" and the coop verdict still say the neutral end. The card and the
  verdict are rewritten at steps 7 and 9.
- **docs/games/wordiply.md §3's events table is stale**: it lists `kind` and
  `length` but not `valid` / `reason`, and calls the table `guesses` in
  places. Step 14.

## The backfill

2026-10-05, the conversion's grown steps applied after the fact:

- **The answers** already had the shape: `lib/answer.ts` says every answer,
  every reader asks it, and the move envelopes carry no outcome.
- **The stylesheet split.** `PlayArea.module.css` held three other
  components' rules, each class with one reader; they moved verbatim to
  `BoardCol`, `StateLine` and `InfoCol`'s own modules, and it keeps `.layout`.
- **The section order**: PlayArea's local-slot header, its narration header
  in the house words; BoardCol in its three sections.
- **No narrower `Outcome`** anywhere.
- **The cross-game names**: both pieces of state carry their comment; "timer"
  / "timeout" not "clock". **Not here: "race" → "player" (N25).** wordiply is
  a score-only contest, not a race game, so its 170-odd "race" / "racer" are
  N25's, which is one sweep across every non-race compete game after the
  backfill (Joel, 2026-10-05).
- **The comment pass and the docstring marker**: history went (the logo's
  retired token, "it read `near` until…", "nothing reads … any more"); a
  Restart reason in `useMarkForeignGuesses` went; member notes are `//`.

## Predicted test breaks

- **Step 4 (2026-10-04), fixed at step 5:** every pgTAP assertion that read
  the statuses now reads the blobs, `game_data_test` pins them, and
  `statuses_test` went; `schema_test` pins `games_state` gone and `rls_test`
  the member read.
- **Steps 4–9 (2026-10-04), fixed at step 9:** the frontend read the old
  shapes (`games_state`, the `events` columns, the common layer's
  `GamePlayer` / `user_id` / `authSession` / `whereIStand`) until the
  PlayArea pass moved every reader onto `gd`; `tsc -b` is clean in the
  folder, `PlayArea.test.tsx` runs on the fixture, and wordiply joined
  `CONVERTED_GAMES` at step 9, as codenamesduet did.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/wordiply.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
