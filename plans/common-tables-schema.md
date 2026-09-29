# Common tables — the target schema

Every table [common-tables.md](common-tables.md) changes, as it looks when
that plan is finished. It is the picture the migration, the SQL and the front
end are written against (common-tables → The path, step 1). Beside each
column: `kept`, `new`, `changed` or `dropped`. Dropped rows sit at the bottom
of their table. The words the columns hold (`reached_goal`, `won`, `near`,
`timeout-no-result`…) are docs/win-lose.md's terms.

## Decided while drafting

Joel, 2026-09-27 and -28. The numbers are what the tables below refer to.

1. **`created_at` is dropped from every `<game>.games`.**
   `common.games.started_at` records the same moment.
2. **bananagrams' Peel draws 1 and Dump draws 3, as constants.** No `setup`
   read and no column; letting the table choose is a Someday in bananagrams'
   todo.
3. **No column for what a table already holds.** bananagrams' `bunch` and
   `bag` become readable and the page counts them (hiding them only guarded
   against peeking, which the trust model doesn't ask for).
4. **boggle's scoring ladder and dice set get no columns.** Both are used
   only at create, which reads `setup`; the four `InfoCol` props nothing uses
   (`ladderLabel`, `diceLabel`, `setup`, `minWordLength`) are deleted.
5. **connections' `perfect-play` stays unrecorded.** Nothing reads it, and
   the card's hint is `hint-free`.
6. **crosswords' `perfect-play` stays unrecorded** — checks are `hint-free`.
7. **psychicnum's `required_secrets_count` gets no column** (rule 3): it is
   the length of `secrets`; the club line gets it through `clubpage_info`.
8. **scrabble drops `seat`** from `players` and `events`. Every player, bot
   or human, is a user id; the one turn-order number is
   `common.game_players.turn_seat`, set only in a game played in turns.
9. **stackdown's `required_words_count` gets no column** (rule 3): it is the
   length of `solution`, which the ending check reads instead of a
   hard-coded 6.
10. **scrabble's `bag` becomes readable and the page counts it** (rule 3);
    `_bag_count_for()` and the view's `bag_count` go.
11. **Solving is a timestamp, with one home:** `common.game_players.solved_at`,
    written the moment a player solves (every teammate, in coop). The games'
    own `solved` / `solved_at`, and bananagrams' `progress.solved` /
    `finished_at`, are dropped. Separate from `player_ended_at`, because with
    a chosen goal a player may solve and play on.
12. **Who ended the game is recorded:** `common.games.game_ended_by_user_id`.
13. **`common._end_game`'s signature** is agreed (below).
14. **The views stay and follow their tables** (below); what the database
    hides is a later plan's question.
15. **codenamesduet's sudden-death miss** has detail `neutral`, not `turns`.
16. **Rankings are built with each game's SQL**, not in a later stage: every
    game writes its full `final_ranking`s (common-tables → The path, step 4).
17. **Names:** `common.games.restarts` → `restart_count`; `common.timers`'
    countdown length is `countdown_seconds_at_setup`; bananagrams'
    `bunch_seed` → `bunch_at_setup`; boggle's `n` → `board_side_size`,
    `band` → `required_band`, `win_percent` → `target_win_percent`;
    codenamesduet's `turns` → `max_turns`, `user_a_id` / `user_b_id` →
    `player_a_user_id` / `player_b_user_id`; crosswords' `meta` →
    `puzzle_content`, on `games` and on the `puzzles` library it is copied
    from; letterboxed's `playable_words` → `legal_words`, as wordiply
    names its own; scrabble's `shared_rack` / `team_score` → `coop_rack` /
    `coop_score`, named for the mode they exist in; strands' `clue` →
    `puzzle_title` on `games` and `title` on the `puzzles` library; waffle's
    `scramble` → `board_at_setup`. `_at_setup` marks a set-once copy
    wherever the table also has a live counterpart (`ticks`; the live
    `bunch`).
18. **Each `<game>.games` names its key `game_id`, not `id`:** it is a
    one-to-one pointer at `common.games.id`, which keeps `id` as the one
    table that makes the game. Child tables already pair their own `id` with
    a `game_id`. The `games_state` views follow.
19. **The database describes a row's shape, not the game's rules.** Only a
    game's RPC writes its tables, and each move RPC locks the game's row
    first, so its own checks are safe against races. Table constraints keep
    to shape — not null, a value's range, the allowed words. A rule that
    would need a copied fact or a join to enforce in the table (a found word
    on the board; connections' one correct match per category) is the RPC's.
    So `connections.events.mode` and its two partial unique indexes go.
20. **A column nothing reads after create goes.** stackdown's `games.band`
    only chose the library board at create; afterwards it was read only in
    one never-fired error's text, which can name `setup.band` instead.
    wordiply's `games.difficulty` only chose the words at create; the front
    end loads it and never uses it. If either is ever needed, `setup` has it.
21. **The statuses replace `status` and the planned `leaderboard`**
    (Joel, 2026-09-28; common-tables.md → Decided → The statuses):
    `common.games.game_status` for the board, `common.game_players.player_status`
    for each player, and `clubpage_info` a subset for the club page — all
    copies, written by one standalone builder per game that takes only the
    game id and assigns, never merges.

## `common.games` — one row per game

| column                     | type        |         | holds                                                                                                                                                                                                                                                                                                                                                                                                                                                |
|----------------------------|-------------|---------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `id`                       | uuid        | kept    | the game                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `club_handle`              | text        | kept    | its club                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `gametype`                 | text        | kept    | the manifest's key (`wordle_coop`); a name, never read for the mode                                                                                                                                                                                                                                                                                                                                                                                  |
| `mode`                     | text        | new     | `coop` or `compete`; copied from the gametype at create (was `status.mode` and each `<game>.games.mode`)                                                                                                                                                                                                                                                                                                                                             |
| `created_by`               | uuid        | kept    | who started it                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `title`                    | text        | kept    | the club card's name                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `setup`                    | jsonb       | kept    | the setup form's record, every item under the form's name, written at create and never changed; read only to show the form's choices back (the Setup options list, the PDF) and to replay it                                                                                                                                                                                                                                                         |
| `is_current_view`          | boolean     | kept    | the club's one current game                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `started_at`               | timestamptz | kept    |                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ended_at`                 | timestamptz | kept    | when the game `ended`; null while it is being played                                                                                                                                                                                                                                                                                                                                                                                                 |
| `game_ended_reason`        | text        | new     | why it ended — one of `reached_goal`, `resource_exhausted`, `all_passed`, `fatal_move`, `conceded`, `timeout`, `stopped`; null exactly when `ended_at` is                                                                                                                                                                                                                                                                                            |
| `game_ended_reason_detail` | text        | new     | the game's own word for that act (`solved`, `assassin`, `mistakes`, `target`…); null exactly when `ended_at` is                                                                                                                                                                                                                                                                                                                                      |
| `game_ended_outcome`       | text        | new     | `won`, `lost`, `near` or `neutral`; null exactly when `ended_at` is                                                                                                                                                                                                                                                                                                                                                                                  |
| `game_ended_by_user_id`    | uuid        | new     | the player whose act ended the game: the Stop-presser, the last to concede, the last passer, the player whose move ended it (a solve, a fatal move, using up a resource, their own or a shared one), or — for a `timeout` in a game played in turns — whoever held the turn. Null only for a `timeout` nobody's turn covers (a game without turns; codenamesduet's sudden death with both players holding words), and while the game is being played |
| `game_status`              | jsonb       | new     | what the game page shows about the whole board, as data (the front end words it): cards left in the deck, tiles in the bag, a coop number the game keeps on the game. A copy, written by the game's status builder (decision 21)                                                                                                                                                                                                                  |
| `clubpage_info`            | jsonb       | new     | what the club page shows beyond these columns, as data (the manifest's `labelFor` words it); a copy, written by the same builder                                                                                                                                                                                                                                                                                                                    |
| `current_turn_user_id`     | uuid        | kept    | whose turn it is, in a game played in turns; null otherwise                                                                                                                                                                                                                                                                                                                                                                                          |
| `status_changed_at`        | timestamptz | changed | when the game's status last changed: written only by the game's status builder, when its caller passes `p_update_status_changed_at` true (create, Restart, every move); the club list sorts and dates by it (renamed from `last_active_at`, which a trigger bumped on every update of the row; common-tables → Decided → Step 3) |
| `updated_at`               | timestamptz | new     | when the row was last written, by anything: stamped by a trigger, never written directly; backfilled from `last_active_at` |
| `restart_count`            | integer     | changed | how many times it was restarted (renamed from `restarts`)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `play_state`               | text        | dropped | → `ended_at`, `game_ended_outcome`; codenamesduet's sudden death is worked out from `turn_number` and `max_turns`                                                                                                                                                                                                                                                                                                                                                |
| `is_terminal`              | boolean     | dropped | → `ended_at is not null`                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `status`                   | jsonb       | dropped | → `game_status`, each player's `player_status`, `clubpage_info`, the reason pair, the game's own tables                                                                                                                                                                                                                                                                                                                                                                           |
| `paused`                   | boolean     | dropped | nothing sets it                                                                                                                                                                                                                                                                                                                                                                                                                                      |

`game_ended_by_user_id`'s backfill: past games never recorded who ended
them, so it is null for every existing row. (A named winner is no stand-in:
in a game that ends when every player is done, and in scrabble, the winner's
move is not always the one that ended it.)

Checks: `mode in ('coop','compete')`; the reason from the seven; the outcome
from the four; the reason, detail and outcome all null or all set, and set
exactly when `ended_at` is.

## `common.game_players` — one row per player per game, in every game

Whether or not the game has a player table of its own (spellingbee has none;
Moth's facts are here).

| column                       | type        |         | holds                                                                                                                                                                                                                                                                                                                                        |
|------------------------------|-------------|---------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `game_id`                    | uuid        | kept    |                                                                                                                                                                                                                                                                                                                                              |
| `user_id`                    | uuid        | kept    |                                                                                                                                                                                                                                                                                                                                              |
| `turn_seat`                  | integer     | kept    | the player's place in the turn order; null in a game without one                                                                                                                                                                                                                                                                             |
| `joined_at`                  | timestamptz | kept    |                                                                                                                                                                                                                                                                                                                                              |
| `player_ended_at`            | timestamptz | new     | when the player stopped playing while the game went on (`player-ended`: conceded, solved and waiting, out of guesses); null if they never did                                                                                                                                                                                                |
| `player_ended_reason`        | text        | new     | why — the player's slice of the same list: `reached_goal`, `resource_exhausted`, `fatal_move`, `conceded`, `timeout`; null exactly when `player_ended_at` is                                                                                                                                                                                 |
| `player_ended_reason_detail` | text        | new     | the game's own word for it (`solved`, `mistakes`, `exhausted`, `conceded`)                                                                                                                                                                                                                                                                   |
| `final_ranking`              | integer     | new     | the player's `final-ranking`: 1, 1, 3…; null for a player not ranked; null until the game ends                                                                                                                                                                                                                                               |
| `outcome`                    | text        | new     | `won` (ranked 1), `near` (ranked 2 or lower), `lost`, `neutral`; null until the game ends                                                                                                                                                                                                                                                    |
| `solved_at`                  | timestamptz | new     | when the player `solved`, written at that moment; null if they haven't. In coop the team solves, so every teammate gets the same moment. Separate from `player_ended_at`: with a chosen goal a player may solve and play on. A game with nothing to solve (scrabble) never writes it — that is a fact about the game, not a per-player value |
| `player_status`              | jsonb       | new     | what the game page shows about this player, as data (the front end words it): their score, guesses, hints. A copy of the game's canonical storage — a coop number kept on every player's row is on every player's status — written by the game's status builder (decision 21) |
| `result`                     | jsonb       | dropped | → `final_ranking`, `outcome`, `solved_at`; its copied numbers live in the game's own tables                                                                                                                                                                                                                                                  |
| `conceded`                   | boolean     | dropped | → `player_ended_reason = 'conceded'`                                                                                                                                                                                                                                                                                                         |
| `conceded_at`                | timestamptz | dropped | → `player_ended_at`                                                                                                                                                                                                                                                                                                                          |
| `locally_terminal`           | boolean     | dropped | → `player_ended_at is not null`                                                                                                                                                                                                                                                                                                              |

`solved_at`'s backfill: from the games' own `solved_at` (letterboxed,
stackdown, strands, waffle, wordle) and bananagrams' `finished_at`, before
those columns are dropped; for a coop game whose ending was the solve (a
`solved` or `cleared` ending — never `target`, which is reaching a chosen
rank, not solving), every teammate gets the game's `ended_at`.

Checks: the ended reason from the five; reason and detail set exactly when
`player_ended_at` is; the outcome from the four; `final_ranking > 0`;
`outcome = 'won'` exactly when `final_ranking = 1`, `near` exactly when it is
above 1.

## `common.timers` — one row per game

| column      | type        |      | holds                                                                 |
|-------------|-------------|------|-----------------------------------------------------------------------|
| `game_id`   | uuid        | kept |                                                                       |
| `ticks`     | integer     | kept | seconds counted so far                                                |
| `last_tick` | timestamptz | kept |                                                                       |
| `kind`      | text        | new  | `none`, `countup` or `countdown`; copied from `setup.timer` at create |
| `countdown_seconds_at_setup` | integer | new | the countdown's length as chosen in setup, never changed (the live count is `ticks`); null unless `kind = 'countdown'` |

## What `common._end_game` takes and does

**Agreed** (Joel, 2026-09-28). A game calls it once, when its game `ended`.
Whether the ending is a `no-result` or `timeout-no-result` is the game's own
rule, passed as true or false and never stored; what is stored is the
outcome it produces (`neutral`).

- **It takes:** the game; `game_ended_reason` and its detail; who ended it
  (`game_ended_by_user_id`, or none); whether the ending is a `no-result` or
  a `timeout-no-result`; and for each player, their `final_ranking`.
  (`solved_at` is not its business: the game writes it the moment a player
  solves.) The rankings come as one jsonb object keyed by user id,
  `{"<user id>": 1, …}`; a player left out is unranked (Joel, 2026-09-28).
- **It writes:** `ended_at`, the reason pair, `game_ended_by_user_id` and
  `game_ended_outcome` on the
  game's row (`won` if anyone ranked 1; otherwise `neutral` if the ending is
  `stopped`, `no-result` or `timeout-no-result`, else `lost`); each player's
  `final_ranking` and `outcome` (1 → `won`; 2 or lower → `near`;
  unranked → `lost` for a conceder or in an ending with a result, otherwise
  `neutral`).
- **It decides only the two outcomes.** Everything else is the game's.

## The views

**They stay, and follow their tables** (Joel, 2026-09-27). Where a game's
page reads through a view, every change to the table reaches the view in the
same change: its dropped columns leave the view, and each new column the page
reads joins it — so no page reads part of a row from the view and part from
the table. Most of these views exist to hide something until it may be
shown; whether to keep that is a later plan's question (root `todo.md`), not
this one's.

| view | columns when this plan is finished |
|---|---|
| `crosswords.games_state` | `game_id`, `puzzle_id`, `puzzle_content`, `solution` (revealed by `_solution_for`) |
| `letterboxed.games_state` | `game_id`, `sides`, `legal_words`, `clean_words`, `solution`, `max_words`, `legal_band` |
| `letterboxed.players_state` | `game_id`, `user_id`, `hints_used`, `chain`, `word_count`, `letters_covered` (its helpers join `common.games` for what they read off `club_handle` today) |
| `psychicnum.games_state` | `game_id`, `words`, `secrets` (revealed by `_secrets_for`), **`max_guesses`** |
| `scrabble.games_state` | `game_id`, `board`, `version`, `coop_rack`, `coop_score`, `consecutive_passes`, **`bag`** (`bag_count` goes, decision 10) |
| `scrabble.players_state` | `game_id`, `user_id`, `score`, `ai_level`, `rack`, `rack_count` (by user id; `seat` goes, decision 8) |
| `setgame.games_state` | `game_id`, `deck_kind`, `board`, `deck_left`, **`palette`** |
| `spellingbee.games_state` | `game_id`, `outer_letters`, `center_letter`, `required_words`, `bonus_words`, `required_words_count`, `required_words_score`, **`target_rank`**, **`required_band`**, **`legal_band`** |
| `stackdown.games_state` | `game_id`, `tiles`, `solution` (revealed by `_solution_for`) |
| `strands.games_state` | `game_id`, `puzzle_id`, `puzzle_date`, `board`, `puzzle_title`, `min_word_length`, `hint_cost`, `band`, `solution` (revealed by `_solution_for`) |
| `strands.players_state` | `game_id`, `user_id`, `hints_spent`, `hint_points`, `active_hint_coords` |
| `waffle.games_state` | `game_id`, `board_at_setup`, `par_swaps`, `max_swaps`, `solution` (revealed by `_solution_for`) |
| `waffle.players_state` | `game_id`, `user_id`, `swaps_used`, `board`, `colors` |
| `wordiply.games_state` | `game_id`, `base`, `max_word_length`, `longest_words`, `legal_words` |
| `wordle.games_state` | `game_id`, `max_guesses`, `target` (revealed by `_target_for`) |
| `wordwheel.games_state` | as spellingbee's, with **`target_rank`**, **`required_band`**, **`legal_band`** |
| `strands.club_game_status` | dropped — unread |

Every `games_state` view loses `club_handle`, `mode` and `created_at`, and
names its key `game_id` (decision 18).
**Bold** is a column the view gains. bananagrams, boggle, codenamesduet and
connections have no view: their pages read the tables.

## Each game's own tables

Each `<game>.games` loses `mode` and `club_handle` (the security rules join
`common.games` instead), and gains a typed column for each `setup` value its
logic reads after create, in SQL or in the front end.

### bananagrams

**`bananagrams.games`**

| column        | type        |         | holds                                                                                                                                 |
|---------------|-------------|---------|---------------------------------------------------------------------------------------------------------------------------------------|
| `game_id`     | uuid        | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18)                                                              |
| `hand_size`   | integer     | kept    | tiles dealt to each player (15 or 21)                                                                                                 |
| `word_check`  | text        | new     | `off` · `win` · `strict`: when a peel needs real words; copied from `setup.word_check` at create (`off` when absent). `peel` reads it |
| `dict_2`      | integer     | new     | the 2-letter word band, 2..6; copied from `setup.dict_2` at create (4 when absent). `peel` and `check_board` read it                  |
| `dict_3plus`  | integer     | new     | the longer-word band, 1..6; copied from `setup.dict_3plus` at create (4 when absent). `peel` and `check_board` read it                |
| `dump_to_bag` | boolean     | new     | a dumped tile goes to the bag, not the bunch; copied from `setup.dump_to_bag` at create (false when absent). `dump` reads it          |
| `bunch_at_setup` | text     | changed | the bunch as dealt from — every hand plus the draw pile, in shuffled order — fixed at setup; Restart re-deals from it (renamed from `bunch_seed`); not granted |
| `bunch`       | text        | changed | the draw pile; now readable, and the page counts its letters for "tiles left"                                                         |
| `bag`         | text        | changed | the out-of-play tiles; now readable, and the page counts them                                                                         |
| `created_at`  | timestamptz | dropped | `common.games.started_at`                                                                                                             |
| `club_handle` | text        | dropped | the rules join `common.games`                                                                                                         |

`bananagrams.progress` — changed: `solved` and `finished_at` dropped (one
moment, now `common.game_players.solved_at`); kept `game_id`, `user_id`,
`unplaced_count` (renamed from `unplaced`), `placed`. Unchanged: `bananagrams.player_boards` (`game_id`,
`user_id`, `board`, `tiles`, `updated_at`).

`status` keys that are not columns: `reason` (the reason pair on `common.games`); `winner_username` (end summary; `clubpage_info` carries `winner_user_id`). The strip's number is `progress.unplaced_count`: a player's tiles not in their board's largest block, a tile off to the side counted as unplaced.

### boggle

**`boggle.games`**

| column                 | type        |         | holds                                                                                                                                                                                                   |
|------------------------|-------------|---------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `game_id`              | uuid        | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18)                                                                                                                                |
| `board`                | text        | kept    | the dice faces                                                                                                                                                                                          |
| `board_side_size`      | integer     | changed | the grid's side, in dice (renamed from `n`)                                                                                                                                                                                         |
| `min_word_length`      | integer     | kept    | the shortest legal word                                                                                                                                                                                 |
| `required_band`        | integer     | new     | the required words' difficulty band; copied from `setup.band` at create. The front end compares it to `legal_band` to know whether the board has bonus words (`src/boggle/components/PlayArea.tsx:140`) |
| `legal_band`           | integer     | kept    | the legal words' difficulty band                                                                                                                                                                        |
| `target_win_percent`   | integer     | changed | the target, a share of the required points; null for none (renamed from `win_percent`). The club line reads it through `clubpage_info`                                                                                               |
| `required_words`       | jsonb       | kept    | the required words with their points                                                                                                                                                                    |
| `bonus_words`          | jsonb       | kept    | the other legal words with their points                                                                                                                                                                 |
| `required_words_count` | integer     | kept    | how many required words                                                                                                                                                                                 |
| `required_words_score` | integer     | kept    | their total points                                                                                                                                                                                      |
| `created_at`           | timestamptz | dropped | `common.games.started_at`                                                                                                                                                                               |
| `mode`                 | text        | dropped | `common.games.mode`                                                                                                                                                                                     |
| `club_handle`          | text        | dropped | the rules join `common.games`                                                                                                                                                                           |

