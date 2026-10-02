# Common tables — the survey behind the redesign

The facts gathered on 2026-09-26 (at `882458be`) for
[common-tables.md](common-tables.md).
This file records what the code does today; the plan holds what was agreed.
Line numbers are as of the survey and will rot — the file and the name are
the handle. Delete this file with the plan item once the redesign ships.

## The two tables today

`common.games`:

| column | type | notes |
|---|---|---|
| `id` | uuid | |
| `club_handle` | text | |
| `gametype` | text | carries the mode: `wordle_compete`, `spellingbee_coop`; bananagrams and codenamesduet have one mode and no suffix |
| `created_by` | uuid | |
| `title` | text | the club card's name; every game sets it at create, and bananagrams, crosswords, scrabble, setgame, stackdown, waffle and wordle rewrite it (waffle's is a readout of the correct words) |
| `setup` | jsonb | the setup form's choices |
| `is_current_view` | boolean | the one-game-at-a-time partial unique index |
| `paused` | boolean | |
| `play_state` | text | `playing` · `sudden_death` (codenamesduet) · `won` · `lost` · `won_compete` · `lost_compete` · `ended` |
| `is_terminal` | boolean | |
| `status` | jsonb | below |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz | |
| `current_turn_user_id` | uuid | |
| `last_active_at` | timestamptz | |
| `restarts` | integer | |

`common.game_players`:

| column | type |
|---|---|
| `game_id` | uuid (key) |
| `user_id` | uuid (key) |
| `result` | jsonb |
| `conceded` | boolean |
| `conceded_at` | timestamptz |
| `turn_seat` | integer |
| `joined_at` | timestamptz |
| `locally_terminal` | boolean |

## Who can read them

One SELECT policy each, neither gated on the game having ended:

- `common.games`: `common.is_club_member(club_handle)`.
- `common.game_players`: the game's club is the reader's
  (`exists (select 1 from common.games g where g.id = game_players.game_id
  and common.is_club_member(g.club_handle))`).

Any club member — a player or a watcher — reads both at any time. The
end-of-game gates are on each game's own tables (wordle's events, the bee
games' compete found words, crosswords' cells).

## Who writes the lifecycle columns

All in `supabase/sql/common.sql`:

- `common.end_game` sets `play_state`, `is_terminal = true`, `ended_at =
  coalesce(ended_at, now())`, merges `status` (shallow `||`), and sets each
  player's `result` from `player_results` (a player missing from it is left
  untouched; null writes none).
- `common.reset_game` (Restart) assigns `status` outright, sets `is_terminal
  = false`, `ended_at = null`, and clears each player's `result`,
  `conceded`, `conceded_at`, `locally_terminal`.
- `common.update_state` merges `status` (shallow) and sets `play_state`.
- `common.concede` sets `conceded = true, conceded_at = now(),
  locally_terminal = true`; when the last active player concedes it calls
  `end_game` with `lost_compete` (a `_compete` gametype) or `lost`,
  `{reason: 'conceded'}`, every result `{won: false}`. Called by
  bananagrams, boggle, crosswords, letterboxed, setgame, spellingbee,
  stackdown, wordiply, wordwheel; connections, psychicnum, scrabble, strands,
  waffle and wordle call `_set_conceded` and run their own ending check;
  codenamesduet has no concede.
- `common._set_locally_terminal` sets `locally_terminal = true`.
- `common.create_game` inserts the row with `status` null; the game's own
  seed fills it.

So `is_terminal` is always `ended_at is not null`, and `conceded` is always
`conceded_at is not null`. No index, Realtime filter or PostgREST filter uses
`is_terminal`; thirteen child-table SELECT policies read it through a join
to `common.games` (the end-of-game gates below), and `strands.club_game_status`
selects it. `common.games.paused` has no writer anywhere — SQL, `src/` or e2e
(verified 2026-09-27). The `last_active_at` trigger
(`games_touch_last_active`) fires on every update of the row, with no
condition, so a `set_current_view` bumps it like a move does. codenamesduet's `sudden_death` is entered when the last turn is
spent, which also sets `codenamesduet.games.turns_remaining = 0`.

## What the club page reads

