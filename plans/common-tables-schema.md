# Common tables — the target schema

Every table [common-tables.md](common-tables.md) changes, as it looks when
that plan is finished. It is the picture the migration, the SQL and the front
end are written against (common-tables → The path, step 1). Beside each
column: `kept`, `new`, `changed` or `dropped`. Dropped rows sit at the bottom
of their table. The words the columns hold (`reached_goal`, `won`, `near`,
`timeout-no-result`…) are docs/win-lose.md's terms.

## Questions raised while drafting — all decided

1. ~~**`created_at` on every `<game>.games`.**~~ **Dropped** (Joel,
   2026-09-27): `common.games.started_at` records the same moment. Its
   readers — every `games_state` view and the `useGame` selects — move to
   `started_at` if anything uses the value.
2. **Decided** (Joel, 2026-09-27): constants — `peel` draws 1, `dump` 3, no
   `setup` read and no column; letting the table choose is a Someday in
   bananagrams' todo, migrated if it's ever built. ~~**bananagrams `peel_count` / `dump_count`.**~~ They are read from `setup`
   with defaults (`supabase/sql/bananagrams.sql:680`, `:1005`) that the form
   never sends (`src/bananagrams/lib/setup.ts`, `DEFAULT_BANANAGRAMS_SETUP`),
   so they are always 1 and 3. Columns, or constants in `peel` and `dump`?