unchanged: `boggle.found_words` (`game_id, user_id, word, points, is_bonus, found_at`).

`status` keys that are not columns: `mode` (`common.games.mode`); `required_words_count` / `_score` (already columns); `found_words_count` / `_score` (live, totaled from `found_words`, copied to `clubpage_info` in coop); `leaderboard` (each player's `player_status`); `reason` (the reason pair); `top_score`, `winner_user_id`, `winner_username` (end summary).

### codenamesduet

**`codenamesduet.games`**

| column               | type        |         | holds                                                                                                                                                                                      |
|----------------------|-------------|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `game_id`            | uuid        | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18)                                                                                                                   |
| `max_turns`          | integer     | new     | the turn budget, 7..15; copied from `setup.turns` at create. Read by the end status, `replay_board` and the front end's turn readouts (`InfoCol`, `GameEventLog`, `StateLine`, `PlayArea`) |
| `turns_remaining`    | integer     | dropped | always `greatest(max_turns − turn_number + 1, 0)`, so worked out instead (Joel, 2026-09-28); sudden death is `turn_number` past `max_turns` |
| `turn_number`        | integer     | kept    | the current turn                                                                                                                                                                           |
| `current_clue_giver` | text        | kept    | the seat giving the clue                                                                                                                                                                   |
| `player_a_user_id`   | uuid        | changed | seat A, the first clue-giver (`setup.first_clue_giver_user_id`); renamed from `user_a_id`                                                                                                                            |
| `player_b_user_id`   | uuid        | changed | seat B; renamed from `user_b_id`                                                                                                                                                                                     |
| `key_card_a`         | jsonb       | kept    | seat A's key                                                                                                                                                                               |
| `key_card_b`         | jsonb       | kept    | seat B's key                                                                                                                                                                               |
| `created_at`         | timestamptz | dropped | `common.games.started_at`                                                                                                                                                                  |
| `club_handle`        | text        | dropped | the rules join `common.games`                                                                                                                                                              |