`src/common/club/useClubGames.ts` reads only `common.games`, up to 200 rows:
`id, gametype, title, play_state, is_terminal, status, setup, last_active_at,
is_current_view`. Each manifest's `summaryFor` gets `play_state`,
`is_terminal`, `status` and `setup`. Every game reads `play_state`; none
reads `is_terminal`; six read `setup`: boggle (`win_percent`), psychicnum
(`max_guesses`), setgame (`deck`), stackdown (`band`), waffle
(`difficulty`), wordle (`answer_band`).

## Where a game keeps `mode`

Three places, none a `common.games` column: the gametype's suffix, a `mode`
column on the game's own table (14 games), and `status.mode` (absent in
bananagrams and codenamesduet; connections and psychicnum write it only on a
Stop).

## crosswords' puzzle

`crosswords.games`: `id, club_handle, mode, puzzle_id, meta, solution,
created_at, puzzle_date`. `puzzle_id` is null for a pasted NYT puzzle; `meta
->> 'title'` holds the name for both kinds. `status.title` is a copy of it
whose only reader is `replay_board`, restating it after `reset_game`.

## `status`, game by game

**S** written only at create and Restart (fixed for the game's life), **P**
changes during play, **E** only at the end. The merge keeps a key an end
write leaves out.

### bananagrams (one mode)

| key | when | meaning |
|---|---|---|
| `bunch_remaining` | S P E | tiles left in the bunch |
| `bag_remaining` | S P | the dump bag |
| `reason` | E | `complete` · `timeout` · `manual` · `conceded` |
| `winner_username` | E | the peeler who won |

### boggle

| key | when | mode | meaning |
|---|---|---|---|
| `mode` | S | both | |
| `required_words_count`, `required_words_score` | S | both | the required set |
| `found_words_count`, `found_words_score` | P E | coop | team totals |
| `leaderboard` | P E | compete | `{user_id, found_words_count, found_words_score}`, by score; only players who found a word |
| `reason` | E | both | `target` · `manual` · `timeout` · `conceded` |
| `top_score` | E | compete | best non-conceded score |
| `winner_user_id`, `winner_username` | E | compete | one top player only |

### codenamesduet (one mode)

| key | when | meaning |
|---|---|---|
| `turn_number`, `turns_remaining` | S P | 0 remaining in sudden death |
| `found_agents_count` | S P E | greens found |
| `reason` | E | `assassin` · `turns` · `solved` · `timeout` · `manual` |
| `turns_used` | E | not written on a Stop |

### connections

| key | when | mode | meaning |
|---|---|---|---|
| `found_categories_count`, `mistake_count` | S P E | coop | Restart assigns `{}`, so they are missing until the first move |
| `reason` | E | both | coop `solved` · `mistakes` · `timeout`; compete `solved` · `mistakes` · `conceded` · `timeout`; `manual` |
| `winner_username` | E | compete | |
| `mode` | E | both | Stop only |

### crosswords

| key | when | mode | meaning |
|---|---|---|---|
| `mode` | S | both | |
| `title` | S | both | the puzzle's name; to be deleted |
| `reason` | E | both | coop win `solved`; `manual`; `timeout`; compete `conceded` — **a compete win writes none** |
| `winner_user_id`, `winner_username` | E | compete | |

### letterboxed

| key | when | mode | meaning |
|---|---|---|---|
| `mode`, `max_words` | S | both | |
| `words_used`, `letters_covered` | P E | coop (and a compete win) | |
| `leaderboard` | P E | compete | `{user_id, username, words_used, letters_covered}`; the timeout's adds `won` |
| `solved` | E | both | |
| `winner_id` | E | compete | **not `winner_user_id`** |
| `winner_username` | E | compete win only | |
| `timed_out`, `stopped` | E | both | |
| `best_letters_covered` | E | compete timeout | |
| `reason` | E | compete | only `common.concede`'s `conceded`; letterboxed writes none |

A compete timeout ends `won_compete` naming no winner, yet writes `won: true`
into `result` and the leaderboard for every non-conceded player tied at the
best coverage — at zero letters too (the "nobody scored" guard boggle and
wordiply have; docs/win-lose.md → `final-ranking`).

### psychicnum

| key | when | mode | meaning |
|---|---|---|---|
| `guesses_used` | S P E | both | coop shared; compete the sum; at a timeout the average |
| `found_secrets_count`, `required_secrets_count` | S P E | coop | Restart assigns only `{guesses_used: 0}`, so they are missing until the first guess |
| `reason` | E | both | `solved` · `exhausted` · `conceded` · `timeout` · `manual` |
| `winner_username` | E | both | written in coop too |
| `mode` | E | both | Stop only |

### scrabble

| key | when | mode | meaning |
|---|---|---|---|
| `mode` | S | both | |
| `team_score` | P E | coop | |
| `bag_count` | P | both | |
| `leaderboard` | P E | compete | `{seat, user_id, ai_level, score}` |
| `reason` | E | both | `complete` · `blocked` · `conceded` · `timeout` · `manual` |
| `winner_user_id`, `winner_seat`, `winner_username`, `winner_score` | E | compete | null on a tie |

The all-conceded ending picks its winner among seats that have not conceded,
and a bot never concedes: with a bot at the table it ends `won_compete` with
the bot as winner, not everyone lost.

### setgame

| key | when | mode | meaning |
|---|---|---|---|
| `mode` | S | both | |
| `sets_found` | S P E | both | team total |
| `deck_left` | S P | both | |
| `reason` | E | both | `cleared` · `timeout` · `manual` · `conceded` |
| `winner_user_id`, `winner_username` | E | compete | null if tied or nobody scored |
| `leaderboard` | E | compete | `{user_id, username, sets_found, won}` |

### spellingbee and wordwheel (the same shape)

| key | when | mode | meaning |
|---|---|---|---|
| `mode`, `target_rank` | S | both | null target = none |
| `required_words_count`, `required_words_score` | S | both | |
| `found_words_count`, `found_words_score`, `rank_idx` | P E | coop | |
| `leaderboard` | P E | compete | `{user_id, found_words_score, rank_idx, found_words_count}`, every player |
| `reason` | E | both | `target` · `timeout` · `manual` · `conceded` |
| `winner_user_id`, `winner_username` | E | compete | |

### stackdown

| key | when | mode | meaning |
|---|---|---|---|
| `mode` | S | both | |
| `required_words_count` | S | both | always 6 |
| `found_words_count` | S P E | coop (compete: stays 0) | |
| `solved` | E | coop win | |
| `reason` | E | both | `cleared` · `timeout` · `manual` · `conceded` — **a compete win writes none** |
| `winner_user_id`, `winner_username` | E | compete win | |

### strands

| key | when | mode | meaning |
|---|---|---|---|
| `mode` | S | both | |
| `words_found` | S P E | coop, and either mode's Stop | |
| `reason` | E | both | coop `solved` · `timeout`; compete `solved` · `timeout` · `conceded` · `unsolved` (unreachable); `manual` |
| `best_hints` | E | compete win | |

No winner key.

### waffle

| key | when | mode | meaning |
|---|---|---|---|
| `mode` | S | both | |
| `solved` | S E | coop at the end; **compete: `false` at create, never updated** | |
| `max_swaps` | S | coop | |
| `swaps_used` | S P E | coop | |
| `reason` | E | both | `solved` · `exhausted` · `conceded` · `timeout` · `manual` |
| `winner_user_id`, `winner_username` | E | compete | null if nobody solved |
| `winner_swaps` | E | compete | not at a timeout |

### wordiply

| key | when | mode | meaning |
|---|---|---|---|
| `mode`, `base`, `max_word_length` | S | both | |
| `guesses_used` | S P E | coop | |
| `leaderboard` | S P E | compete | `{user_id, guesses_used}`; at the end adds `length_score, letter_count, finished_at, won` |
| `reason` | E | both | `complete` · `timeout` · `manual` · `conceded`; `complete` is also written when a concession leaves every remaining player spent |
| `length_score`, `letter_count`, `longest` | E | coop | |
| `winner_user_id`, `winner_username` | E | compete | one winner only |

### wordle

| key | when | mode | meaning |
|---|---|---|---|
| `mode` | S | both | |
| `solved` | S E | coop at the end; **compete: `false` at create, never updated** | |
| `max_guesses` | S | coop | |
| `guesses_used` | S P E | coop | |
| `reason` | E | both | `solved` · `exhausted` · `conceded` · `timeout` · `manual` |
| `winner_user_id`, `winner_username`, `winner_guesses` | E | compete | null if nobody won |

### Across the games

- Fixed at create (besides `mode`): copies of the board or of `setup` —
  `required_words_count` / `_score`, `target_rank`, `required_secrets_count`,
  `max_words`, `max_swaps`, `max_guesses`, `base`, `max_word_length`,
  `title`.
- Winner keys: ten games write `winner_user_id`, letterboxed `winner_id`;
  fourteen write `winner_username`; strands neither; one slot, null on a tie.
- `leaderboard`: six games, six shapes; some live, setgame only at the end.

## `result`, game by game

| game | keys | on the game's own per-player table? |
|---|---|---|
| bananagrams, codenamesduet, connections, crosswords, letterboxed, psychicnum, spellingbee, strands, wordwheel | `{won}` | — |
| boggle | coop: **none on any ending**; compete `{won, score}` | no table; `score` is the sum of `boggle.found_words` points |
| scrabble | coop `{won: false}` always; compete `{won, score}` | `scrabble.players.score` |
| setgame | `{won, sets_found}` | `setgame.players.sets_found` |
| stackdown | coop `{won}`; compete `{won, found}` | `stackdown.players.found_count` |
| waffle | coop `{won}`; compete `{won, solved, swaps}` | `waffle.players.solved`, `swaps_used` |
| wordiply | coop **`{finished: true}`, no `won`**; compete `{won, length_score, letter_count}` | no table; worked out from `wordiply.events` |
| wordle | coop `{won}`; compete `{won, solved, guesses}` | `wordle.players.solved`, `guesses_used` |

A `common.concede` ending writes `{won: false}` for everyone. A Stop writes
`{won: false}` in most games; setgame adds `sets_found`, boggle compete writes
`{won, score}` and boggle coop nothing, wordiply compete writes `{won: false,
length_score, letter_count}` and wordiply coop `{finished: true}`.

## Each game's per-player tables

| game | table | columns |
|---|---|---|
| bananagrams | `player_boards` | `game_id, user_id, board, tiles, updated_at` |
| bananagrams | `progress` | `game_id, user_id, unplaced, placed, solved, finished_at` |
| connections | `players` | `game_id, user_id, mistake_count, found_categories_count` |
| letterboxed | `players` | `game_id, user_id, chain, hints_used, solved, solved_at` |
| psychicnum | `players` | `game_id, user_id, found_secrets_count, guesses_used` |
| scrabble | `players` | `game_id, user_id, seat, score, rack, ai_level` |
| setgame | `players` | `game_id, user_id, sets_found, hints_used` |
| stackdown | `players` | `game_id, user_id, found_count, solved, solved_at` |
| strands | `players` | `game_id, user_id, hint_points, hints_spent, active_hint_coords, solved, solved_at` |
| waffle | `players` | `game_id, user_id, board, swaps_used, solved, solved_at` |
| wordle | `players` | `game_id, user_id, guesses_used, solved, solved_at` |

None: boggle, spellingbee, wordwheel (per-user rows in `found_words`),
wordiply (`events`), crosswords (`cells.owner_id`), codenamesduet (the seats
are `user_a_id` / `user_b_id` on `codenamesduet.games`).

## Each game's `<game>.games` (2026-09-27)

Every table has `id` (FK to `common.games`), `club_handle`, `created_at` (the
moment `common.games.started_at` also records) and, except bananagrams and
codenamesduet, `mode` (the `mode` argument to `create_game`). The rest, by
kind — **setup**: copied from `setup` at create; **board**: drawn or built at
create; **live**: changes during play:

| game | setup | board | live |
|---|---|---|---|
| bananagrams | `hand_size` | `bunch_seed` | `bunch`, `bag` |
| boggle | `min_word_length`, `legal_band`, `win_percent` | `board`, `n`, `required_words`, `bonus_words`, `required_words_count`, `required_words_score` | — |
| codenamesduet | `user_a_id` (the first clue-giver) | `user_b_id`, `key_card_a`, `key_card_b` | `turns_remaining` (starts at `setup.turns`), `turn_number`, `current_clue_giver` |
| connections | `puzzle_id` (when picked) | `board`, `puzzle_date` | — |
| crosswords | `puzzle_id` (library puzzles), `puzzle_date` (NYT) | `meta`, `solution` | — |
| letterboxed | `max_words` (2 + `extra_words`), `legal_band` | `sides`, `playable_words`, `solution` | — |
| psychicnum | — | `words`, `secrets` | — |
| scrabble | `dict_2`, `dict_3plus` | — | `board`, `bag`, `version`, `shared_rack`, `team_score`, `consecutive_passes` |
| setgame | `deck_kind` | `deck` | `deck_pos`, `board` |
| spellingbee, wordwheel | — | `outer_letters`, `center_letter`, `required_words`, `bonus_words`, `required_words_count`, `required_words_score` | — |
| stackdown | `band` (via the board) | `tiles`, `solution`, `board_id` | — |
| strands | `min_word_length`, `hint_cost`, `band`, `puzzle_id` (when picked) | `puzzle_date`, `board`, `clue`, `solution` | — |
| waffle | `max_swaps` (par + `extra_swaps`) | `scramble`, `par_swaps`, `solution` | — |
| wordiply | `difficulty` | `base`, `max_word_length`, `longest_words`, `legal_words` | — |
| wordle | `max_guesses`, `legal_band` | `target` | — |

**`setup` read during play by SQL** — the facts with no column yet:
bananagrams (`peel_count`, `word_check`, `dict_2`, `dict_3plus`,
`dump_count`, `dump_to_bag`), codenamesduet (`turns`: the end status and
`replay_board`), psychicnum (`max_guesses`), spellingbee and wordwheel
(`target_rank`, in six functions each), wordiply (`timer.kind`, in
`_finish_compete`).

## `club_handle` on the game tables

- Only the sixteen `<game>.games` carry it; no child table does.
- **Why it is there:** the migrations say so in six games — so a security
  rule can check `common.is_club_member(club_handle)` without a join.
- **Who reads it:**
  - every `<game>.games` rule, on the row itself;
  - every child-table rule, by joining `<game>.games`. Thirteen of those
    rules also join `common.games` already, for `is_terminal`, and still
    take the club from the game's own row;
  - letterboxed's three definer helpers (`_chain_for`, `_word_count_for`,
    `_covered_for`);
  - `crosswords.library_for_club`, with the indexes `(club_handle,
    puzzle_id)` and `(club_handle, puzzle_date)`;
  - three edge functions (spellingbee, wordwheel and wordiply build-board),
    which read the club's last board to avoid repeating it.