3. **Decided** (Joel, 2026-09-27): no columns for what the table already
   has — `bunch` and `bag` become readable (hiding them only defended against
   peeking, which the trust model doesn't), and the page counts them.
   ~~**bananagrams' live bunch and bag counts.**~~ The front end reads them from
   `status` (`supabase/sql/bananagrams.sql:333–338`) because `bunch` and
   `bag` are left out of the grant (`:77–85`). Readable columns generated from
   `length(bunch)` / `length(bag)`, or a view?
4. **Decided** (Joel, 2026-09-27): no columns — both are used only at create,
   which reads `setup`; the four unused `InfoCol` props (`ladderLabel`,
   `diceLabel`, `setup`, `minWordLength`) and what builds them are deleted.
   ~~**boggle `scoring_ladder` / `dice_set`.**~~ Their only front-end reads end
   in props `InfoCol` never uses: built at `src/boggle/components/PlayArea.tsx:132`,
   `:545–546`, passed at `:613–614`, declared at
   `src/boggle/components/InfoCol.tsx:96–99` and never destructured
   (`:26–48`). Add the columns, or delete the dead props?
5. **Decided** (Joel, 2026-09-27): left unrecorded — nothing reads
   `perfect-play`, and the card's hint is `hint-free`. ~~**connections `perfect-play`**~~ ("no mistakes, no hints"). The hint lives
   only in the player's browser (`src/connections/todo.md`, Maybe), so the
   server cannot tell a perfect game. Record hints, or leave `perfect-play`
   unrecorded?
6. **Decided** (Joel, 2026-09-27): checks left unrecorded, as the card's
   `hint-free` says. ~~**crosswords `perfect-play`**~~ ("no checks, no reveals"). A check only sets
   `cells.wrong`, which a fix clears, so nothing records that a check was used
   (`src/crosswords/todo.md`, Soon: "Investigate how we flag check/reveal").
   Record checks, or leave `perfect-play` unrecorded?
7. **Decided by question 3's rule** (2026-09-27): no column — it is the
   length of `secrets`; the club line gets it through `clubpage_info`.
   ~~**psychicnum `required_secrets_count`.**~~ It is always 3: a table check
   holds `array_length(secrets, 1) = 3`, and `create_game` writes it from that
   length (`supabase/sql/psychicnum.sql:371`). The draft adds no column for it
   (plans/common-tables.md:114-117 lists it). Right?
8. **Decided** (Joel, 2026-09-27): scrabble drops `players.seat` and
   `events.seat`. Every player, bot or human, is a user id; the one
   turn-order number is `common.game_players.turn_seat`, set only in a game
   played in turns (for scrabble: compete, and turn-by-turn coop; across the
   app, every game's turn-by-turn coop too); a game without turns leaves it and
   `common.games.current_turn_user_id` empty, as every game already does.
   ~~**scrabble `players.seat`.**~~ It holds the same number as
   `common.game_players.turn_seat`
   (`supabase/migrations/20260925000001_scrabble_turn_order.sql` copies one
   into the other), and the model gives every fact one home
   (plans/common-tables.md:13). Does `seat` stay?
9. **Decided by question 3's rule** (2026-09-27): no column — it is the
   length of `solution`, which the ending check reads instead of a hard-coded
   6. ~~**stackdown `required_words_count`.**~~ It is always 6, the length of
   `solution` (`supabase/sql/stackdown.sql:227`, `:916`), and the ending check
   hard-codes 6 (`:409`, `:433`). A column, or read the length?
10. **Decided** (Joel, 2026-09-27): `bag` becomes readable and the page
    counts it; `_bag_count_for()` and the view's `bag_count` go; the club
    line's count rides in `clubpage_info`. ~~**scrabble's bag count, by question 3's ruling?**~~ `scrabble.games.bag` is
    left out of the readers' grant, and the page gets the count from
    `scrabble._bag_count_for()` and `status.bag_count`. Make `bag` readable
    and count it on the page, dropping the helper?

## `common.games` — one row per game

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game |
| `club_handle` | text | kept | its club |
| `gametype` | text | kept | the manifest's key (`wordle_coop`); a name, never read for the mode |
| `mode` | text | new | `coop` or `compete`; copied from the gametype at create (was `status.mode` and each `<game>.games.mode`) |
| `created_by` | uuid | kept | who started it |
| `title` | text | kept | the club card's name |
| `setup` | jsonb | kept | the setup form's record, every item under the form's name, written at create and never changed; read only to show the form's choices back (the Setup options list, the PDF) and to replay it |
| `is_current_view` | boolean | kept | the club's one current game |
| `started_at` | timestamptz | kept | |
| `ended_at` | timestamptz | kept | when the game `ended`; null while it is being played |
| `game_ended_reason` | text | new | why it ended — one of `reached_goal`, `resource_exhausted`, `all_passed`, `fatal_move`, `conceded`, `timeout`, `stopped`; null exactly when `ended_at` is |
| `game_ended_reason_detail` | text | new | the game's own word for that act (`solved`, `assassin`, `mistakes`, `target`…); null exactly when `ended_at` is |
| `game_ended_outcome` | text | new | `won`, `lost`, `near` or `neutral`; null exactly when `ended_at` is |
| `clubpage_info` | jsonb | new | what the club page shows beyond these columns, as data (the manifest's `labelFor` words it); a copy, written by the game in the move that changes it |
| `leaderboard` | jsonb | new | compete: one entry per player — `user_id` and the game's own numbers under its own names; coop: `[]`. A copy, written by `<game>._leaderboard()` in the move that changes it |
| `current_turn_user_id` | uuid | kept | whose turn it is, in a game played in turns; null otherwise |
| `last_active_at` | timestamptz | kept | bumped by every update of the row |
| `restarts` | integer | kept | how many times it was restarted |
| `play_state` | text | dropped | → `ended_at`, `game_ended_outcome`; codenamesduet's sudden death is worked out from `turns_remaining` |
| `is_terminal` | boolean | dropped | → `ended_at is not null` |
| `status` | jsonb | dropped | → `clubpage_info`, `leaderboard`, the reason pair, the game's own tables |
| `paused` | boolean | dropped | nothing sets it |

Checks: `mode in ('coop','compete')`; the reason from the seven; the outcome
from the four; the reason, detail and outcome all null or all set, and set
exactly when `ended_at` is.

## `common.game_players` — one row per player per game, in every game

Whether or not the game has a player table of its own (spellingbee has none;
Moth's facts are here).

| column | type | | holds |
|---|---|---|---|
| `game_id` | uuid | kept | |
| `user_id` | uuid | kept | |
| `turn_seat` | integer | kept | the player's place in the turn order; null in a game without one |
| `joined_at` | timestamptz | kept | |
| `player_ended_at` | timestamptz | new | when the player stopped playing while the game went on (`player-ended`: conceded, solved and waiting, out of guesses); null if they never did |
| `player_ended_reason` | text | new | why — the player's slice of the same list: `reached_goal`, `resource_exhausted`, `fatal_move`, `conceded`, `timeout`; null exactly when `player_ended_at` is |
| `player_ended_reason_detail` | text | new | the game's own word for it (`solved`, `mistakes`, `exhausted`, `conceded`) |
| `final_ranking` | integer | new | the player's `final-ranking`: 1, 1, 3…; null for a player not ranked; null until the game ends |
| `outcome` | text | new | `won` (ranked 1), `near` (ranked 2 or lower), `lost`, `neutral`; null until the game ends |
| `solved` | boolean | new | the player (in coop, the team) `solved`; null where the game has nothing to solve (scrabble); set when the game ends |
| `result` | jsonb | dropped | → `final_ranking`, `outcome`, `solved`; its copied numbers live in the game's own tables |
| `conceded` | boolean | dropped | → `player_ended_reason = 'conceded'` |
| `conceded_at` | timestamptz | dropped | → `player_ended_at` |
| `locally_terminal` | boolean | dropped | → `player_ended_at is not null` |

Checks: the ended reason from the five; reason and detail set exactly when
`player_ended_at` is; the outcome from the four; `final_ranking > 0`;
`outcome = 'won'` exactly when `final_ranking = 1`, `near` exactly when it is
above 1.

## `common.timers` — one row per game

| column | type | | holds |
|---|---|---|---|
| `game_id` | uuid | kept | |
| `ticks` | integer | kept | seconds counted so far |
| `last_tick` | timestamptz | kept | |
| `kind` | text | new | `none`, `countup` or `countdown`; copied from `setup.timer` at create |
| `seconds` | integer | new | the countdown's length; null unless `kind = 'countdown'` |

## What `common.end_game` takes and does

**Proposed, not yet agreed** (the plan fixes only that the reason pair is a
required parameter). A game calls it once, when its game `ended`:

- **It takes:** the game; `game_ended_reason` and its detail; whether the
  ending is a `no-result` or a `timeout-no-result`; and for each player,
  their `final_ranking` and `solved`.
- **It writes:** `ended_at`, the reason pair and `game_ended_outcome` on the
  game's row (`won` if anyone ranked 1; otherwise `neutral` if the ending is
  `stopped`, `no-result` or `timeout-no-result`, else `lost`); each player's
  `final_ranking`, `solved` and `outcome` (1 → `won`; 2 or lower → `near`;
  unranked → `lost` for a conceder or in an ending with a result, otherwise
  `neutral`).
- **It decides only the two outcomes.** Everything else is the game's.

## Each game's own tables

Each `<game>.games` loses `mode` and `club_handle` (the security rules join
`common.games` instead), and gains a typed column for each `setup` value its
logic reads after create, in SQL or in the front end.

### bananagrams

**`bananagrams.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game (FK to `common.games`) |
| `hand_size` | integer | kept | tiles dealt to each player (15 or 21) |
| `word_check` | text | new | `off` · `win` · `strict`: when a peel needs real words; copied from `setup.word_check` at create (`off` when absent). `peel` reads it |
| `dict_2` | integer | new | the 2-letter word band, 2..6; copied from `setup.dict_2` at create (4 when absent). `peel` and `check_board` read it |
| `dict_3plus` | integer | new | the longer-word band, 1..6; copied from `setup.dict_3plus` at create (4 when absent). `peel` and `check_board` read it |
| `dump_to_bag` | boolean | new | a dumped tile goes to the bag, not the bunch; copied from `setup.dump_to_bag` at create (false when absent). `dump` reads it |
| `bunch_seed` | text | kept | the shuffled tiles in play; secret (not granted) |
| `bunch` | text | changed | the draw pile; now readable, and the page counts its letters for "tiles left" |
| `bag` | text | changed | the out-of-play tiles; now readable, and the page counts them |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `club_handle` | text | dropped | the rules join `common.games` |

unchanged: `bananagrams.player_boards` (`game_id, user_id, board, tiles, updated_at`), `bananagrams.progress` (`game_id, user_id, unplaced, placed, solved, finished_at`).

`status` keys that are not columns: `reason` (the reason pair on `common.games`); `winner_username` (end summary; `clubpage_info` carries `winner_user_id`). Tiles left in each hand, the strip's number, is `progress.unplaced`.

### boggle

**`boggle.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game |
| `board` | text | kept | the dice faces |
| `n` | integer | kept | the grid's side |
| `min_word_length` | integer | kept | the shortest legal word |
| `band` | integer | new | the required words' difficulty band; copied from `setup.band` at create. The front end compares it to `legal_band` to know whether the board has bonus words (`src/boggle/components/PlayArea.tsx:140`) |
| `legal_band` | integer | kept | the legal words' difficulty band |
| `win_percent` | integer | kept | the target, a share of the required points; null for none. The club line reads it through `clubpage_info` |
| `required_words` | jsonb | kept | the required words with their points |
| `bonus_words` | jsonb | kept | the other legal words with their points |
| `required_words_count` | integer | kept | how many required words |
| `required_words_score` | integer | kept | their total points |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `mode` | text | dropped | `common.games.mode` |
| `club_handle` | text | dropped | the rules join `common.games` |

unchanged: `boggle.found_words` (`game_id, user_id, word, points, is_bonus, found_at`).

`status` keys that are not columns: `mode` (`common.games.mode`); `required_words_count` / `_score` (already columns); `found_words_count` / `_score` (live, totaled from `found_words`, copied to `clubpage_info` in coop); `leaderboard` (`common.games.leaderboard`); `reason` (the reason pair); `top_score`, `winner_user_id`, `winner_username` (end summary).

### codenamesduet

**`codenamesduet.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game |
| `turns` | integer | new | the turn budget, 7..15; copied from `setup.turns` at create. Read by the end status, `replay_board` and the front end's turn readouts (`InfoCol`, `GameEventLog`, `StateLine`, `PlayArea`) |
| `turns_remaining` | integer | kept | turns left; starts at `turns`, 0 in sudden death |
| `turn_number` | integer | kept | the current turn |
| `current_clue_giver` | text | kept | the seat giving the clue |
| `user_a_id` | uuid | kept | seat A, the first clue-giver (`setup.first_clue_giver_user_id`) |
| `user_b_id` | uuid | kept | seat B |
| `key_card_a` | jsonb | kept | seat A's key |
| `key_card_b` | jsonb | kept | seat B's key |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `club_handle` | text | dropped | the rules join `common.games` |

unchanged: `codenamesduet.events` (`id, game_id, user_id, kind, took_turn, created_at, turn_number, seat, clue_word, clue_count, clue_from_ai, guess_position, guess_result` — `clue_from_ai` is the card's `hint-recorded`), `codenamesduet.words` (`game_id, position, word, revealed_as, neutral_a, neutral_b`), `codenamesduet.word_pool` (`word`).

`status` keys that are not columns: `turn_number`, `turns_remaining` (already columns); `found_agents_count` (live, counted from `words.revealed_as`, copied to `clubpage_info`); `reason` (the reason pair); `turns_used` (end summary, `turns − turns_remaining`).

### connections

**`connections.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game |
| `puzzle_id` | uuid | kept | the library puzzle, when one was picked |
| `puzzle_date` | date | kept | the puzzle's date |
| `board` | jsonb | kept | the sixteen tiles and their categories |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `mode` | text | dropped | `common.games.mode` |
| `club_handle` | text | dropped | the rules join `common.games` |

unchanged: `connections.events` (`id, game_id, user_id, kind, tiles, result, matched_category_rank, mode, took_turn, created_at` — its `mode` stays: the two partial unique indexes filter on it and cannot join, `supabase/migrations/20260917000005_connections_events.sql:24`), `connections.players` (`game_id, user_id, mistake_count, found_categories_count`), `connections.puzzles` (`id, source_id, puzzle_date, categories, imported_at`).

No `setup` value is read after create: `puzzle_id` is already a column, and `coop_style` / `first_turn_user_id` only seat the turn order at create and show in the setup rows.

`status` keys that are not columns: `found_categories_count`, `mistake_count` (live, on `players` and counted from `events`, copied to `clubpage_info` in coop); `reason` (the reason pair); `winner_username` (end summary); `mode` (`common.games.mode`).

### crosswords

**`crosswords.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game |
| `puzzle_id` | uuid | kept | the library puzzle; null for an NYT or uploaded one |
| `puzzle_date` | date | kept | the NYT puzzle's date |
| `meta` | jsonb | kept | the puzzle: title, clues, grid shape |
| `solution` | jsonb | kept | the answer grid; secret |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `mode` | text | dropped | `common.games.mode` |
| `club_handle` | text | dropped | the rules join `common.games`; `library_for_club` and its two `(club_handle, …)` indexes get a replacement that joins `common.games` |

unchanged: `crosswords.cells` (`id, game_id, owner_id, row, col, fill, pencil, revealed, wrong, mark_right, mark_bottom, version` — `revealed` is the card's `hint-recorded` for a coop reveal), `crosswords.puzzles` (`id, content_hash, source, meta, solution, created_at`).

No `setup` value is read after create, in SQL or the front end.

`status` keys that are not columns: `title` (deleted; `meta ->> 'title'` holds it); `mode` (`common.games.mode`); `reason` (the reason pair); `winner_user_id`, `winner_username` (end summary).

### letterboxed

**`letterboxed.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game (FK to `common.games`) |
| `sides` | char(12) | kept | the twelve letters, three per side |
| `playable_words` | jsonb | kept | the words the board accepts |
| `solution` | text[] (2) | kept | the two seed words |
| `max_words` | integer (2..10) | kept | the chain's word cap (2 + `setup.extra_words`); already the column `status.max_words` copies |
| `legal_band` | integer (1..6) | kept | the dictionary band a word is checked at |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `mode` | text | dropped | now `common.games.mode` |
| `club_handle` | text | dropped | the rules join `common.games`; `_chain_for`, `_word_count_for` and `_covered_for` too |

No `setup` read after create, in SQL or the front end (the front end reads it only for the setup rows and New game). Live progress (`words_used`, `letters_covered`) is worked out from `letterboxed.players.chain`. The end keys (`solved`, `winner_id`, `winner_username`, `timed_out`, `stopped`, `best_letters_covered`) go to the reason pair, `game_ended_outcome` and `clubpage_info`: note only.

unchanged: `letterboxed.players` (`game_id`, `user_id`, `chain`, `hints_used`, `solved`, `solved_at`) — `hints_used` is the card's `hint-recorded` in coop.
unchanged: `letterboxed.events` (`id`, `game_id`, `user_id`, `kind`, `word`, `letters_covered`, `created_at`, `took_turn`).
unchanged: `letterboxed.seeds` (`letters`, `mask`, `word_a`, `word_b`, `difficulty`).

### psychicnum

**`psychicnum.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game (FK to `common.games`) |
| `words` | text[] (5..20) | kept | the board |
| `secrets` | text[] (3) | kept | the three secrets; the check keeps it at three, which is `status.required_secrets_count` (open question 7) |
| `max_guesses` | integer (1..9) | new | each budget's size; copied from `setup.max_guesses` at create (read by `submit_guess` and the ending check in SQL, `PlayArea` and the coop club line in the front end) |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `mode` | text | dropped | now `common.games.mode` |
| `club_handle` | text | dropped | the rules join `common.games` |

Live progress (`guesses_used`, `found_secrets_count`) is on `psychicnum.players`. `winner_username` and `reason` are end keys: note only.

unchanged: `psychicnum.players` (`game_id`, `user_id`, `found_secrets_count`, `guesses_used`).
unchanged: `psychicnum.events` (`id`, `game_id`, `user_id`, `word`, `is_correct`, `kind`, `created_at`, `took_turn`) — the `hint` and `spoiler` rows are the card's `hint-recorded`.

### scrabble

**`scrabble.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game (FK to `common.games`) |
| `dict_2` | integer (1..6) | kept | the band two-letter words are checked at |
| `dict_3plus` | integer (1..6) | kept | the band longer words are checked at |
| `board` | jsonb | kept | the tiles on the grid |
| `bag` | text[] | changed | the tiles left to draw; now readable, and the page counts it |
| `version` | integer | kept | the move counter the front end checks against |
| `shared_rack` | text[] | kept | coop's one rack; null in compete |
| `team_score` | integer | kept | coop's score; null in compete |
| `consecutive_passes` | integer | kept | passes in a row, for compete's `all_passed` |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `mode` | text | dropped | now `common.games.mode` |
| `club_handle` | text | dropped | the rules join `common.games` |

No `setup` read after create: `ai_count` and `ai_level` become the bot seats at create, and the front end reads `setup` only for the setup rows and New game. The end keys (`winner_user_id`, `winner_seat`, `winner_username`, `winner_score`) are note only; the leaderboard moves to `common.games.leaderboard`.

**`scrabble.players`** — changed: `seat` dropped (question 8). Kept:
`game_id`, `user_id`, `score`, `rack`, `ai_level`. A player, bot or human, is
found by `user_id`; the turn order of a turn-based game is
`common.game_players.turn_seat`, and the compete strip is ordered by it.

**`scrabble.events`** — changed: `seat` dropped; the mover is `user_id`.
Kept: `id`, `game_id`, `user_id`, `kind`, `placements`, `words`, `score`,
`tile_count`, `created_at`, `took_turn`.

### setgame

**`setgame.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game (FK to `common.games`) |
| `deck_kind` | text (`full` / `junior`) | kept | which deck; copied from `setup.deck` (the coop club line gets it through `clubpage_info`) |
| `palette` | text (`traditional` / `colorblind`) | new | the card colors; copied from `setup.palette` at create, `traditional` when absent (as `paletteOf` does); read by `PlayArea` and the PDF |
| `deck` | smallint[] | kept | the shuffled deck |
| `deck_pos` | integer | kept | cards dealt so far; `status.deck_left` is the deck's size less this |
| `board` | smallint[] (0..21) | kept | the cards on the table |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `mode` | text | dropped | now `common.games.mode` |
| `club_handle` | text | dropped | the rules join `common.games` |

No SQL reads `setup` after create. `status.sets_found` is the sum of `setgame.players.sets_found`. `winner_user_id`, `winner_username` and `reason` are end keys: note only; the leaderboard moves to `common.games.leaderboard`.

unchanged: `setgame.players` (`game_id`, `user_id`, `sets_found`, `hints_used`) — `hints_used` is the card's `hint-recorded` in coop.
unchanged: `setgame.events` (`id`, `game_id`, `user_id`, `kind`, `cards`, `board_after`, `created_at`, `took_turn`).

### spellingbee

**`spellingbee.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game (FK to `common.games`) |
| `outer_letters` | char(6) | kept | the six outer letters |
| `center_letter` | char(1) | kept | the center letter |
| `required_words` | jsonb | kept | the words the ranks are measured against |
| `bonus_words` | jsonb | kept | the other legal words |
| `required_words_count` | integer | kept | the required list's size; already the column `status.required_words_count` copies |
| `required_words_score` | integer | kept | the required list's points; already the column `status.required_words_score` copies |
| `target_rank` | integer (0..6), null | new | the rank that wins, null for none; copied from `setup.target_rank` at create (read in six SQL functions, `PlayArea`, and both club lines through `clubpage_info`); nullable in compete too, for compete with a countdown and no target |
| `required_band` | integer (1..6) | new | the band the required words come from; copied from `setup.required_band` at create, 3 when absent (as create_game defaults); read by `PlayArea` (`hasBonus`) |
| `legal_band` | integer (`required_band`..6) | new | the band a bonus word may come from; copied from `setup.legal_band` at create, 5 when absent (as create_game defaults); read by `PlayArea` (`hasBonus`) |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `mode` | text | dropped | now `common.games.mode` |
| `club_handle` | text | dropped | the rules join `common.games`; the build-board edge function finds the club's last board through `common.games` |

Live progress (`found_words_count`, `found_words_score`, `rank_idx`) is worked out from `spellingbee.found_words`. `winner_user_id`, `winner_username` and `reason` are end keys: note only; the leaderboard moves to `common.games.leaderboard`.

unchanged: `spellingbee.found_words` (`game_id`, `user_id`, `word`, `points`, `is_pangram`, `is_bonus`, `found_at`).
unchanged: `spellingbee.pangrams` (`mask`, `required_words_count`, `has_rare_letters`).

### stackdown

**`stackdown.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game (FK to `common.games`) |
| `tiles` | jsonb | kept | the stack's tiles |
| `solution` | text[] | kept | the six words, in order (not granted: secret) |
| `band` | integer | kept | the word band, copied from `setup.band` at create |
| `board_id` | uuid, null | kept | the library board claimed |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `mode` | text | dropped | now `common.games.mode` |
| `club_handle` | text | dropped | security rules join `common.games` |

Not columns: `setup.band` on the club line comes through `clubpage_info`; `status.found_words_count` (coop) is the count of valid `stackdown.events`; `status.solved` and the winner keys are end-of-game summary.

unchanged: `stackdown.players` (`game_id`, `user_id`, `found_count`, `solved`, `solved_at`), `stackdown.events` (`game_id`, `user_id`, `kind`, `word`, `tile_ids`, `valid`, `for_word_index`, `created_at`, `id`, `took_turn`), `stackdown.boards` (`id`, `tiles`, `words`, `band`, `created_at`).

### strands

**`strands.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game (FK to `common.games`) |
| `puzzle_id` | uuid, null | kept | the library puzzle, when picked |
| `puzzle_date` | date, null | kept | the puzzle's date |
| `board` | text[] | kept | the letter grid |
| `clue` | text | kept | the theme clue |
| `solution` | jsonb | kept | theme words, spangram and where they lie (not granted: secret) |
| `min_word_length` | integer | kept | shortest word that fills the hint bar, copied from `setup` at create |
| `hint_cost` | integer | kept | hint-bar points per hint, copied from `setup` at create |
| `band` | integer | kept | the word band, copied from `setup` at create |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `mode` | text | dropped | now `common.games.mode` |
| `club_handle` | text | dropped | security rules join `common.games` |

Not columns: no `status` key is fixed at create (besides `mode`); `status.words_found` (coop) is the count of found words in `strands.events`; `best_hints` is end-of-game summary. `strands.club_game_status` (a view) is dropped by the plan's stage 2.

unchanged: `strands.players` (`game_id`, `user_id`, `hint_points`, `hints_spent`, `active_hint_coords`, `solved`, `solved_at`), `strands.events` (`game_id`, `user_id`, `kind`, `word`, `path`, `result`, `created_at`, `id`, `took_turn`), `strands.puzzles` (`id`, `source_id`, `puzzle_date`, `board`, `clue`, `solution`, `imported_at`).

### waffle

**`waffle.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game (FK to `common.games`) |
| `scramble` | char(25) | kept | the starting board |
| `par_swaps` | integer | kept | fewest swaps that solve it (`perfect-play`) |
| `max_swaps` | integer | kept | the swap budget: par + `setup.extra_swaps`, at create |
| `solution` | char(25) | kept | the solved board (not granted: secret) |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `mode` | text | dropped | now `common.games.mode` |
| `club_handle` | text | dropped | security rules join `common.games` |

Not columns: `setup.difficulty` is read only by the club line (through `clubpage_info`) and the setup rows; `status.max_swaps` is already `max_swaps`; `status.swaps_used` (coop) is `waffle.players.swaps_used` (coop rows kept in step); `status.solved` and `winner_swaps` are end-of-game summary.

unchanged: `waffle.players` (`game_id`, `user_id`, `board`, `swaps_used`, `solved`, `solved_at`), `waffle.events` (`game_id`, `user_id`, `pos_a`, `pos_b`, `letter_a`, `letter_b`, `created_at`, `kind`, `id`, `took_turn`, `colors`).

### wordiply

**`wordiply.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game (FK to `common.games`) |
| `base` | text | kept | the base every word must contain |
| `difficulty` | smallint | kept | the word band, copied from `setup.difficulty` at create |
| `max_word_length` | integer | kept | the longest possible word's length |
| `longest_words` | jsonb | kept | up to three longest words |
| `legal_words` | jsonb | kept | every accepted word |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `mode` | text | dropped | now `common.games.mode` |
| `club_handle` | text | dropped | security rules join `common.games`; the build-board edge function's filter joins too |

Not columns: the one `setup` read after create, `setup.timer.kind` in `_finish_compete` (`supabase/sql/wordiply.sql:586`), goes with the speed-step decision (plans/cross-game-consistency.md:850-854), and the timer's kind lands on `common.timers` anyway. `status.base` and `max_word_length` are already columns; `status.guesses_used` (coop) is the count of `wordiply.events`; `length_score`, `letter_count` and `longest` are end-of-game summary.

unchanged: `wordiply.events` (`id`, `game_id`, `user_id`, `word`, `length`, `valid`, `reason`, `created_at`, `kind`, `took_turn`).

### wordle

**`wordle.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game (FK to `common.games`) |
| `target` | char(5) | kept | the hidden word (not granted: secret) |
| `max_guesses` | integer | kept | the guess budget, copied from `setup.max_guesses` at create |
| `legal_band` | integer | kept | how obscure a guess may be, copied from `setup` at create (not granted) |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `mode` | text | dropped | now `common.games.mode` |
| `club_handle` | text | dropped | security rules join `common.games` |

Not columns: `setup.answer_band` is read only by the club line (through `clubpage_info`) and the setup rows; `status.max_guesses` is already `max_guesses`; `status.guesses_used` (coop) is `wordle.players.guesses_used`; `status.solved` and `winner_guesses` are end-of-game summary.

unchanged: `wordle.players` (`game_id`, `user_id`, `guesses_used`, `solved`, `solved_at`), `wordle.events` (`game_id`, `user_id`, `word`, `colors`, `is_correct`, `created_at`, `kind`, `id`, `took_turn`).

### wordwheel

**`wordwheel.games`**

| column | type | | holds |
|---|---|---|---|
| `id` | uuid | kept | the game (FK to `common.games`) |
| `outer_letters` | char(8) | kept | the eight outer tiles |
| `center_letter` | char(1) | kept | the center tile |
| `required_words_score` | integer | kept | points in the required words (the rank ladder's top) |
| `required_words_count` | integer | kept | how many required words |
| `required_words` | jsonb | kept | the required words |
| `bonus_words` | jsonb | kept | the bonus words |
| `target_rank` | integer, null | new | the rank that wins, null for none; copied from `setup.target_rank` at create (also what `status.target_rank` copies); read by six SQL functions and the PlayArea |
| `required_band` | integer | new | the required words' band; copied from `setup.required_band` at create (default 3); the PlayArea reads it for `hasBonus` |
| `legal_band` | integer | new | how obscure an accepted word may be; copied from `setup.legal_band` at create (default 5); the PlayArea reads it for `hasBonus` |
| `created_at` | timestamptz | dropped | `common.games.started_at` |
| `mode` | text | dropped | now `common.games.mode` |
| `club_handle` | text | dropped | security rules join `common.games`; the build-board edge function's filter joins too |

Not columns: `status.required_words_count` and `required_words_score` are already columns; `status.found_words_count`, `found_words_score` and `rank_idx` (coop) come from `wordwheel.found_words`; the winner keys are end-of-game summary. `setup.custom_letters` is read only at create.

unchanged: `wordwheel.found_words` (`game_id`, `user_id`, `word`, `points`, `is_pangram`, `is_bonus`, `found_at`), `wordwheel.pangrams` (`letters`, `mask`, `difficulty`, `word_counts`, `has_rare_letters`).