unchanged: `codenamesduet.events` (`id, game_id, user_id, kind, took_turn, created_at, turn_number, seat, clue_word, clue_count, clue_from_ai, guess_position, guess_result` — `clue_from_ai` is the card's `hint-recorded`), `codenamesduet.words` (`game_id, position, word, revealed_as, neutral_a, neutral_b`), `codenamesduet.word_pool` (`word`).

`status` keys that are not columns: `turn_number` (a column), `turns_remaining` (worked out from `max_turns` and `turn_number`); `found_agents_count` (live, counted from `words.revealed_as`, copied to `clubpage_info`); `reason` (the reason pair); `turns_used` (end summary, `max_turns` minus the turns left).

### connections

**`connections.games`**

| column        | type        |         | holds                                                                    |
|---------------|-------------|---------|--------------------------------------------------------------------------|
| `game_id`     | uuid        | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18) |
| `puzzle_id`   | uuid        | kept    | the library puzzle, when one was picked                                  |
| `puzzle_date` | date        | kept    | the puzzle's date                                                        |
| `board`       | jsonb       | kept    | the sixteen tiles and their categories                                   |
| `created_at`  | timestamptz | dropped | `common.games.started_at`                                                |
| `mode`        | text        | dropped | `common.games.mode`                                                      |
| `club_handle` | text        | dropped | the rules join `common.games`                                            |