- the fourteen `<game>.games_state` views select `club_handle` and `mode`
  off the game row, and `strands.club_game_status` (which its own comment
  says nothing reads) selects `play_state` and `is_terminal` too;
- the front end's selects: nine games' `hooks/useGame.ts` and the bee pair's
  `makeBeeGame` name `club_handle` (and `mode`) in their select of the game
  row or its `games_state` view and carry both on the game type; what reads
  them downstream is checked per game at the stage that drops the column
  (the page's own is `commonGame.club_handle`). **Correction 2026-09-27:**
  this line used to say nothing in `src/` reads it.
- Its FK to `common.clubs` is `on delete cascade`; `common.games.club_handle`
  is `on delete restrict`, on purpose.
- **The no-op pokes** (`set club_handle = club_handle`) write it only to wake
  the game page's subscription to `<game>.games`, because `common.end_game`
  writes only `common.games`. Every game but codenamesduet, which pokes
  `turn_number`.

## What each summary reads (2026-09-27)

Each manifest's `summaryFor` gets `{id, gametype, play_state, is_terminal,
status, setup}`; every one reads `play_state`, and none reads `is_terminal`.
The shared club code reads `title`, `last_active_at`, `is_current_view` and
`is_terminal` (the row's corner flag), and `gametype` for the manifest.

| game | mode | `status` | `setup` |
|---|---|---|---|
| bananagrams | — | `bunch_remaining`, `winner_username`, `reason` | — |
| boggle | coop | `found_words_count`, `found_words_score`, `reason` | `win_percent` |
| boggle | compete | `top_score`, `winner_username`, `reason` | `win_percent` |
| codenamesduet | — | `found_agents_count`, `turns_remaining`, `reason` | — |
| connections | coop | `found_categories_count`, `mistake_count`, `reason` | — |
| connections | compete | `winner_username`, `reason` | — |
| crosswords | coop | — | — |
| crosswords | compete | `winner_username`, `reason` | — |
| letterboxed | coop | `letters_covered`, `words_used`, `max_words`, `timed_out` | — |
| letterboxed | compete | `leaderboard[0]` (`letters_covered`, `username`), `winner_username`, `timed_out`, `words_used`, `reason` | — |
| psychicnum | coop | `found_secrets_count`, `required_secrets_count`, `guesses_used`, `winner_username`, `reason` | `max_guesses` |
| psychicnum | compete | `winner_username`, `reason` | — |
| scrabble | coop | `team_score`, `bag_count` | — |
| scrabble | compete | `bag_count`, `winner_username`, `winner_score` | — |
| setgame | coop | `sets_found`, `deck_left` | `deck` |
| setgame | compete | `sets_found`, `deck_left`, `leaderboard` (`won`, `username`, `sets_found`), `winner_username`, `reason` | — |
| spellingbee, wordwheel | coop | `found_words_score`, `required_words_score`, `found_words_count`, `required_words_count`, `target_rank`, `reason` | — |
| spellingbee, wordwheel | compete | `target_rank`, `winner_username`, `reason` | — |
| stackdown | coop | `found_words_count`, `required_words_count` | `band` |
| stackdown | compete | `winner_username`, `reason` | `band` |
| strands | coop | `words_found` | — |
| strands | compete | `best_hints`, `reason` | — |
| waffle | coop | `swaps_used`, `max_swaps`, `reason` | `difficulty` |
| waffle | compete | `winner_username`, `winner_swaps`, `reason` | `difficulty` |
| wordiply | coop | `guesses_used`, `length_score`, `letter_count`, `reason` | — |
| wordiply | compete | `reason`, `winner_username`, `leaderboard` (`won`, `length_score`) | — |
| wordle | coop | `guesses_used`, `max_guesses`, `reason` | `answer_band` |
| wordle | compete | `winner_username`, `winner_guesses`, `reason` | `answer_band` |

`title` carries the mid-game line in four games, rewritten during play:
wordle and waffle (coop; compete stays "New compete"), scrabble and
stackdown (coop). The rest set it once at create.

## Where the game reads `status`, `result` and `setup` (2026-09-27)

- **`status`, by the game page:** the verdict (`reason`, `winner_user_id`,
  `winner_username`, letterboxed's `winner_id` and `timed_out`), confetti,
  a `leaderboard` (boggle, letterboxed, setgame, spellingbee, wordwheel,
  wordiply), and bananagrams' live `bunch_remaining` / `bag_remaining`. In
  SQL, only `common.update_state` and `common.end_game` (merging) and
  crosswords' `replay_board` (`title`).
- **`result`:** only the FE — `terminalOutcomeVerb` (`result.won`, in seven
  InfoCols) and strands' PlayArea (`result.won` three times). No SQL reads
  it.
- **`setup`, by the FE during play:**
  - every game but crosswords builds its setup rows from it (`setupRows`,
    the info column and the PDF), and re-sends it for a new game;
  - as game facts: codenamesduet `turns`, psychicnum `max_guesses`,
    spellingbee and wordwheel `target_rank` and the bands, boggle
    `scoring_ladder`, the bands and `dice_set`, setgame `palette`;
  - shared: `useCommonGame` and `GamePage` read `setup.timer`; `setupRows`
    reads `coop_style` and `first_turn_user_id`.

## Prod (read 2026-09-27)

- `is_terminal` disagrees with `ended_at is not null` in 0 rows; `conceded`
  disagrees with `conceded_at is not null` in 0; `paused` is true in 0 of
  2,036 games.
- **One compete game ever**: a scrabble game, `won_compete`, reason
  `complete`. So no played-out compete game, and no reasonless crosswords or
  stackdown compete win, needs a backfill rule.
- No player has conceded or been `locally_terminal` (0 of 2,233), so the
  `player_ended_at` backfill fills nothing.
- The stored `play_state` / `reason` pairs: `won` with `target`, `solved`,
  `cleared` or none (letterboxed); `lost` with `assassin`, `turns`,
  `mistakes`, `exhausted` or `timeout`; `ended` with `manual`, `complete`
  (wordiply) or none (letterboxed's one Stop); `playing` with none.
  letterboxed's rows carry `solved: true` (32 won) and `stopped: true` (1).
- `result` keys in prod: `won`, `score`, `sets_found`, `finished`, and
  `team_rank_idx` / `team_score` on 181 old spellingbee and wordwheel coop
  rows that today's code no longer writes.
