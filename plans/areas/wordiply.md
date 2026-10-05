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
| `events_select`'s mode arm — coop shows every member every row, a player always sees their own, an ended game opens everybody's | `auth.uid()`, `ended_at` | the arm is **dropped** (2026-10-04) and the policy keeps the member gate alone; to be **taken over** by `makeGameData`'s seat rule over `game_data` at step 7 |
| `games_state` view — the game row, every column (`base`, `max_word_length`, `longest_words`, `legal_words`) | neither | **dropped** (2026-10-04): the page reads `game_data` |
| `games_select` — a club member reads the board row | neither | **kept** (2026-10-04): a member reading a row for a page they can open |
| `_write_statuses` — `game_status` {}, `player_status` {guesses_used, length_score, letter_count, player_ended_reason}, `clubpage_info` {guesses_used, length_score, letter_count, winner_user_id, winner_length_score}; the scores null until the game ends | `ended_at` (the scores wait for it) | **dropped** (2026-10-04): `_rebuild_data_cols` writes the blobs after every move, a reject included |
| the postgres-changes subscription on `events` and `games` (`useRealtimeRefetch` in `hooks/useGame.ts`), and the one-shot read of `games_state` | — | the frontend's, at its conversion: the page reads `game_data` |

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
- **`todo.md`'s concede bug looks already fixed**: `wordiply.concede` locks
  `wordiply.games` before `common._concede`. To confirm and drop, not part of
  the conversion.
- **`todo.md`'s "coop's fifth word is a win" is half done**: the SQL ranks
  every player 1 and the outcome reads `won`; the club card's "Ended (out of
  guesses)" and the coop verdict still say the neutral end. The card and the
  verdict are rewritten at steps 7 and 9.
- **docs/games/wordiply.md §3's events table is stale**: it lists `kind` and
  `length` but not `valid` / `reason`, and calls the table `guesses` in
  places. Step 14.

## The `gd` and `summary_data` sketch — approved 2026-10-04

Seat-view step 2. Step 6 moves it into `types.ts` as the shape comment, and
this section goes then.

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
    base
    maxWordLen
    longestWords
    legalWords
  team:                                    # null in compete
    nGuessesUsed
    lengthScore                            # null until the game ends
    nLetters                               # null until the game ends
    longestWordLen                         # null until the game ends
  turns: {holder}
  ending: {reason, detail, by, winner}
  ended
  outcome
  events: [event, …]                       # every submission, rejects included; my rows only, mid-race
  players: [player, …]                     # seat order
  playersById
  me
  stateLineData: {nGuessesUsed, maxGuesses, lengthScore, nLetters, longestWordLen, maxWordLen}
                                           # the team's in coop, mine in compete

player:
  the common player
  maxGuesses                               # 5, the same on every player
  nGuessesUsed                             # own, in every mode
  lengthScore                              # own; null until the game ends
  nLetters                                 # own; null until the game ends
  longestWordLen                           # own; null until the game ends
  board: {words}                           # what this seat sees: the team's words in coop, my own
                                           # in compete; null for a rival mid-race

event:
  id
  by
  word
  valid
  reason                                   # missing_base / too_short / not_a_word; null when valid
  tookTurn
  at

summary_data:
  the common summary
  team: {nGuessesUsed, lengthScore, nLetters}   # null in compete
  maxGuesses
  winnerLengthScore                        # compete, once won; null in coop
```

The rulings behind it (2026-10-04):

- **The board is on the player in both modes, the wordle way** — `board` is
  what this seat sees, so `gd.me.board` is always the board to draw and no
  reader branches on mode to find it. codenamesduet's `team.board` differs
  because Duet is coop only and its tiles carry per-seat facts (each key,
  `guessableBy`, the arrows) that the seat rule resolves; wordiply's coop
  board is the same five words for every seat.
- **The puzzle is frozen at create**: `longestWords` and `maxWordLen` are
  written whole and the page waits to show them; the scores are null until
  the game ends, as the statuses wrote them.
- **`len` is a permitted abbreviation** (docs/code-conventions.md): keys,
  locals and columns say `len`, so `max_word_length` becomes `max_word_len`
  and `events.length` becomes `len` at step 4. `lengthScore` keeps the long
  form: it is a score, not a length.
- **No `GTile`**: the unit is the word.
- `letter_count` is `nLetters`; the event's `kind` (one value) and `length`
  (the word's) leave the blob; `maxGuesses` is the builder's, and the
  frontend's `MAX_GUESSES` goes.

## Predicted test breaks

- **Step 4 (2026-10-04), fixed at step 5:** every pgTAP assertion that reads
  the statuses (`create_game_test`, `gameplay_test`, `replay_test`,
  `terminal_test`, `winner_test`, `statuses_test`), `games_state`
  (`schema_test`, `rls_test`) or the events mode arm (`rls_test`,
  `gameplay_test` 30).
- **Steps 4–7:** the frontend reads `games_state` and the `events` columns
  directly, so the page is broken until `useGame` reads `game_data`.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/wordiply.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