`connections.events` — changed: `mode` dropped, and with it the two partial
unique indexes that filtered on it (decision 19); `submit_guess` checks
"already matched" itself. Kept: `id`, `game_id`, `user_id`, `kind`, `tiles`,
`result`, `matched_category_rank`, `took_turn`, `created_at`. Unchanged:
`connections.players` (`game_id`, `user_id`, `mistake_count`,
`found_categories_count`), `connections.puzzles` (`id`, `source_id`,
`puzzle_date`, `categories`, `imported_at`).

No `setup` value is read after create: `puzzle_id` is already a column, and `coop_style` / `first_turn_user_id` only seat the turn order at create and show in the setup rows.

`status` keys that are not columns: `found_categories_count`, `mistake_count` (live, on `players` and counted from `events`, copied to `clubpage_info` in coop); `reason` (the reason pair); `winner_username` (end summary); `mode` (`common.games.mode`).

### crosswords

**`crosswords.games`**

| column        | type        |         | holds                                                                                                                                |
|---------------|-------------|---------|--------------------------------------------------------------------------------------------------------------------------------------|
| `game_id`     | uuid        | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18)                                                             |
| `puzzle_id`   | uuid        | kept    | the library puzzle; null for an NYT or uploaded one                                                                                  |
| `puzzle_date` | date        | kept    | the NYT puzzle's date                                                                                                                |
| `puzzle_content` | jsonb    | changed | the puzzle as published, minus the answers — title, author, size, clues, the starting grid; copied from `crosswords.puzzles.puzzle_content` at create, never changed (renamed from `meta`) |
| `solution`    | jsonb       | kept    | the answer grid; secret                                                                                                              |
| `created_at`  | timestamptz | dropped | `common.games.started_at`                                                                                                            |
| `mode`        | text        | dropped | `common.games.mode`                                                                                                                  |
| `club_handle` | text        | dropped | the rules join `common.games`; `library_for_club` joins `common.games`, whose `(club_handle, last_active_at)` index finds the club's games, and its two `(club_handle, …)` indexes become `(puzzle_id)` and `(puzzle_date)`, as connections and strands have them (Joel, 2026-09-28) |

unchanged: `crosswords.cells` (`id, game_id, owner_id, row, col, fill, pencil, revealed, wrong, mark_right, mark_bottom, version` — `revealed` is the card's `hint-recorded` for a coop reveal).
`crosswords.puzzles` — changed: `meta` → `puzzle_content`, the same name as
the game's copy. Kept: `id`, `content_hash`, `source`, `solution`,
`created_at`.

No `setup` value is read after create, in SQL or the front end.

`status` keys that are not columns: `title` (deleted; `puzzle_content ->> 'title'` holds it); `mode` (`common.games.mode`); `reason` (the reason pair); `winner_user_id`, `winner_username` (end summary).

### letterboxed

**`letterboxed.games`**

| column           | type            |         | holds                                                                                        |
|------------------|-----------------|---------|----------------------------------------------------------------------------------------------|
| `game_id`        | uuid            | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18)                     |
| `sides`          | char(12)        | kept    | the twelve letters, three per side                                                           |
| `legal_words`    | jsonb           | changed | the words the board accepts: every word up to `legal_band` that the twelve letters spell with no two in a row from one side; built at create (renamed from `playable_words`, as wordiply names its own) |
| `solution`       | text[] (2)      | kept    | the two seed words                                                                           |
| `max_words`      | integer (2..10) | kept    | the chain's word cap (2 + `setup.extra_words`); already the column `status.max_words` copies |
| `legal_band`     | integer (1..6)  | kept    | the dictionary band a word is checked at                                                     |
| `created_at`     | timestamptz     | dropped | `common.games.started_at`                                                                    |
| `mode`           | text            | dropped | now `common.games.mode`                                                                      |
| `club_handle`    | text            | dropped | the rules join `common.games`; `_chain_for`, `_word_count_for` and `_covered_for` too        |

No `setup` read after create, in SQL or the front end (the front end reads it only for the setup rows and New game). Live progress (`words_used`, `letters_covered`) is worked out from `letterboxed.players.chain`. The end keys (`solved`, `winner_id`, `winner_username`, `timed_out`, `stopped`, `best_letters_covered`) go to the reason pair, `game_ended_outcome` and `clubpage_info`: note only.

`letterboxed.players` — changed: `solved` and `solved_at` dropped (now `common.game_players.solved_at`); kept `game_id`, `user_id`, `chain`, `hints_used` — `hints_used` is the card's `hint-recorded` in coop.
unchanged: `letterboxed.events` (`id`, `game_id`, `user_id`, `kind`, `word`, `letters_covered`, `created_at`, `took_turn`).
unchanged: `letterboxed.seeds` (`letters`, `mask`, `word_a`, `word_b`, `difficulty`).

### psychicnum

**`psychicnum.games`**

| column        | type           |         | holds                                                                                                                                                                  |
|---------------|----------------|---------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `game_id`     | uuid           | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18)                                                                                               |
| `words`       | text[] (5..20) | kept    | the board                                                                                                                                                              |
| `secrets`     | text[] (3)     | kept    | the three secrets; the check keeps it at three, which is what `status.required_secrets_count` held (decision 7)                                                        |
| `max_guesses` | integer (1..9) | new     | each budget's size; copied from `setup.max_guesses` at create (read by `submit_guess` and the ending check in SQL, `PlayArea` and the coop club line in the front end) |
| `created_at`  | timestamptz    | dropped | `common.games.started_at`                                                                                                                                              |
| `mode`        | text           | dropped | now `common.games.mode`                                                                                                                                                |
| `club_handle` | text           | dropped | the rules join `common.games`                                                                                                                                          |

Live progress (`guesses_used`, `found_secrets_count`) is on `psychicnum.players`. `winner_username` and `reason` are end keys: note only.

unchanged: `psychicnum.players` (`game_id`, `user_id`, `found_secrets_count`, `guesses_used`).
unchanged: `psychicnum.events` (`id`, `game_id`, `user_id`, `word`, `is_correct`, `kind`, `created_at`, `took_turn`) — the `hint` and `spoiler` rows are the card's `hint-recorded`.

### scrabble

**`scrabble.games`**

| column               | type           |         | holds                                                                    |
|----------------------|----------------|---------|--------------------------------------------------------------------------|
| `game_id`            | uuid           | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18) |
| `dict_2`             | integer (1..6) | kept    | the band two-letter words are checked at                                 |
| `dict_3plus`         | integer (1..6) | kept    | the band longer words are checked at                                     |
| `board`              | jsonb          | kept    | the tiles on the grid                                                    |
| `bag`                | text[]         | changed | the tiles left to draw; now readable, and the page counts it             |
| `version`            | integer        | kept    | the move counter the front end checks against                            |
| `coop_rack`          | text[]         | changed | coop's one rack; null in compete (renamed from `shared_rack`)            |
| `coop_score`         | integer        | changed | coop's score; null in compete (renamed from `team_score`)                |
| `consecutive_passes` | integer        | kept    | passes in a row, for compete's `all_passed`                              |
| `created_at`         | timestamptz    | dropped | `common.games.started_at`                                                |
| `mode`               | text           | dropped | now `common.games.mode`                                                  |
| `club_handle`        | text           | dropped | the rules join `common.games`                                            |

`coop_rack` and `coop_score` are team-facts on the games row; they move to `scrabble.players` with cross-game-consistency §6, after this plan (common-tables.md → Decided → The statuses).

No `setup` read after create: `ai_count` and `ai_level` become the bot seats at create, and the front end reads `setup` only for the setup rows and New game. The end keys (`winner_user_id`, `winner_seat`, `winner_username`, `winner_score`) are note only; the leaderboard moves to each player's `player_status`.

**`scrabble.players`** — changed: `seat` dropped (decision 8). Kept:
`game_id`, `user_id`, `score`, `rack`, `ai_level`. A player, bot or human, is
found by `user_id`; the turn order of a turn-based game is
`common.game_players.turn_seat`, and the compete strip is ordered by it.

**`scrabble.events`** — changed: `seat` dropped; the mover is `user_id`.
Kept: `id`, `game_id`, `user_id`, `kind`, `placements`, `words`, `score`,
`tile_count`, `created_at`, `took_turn`.

### setgame

**`setgame.games`**

| column        | type                                |         | holds                                                                                                                                   |
|---------------|-------------------------------------|---------|-----------------------------------------------------------------------------------------------------------------------------------------|
| `game_id`     | uuid                                | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18)                                                                |
| `deck_kind`   | text (`full` / `junior`)            | kept    | which deck; copied from `setup.deck` (the coop club line gets it through `clubpage_info`)                                               |
| `palette`     | text (`traditional` / `colorblind`) | new     | the card colors; copied from `setup.palette` at create, `traditional` when absent (as `paletteOf` does); read by `PlayArea` and the PDF |
| `deck`        | smallint[]                          | kept    | the shuffled deck                                                                                                                       |
| `deck_pos`    | integer                             | kept    | cards dealt so far; `status.deck_left` is the deck's size less this                                                                     |
| `board`       | smallint[] (0..21)                  | kept    | the cards on the table                                                                                                                  |
| `created_at`  | timestamptz                         | dropped | `common.games.started_at`                                                                                                               |
| `mode`        | text                                | dropped | now `common.games.mode`                                                                                                                 |
| `club_handle` | text                                | dropped | the rules join `common.games`                                                                                                           |

No SQL reads `setup` after create. `status.sets_found` is the sum of `setgame.players.sets_found`. `winner_user_id`, `winner_username` and `reason` are end keys: note only; the leaderboard moves to each player's `player_status`.

unchanged: `setgame.players` (`game_id`, `user_id`, `sets_found`, `hints_used`) — `hints_used` is the card's `hint-recorded` in coop.
unchanged: `setgame.events` (`id`, `game_id`, `user_id`, `kind`, `cards`, `board_after`, `created_at`, `took_turn`).

### spellingbee

**`spellingbee.games`**

| column                 | type                         |         | holds                                                                                                                                                                                                                                  |
|------------------------|------------------------------|---------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `game_id`              | uuid                         | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18)                                                                                                                                                               |
| `outer_letters`        | char(6)                      | kept    | the six outer letters                                                                                                                                                                                                                  |
| `center_letter`        | char(1)                      | kept    | the center letter                                                                                                                                                                                                                      |
| `required_words`       | jsonb                        | kept    | the words the ranks are measured against                                                                                                                                                                                               |
| `bonus_words`          | jsonb                        | kept    | the other legal words                                                                                                                                                                                                                  |
| `required_words_count` | integer                      | kept    | the required list's size; already the column `status.required_words_count` copies                                                                                                                                                      |
| `required_words_score` | integer                      | kept    | the required list's points; already the column `status.required_words_score` copies                                                                                                                                                    |
| `target_rank`          | integer (0..6), null         | new     | the rank that wins, null for none; copied from `setup.target_rank` at create (read in six SQL functions, `PlayArea`, and both club lines through `clubpage_info`); nullable in compete too, for compete with a countdown and no target |
| `required_band`        | integer (1..6)               | new     | the band the required words come from; copied from `setup.required_band` at create, 3 when absent (as create_game defaults); read by `PlayArea` (`hasBonus`)                                                                           |
| `legal_band`           | integer (`required_band`..6) | new     | the band a bonus word may come from; copied from `setup.legal_band` at create, 5 when absent (as create_game defaults); read by `PlayArea` (`hasBonus`)                                                                                |
| `created_at`           | timestamptz                  | dropped | `common.games.started_at`                                                                                                                                                                                                              |
| `mode`                 | text                         | dropped | now `common.games.mode`                                                                                                                                                                                                                |
| `club_handle`          | text                         | dropped | the rules join `common.games`; the build-board edge function finds the club's last board through `common.games`                                                                                                                        |

Live progress (`found_words_count`, `found_words_score`, `rank_idx`) is worked out from `spellingbee.found_words`. `winner_user_id`, `winner_username` and `reason` are end keys: note only; the leaderboard moves to each player's `player_status`.

unchanged: `spellingbee.found_words` (`game_id`, `user_id`, `word`, `points`, `is_pangram`, `is_bonus`, `found_at`).
unchanged: `spellingbee.pangrams` (`mask`, `required_words_count`, `has_rare_letters`).

### stackdown

**`stackdown.games`**

| column        | type        |         | holds                                                                    |
|---------------|-------------|---------|--------------------------------------------------------------------------|
| `game_id`     | uuid        | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18) |
| `tiles`       | jsonb       | kept    | the stack's tiles                                                        |
| `solution`    | text[]      | kept    | the six words, in order (not granted: secret)                            |
| `board_id`    | uuid, null  | kept    | the library board claimed                                                |
| `band`        | integer     | dropped | used only to pick the board at create, from `setup.band` (decision 20)   |
| `created_at`  | timestamptz | dropped | `common.games.started_at`                                                |
| `mode`        | text        | dropped | now `common.games.mode`                                                  |
| `club_handle` | text        | dropped | security rules join `common.games`                                       |

Not columns: `setup.band` on the club line comes through `clubpage_info`; `status.found_words_count` (coop) is the count of valid `stackdown.events`; `status.solved` and the winner keys are end-of-game summary.

`stackdown.players` — changed: `solved` and `solved_at` dropped (now `common.game_players.solved_at`); kept `game_id`, `user_id`, `found_count`. Unchanged: `stackdown.events` (`game_id`, `user_id`, `kind`, `word`, `tile_ids`, `valid`, `for_word_index`, `created_at`, `id`, `took_turn`), `stackdown.boards` (`id`, `tiles`, `words`, `band`, `created_at`).

### strands

**`strands.games`**

| column            | type        |         | holds                                                                    |
|-------------------|-------------|---------|--------------------------------------------------------------------------|
| `game_id`         | uuid        | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18) |
| `puzzle_id`       | uuid, null  | kept    | the library puzzle, when picked                                          |
| `puzzle_date`     | date, null  | kept    | the puzzle's date                                                        |
| `board`           | text[]      | kept    | the letter grid                                                          |
| `puzzle_title`    | text        | changed | the puzzle's title, which serves as its theme clue (renamed from `clue`) |
| `solution`        | jsonb       | kept    | theme words, spangram and where they lie (not granted: secret)           |
| `min_word_length` | integer     | kept    | shortest word that fills the hint bar, copied from `setup` at create     |
| `hint_cost`       | integer     | kept    | hint-bar points per hint, copied from `setup` at create                  |
| `band`            | integer     | kept    | the word band, copied from `setup` at create                             |
| `created_at`      | timestamptz | dropped | `common.games.started_at`                                                |
| `mode`            | text        | dropped | now `common.games.mode`                                                  |
| `club_handle`     | text        | dropped | security rules join `common.games`                                       |

Not columns: no `status` key is fixed at create (besides `mode`); `status.words_found` (coop) is the count of found words in `strands.events`; `best_hints` is end-of-game summary. `strands.club_game_status` (a view) is dropped by the plan's stage 2.

`strands.players` — changed: `solved` and `solved_at` dropped (now `common.game_players.solved_at`). Kept: `game_id`, `user_id`, `hint_points`, `hints_spent`, `active_hint_coords`. Unchanged: `strands.events` (`game_id`, `user_id`, `kind`, `word`, `path`, `result`, `created_at`, `id`, `took_turn`), `strands.puzzles` (`id`, `source_id`, `puzzle_date`, `board`, `title` — renamed from `clue`, as the other puzzle libraries name it — `solution`, `imported_at`).

### waffle

**`waffle.games`**

| column        | type        |         | holds                                                                    |
|---------------|-------------|---------|--------------------------------------------------------------------------|
| `game_id`     | uuid        | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18) |
| `board_at_setup` | char(25) | changed | the board as dealt at setup, never changed; the live board is on `waffle.players.board`, and Restart deals from this (renamed from `scramble`) |
| `par_swaps`   | integer     | kept    | fewest swaps that solve it (`perfect-play`)                              |
| `max_swaps`   | integer     | kept    | the swap budget: par + `setup.extra_swaps`, at create                    |
| `solution`    | char(25)    | kept    | the solved board (not granted: secret)                                   |
| `created_at`  | timestamptz | dropped | `common.games.started_at`                                                |
| `mode`        | text        | dropped | now `common.games.mode`                                                  |
| `club_handle` | text        | dropped | security rules join `common.games`                                       |

Not columns: `setup.difficulty` is read only by the club line (through `clubpage_info`) and the setup rows; `status.max_swaps` is already `max_swaps`; `status.swaps_used` (coop) is `waffle.players.swaps_used` (coop rows kept in step); `status.solved` and `winner_swaps` are end-of-game summary.

`waffle.players` — changed: `solved` and `solved_at` dropped (now `common.game_players.solved_at`); kept `game_id`, `user_id`, `board`, `swaps_used`. Unchanged: `waffle.events` (`game_id`, `user_id`, `pos_a`, `pos_b`, `letter_a`, `letter_b`, `created_at`, `kind`, `id`, `took_turn`, `colors`).

### wordiply

**`wordiply.games`**

| column            | type        |         | holds                                                                                |
|-------------------|-------------|---------|--------------------------------------------------------------------------------------|
| `game_id`         | uuid        | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18)             |
| `base`            | text        | kept    | the base every word must contain                                                     |
| `max_word_length` | integer     | kept    | the longest possible word's length                                                   |
| `longest_words`   | jsonb       | kept    | up to three longest words                                                            |
| `legal_words`     | jsonb       | kept    | every accepted word                                                                  |
| `difficulty`      | smallint    | dropped | used only to choose the words at create, from `setup.difficulty` (decision 20)       |
| `created_at`      | timestamptz | dropped | `common.games.started_at`                                                            |
| `mode`            | text        | dropped | now `common.games.mode`                                                              |
| `club_handle`     | text        | dropped | security rules join `common.games`; the build-board edge function's filter joins too |

Not columns: the one `setup` read after create, `setup.timer.kind` in `_finish_compete` (`supabase/sql/wordiply.sql:586`), goes with the speed-step decision (plans/cross-game-consistency.md:850-854), and the timer's kind lands on `common.timers` anyway. `status.base` and `max_word_length` are already columns; `status.guesses_used` (coop) is the count of `wordiply.events`; `length_score`, `letter_count` and `longest` are end-of-game summary.

unchanged: `wordiply.events` (`id`, `game_id`, `user_id`, `word`, `length`, `valid`, `reason`, `created_at`, `kind`, `took_turn`).

### wordle

**`wordle.games`**

| column        | type        |         | holds                                                                    |
|---------------|-------------|---------|--------------------------------------------------------------------------|
| `game_id`     | uuid        | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18) |
| `target`      | char(5)     | kept    | the hidden word (not granted: secret)                                    |
| `max_guesses` | integer     | kept    | the guess budget, copied from `setup.max_guesses` at create              |
| `legal_band`  | integer     | kept    | how obscure a guess may be, copied from `setup` at create (not granted)  |
| `created_at`  | timestamptz | dropped | `common.games.started_at`                                                |
| `mode`        | text        | dropped | now `common.games.mode`                                                  |
| `club_handle` | text        | dropped | security rules join `common.games`                                       |

Not columns: `setup.answer_band` is read only by the club line (through `clubpage_info`) and the setup rows; `status.max_guesses` is already `max_guesses`; `status.guesses_used` (coop) is `wordle.players.guesses_used`; `status.solved` and `winner_guesses` are end-of-game summary.

`wordle.players` — changed: `solved` and `solved_at` dropped (now `common.game_players.solved_at`); kept `game_id`, `user_id`, `guesses_used`. Unchanged: `wordle.events` (`game_id`, `user_id`, `word`, `colors`, `is_correct`, `created_at`, `kind`, `id`, `took_turn`).

### wordwheel

**`wordwheel.games`**

| column                 | type          |         | holds                                                                                                                                                            |
|------------------------|---------------|---------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `game_id`              | uuid          | changed | the game: `common.games.id`, one to one (renamed from `id`, decision 18)                                                                                         |
| `outer_letters`        | char(8)       | kept    | the eight outer tiles                                                                                                                                            |
| `center_letter`        | char(1)       | kept    | the center tile                                                                                                                                                  |
| `required_words_score` | integer       | kept    | points in the required words (the rank ladder's top)                                                                                                             |
| `required_words_count` | integer       | kept    | how many required words                                                                                                                                          |
| `required_words`       | jsonb         | kept    | the required words                                                                                                                                               |
| `bonus_words`          | jsonb         | kept    | the bonus words                                                                                                                                                  |
| `target_rank`          | integer, null | new     | the rank that wins, null for none; copied from `setup.target_rank` at create (also what `status.target_rank` copies); read by six SQL functions and the PlayArea |
| `required_band`        | integer       | new     | the required words' band; copied from `setup.required_band` at create (default 3); the PlayArea reads it for `hasBonus`                                          |
| `legal_band`           | integer       | new     | how obscure an accepted word may be; copied from `setup.legal_band` at create (default 5); the PlayArea reads it for `hasBonus`                                  |
| `created_at`           | timestamptz   | dropped | `common.games.started_at`                                                                                                                                        |
| `mode`                 | text          | dropped | now `common.games.mode`                                                                                                                                          |
| `club_handle`          | text          | dropped | security rules join `common.games`; the build-board edge function's filter joins too                                                                             |

Not columns: `status.required_words_count` and `required_words_score` are already columns; `status.found_words_count`, `found_words_score` and `rank_idx` (coop) come from `wordwheel.found_words`; the winner keys are end-of-game summary. `setup.custom_letters` is read only at create.

unchanged: `wordwheel.found_words` (`game_id`, `user_id`, `word`, `points`, `is_pangram`, `is_bonus`, `found_at`), `wordwheel.pangrams` (`letters`, `mask`, `difficulty`, `word_counts`, `has_rare_letters`).
