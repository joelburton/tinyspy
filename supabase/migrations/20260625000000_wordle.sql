-- ============================================================
-- wordle — NYT-Wordle-style guess-the-word game
-- ============================================================
--
-- A hidden 5-letter target; players type 5-letter guesses and get
-- per-letter feedback — green (right letter, right spot), yellow (in
-- the word, wrong spot), gray (not in the word). Win by guessing the
-- word within the budget (5–8 guesses, default 6).
--
-- "wordle" is the codename used in SQL, TypeScript, and folder names.
-- The user-facing brand lives only in the FE manifest (see
-- docs/naming.md for the codename-vs-brand split).
--
-- Coop + compete ship as a sibling-manifest pair (`wordle_coop` +
-- `wordle_compete` gametypes, a denormalized `mode` column on
-- wordle.games, and a `mode` arg on create_game) — same pattern
-- waffle/spellingbee/connections/psychicnum follow.
--   - Coop: ONE shared board. Either player guesses; the guess (and its
--     colors) is visible to all once submitted. The guess budget is
--     shared by the team.
--   - Compete: same target, independent boards. Players don't see each
--     other's guesses until the game ends. Winner = fewest guesses,
--     tie-break earliest solve.
--
-- The structure is waffle's hidden-answer pattern (a HIDDEN `target`,
-- revealed post-terminal via games_state) plus spellingbee's per-guess log
-- with mode-aware RLS (compete hides opponents' guesses). The target is
-- drawn per the chosen `answer_source` (0 = the curated Wordle answer
-- list, 1..6 = a difficulty band of common.words); guesses are validated
-- against the `legal_guess` band (1..6, default 4). Boards aren't
-- pre-generated.
--
-- Depends on `common` (clubs, profiles, games, game_players, words,
-- is_club_member, gametypes, create_game, update_state, end_game,
-- require_club_member, require_game_player, require_player_count_max,
-- require_valid_timer). Per the removability invariant, common MUST NOT
-- reference wordle back.
--
-- See docs/games/wordle.md for the full feature picture.

-- ============================================================
-- Schema + usage grants
-- ============================================================
create schema if not exists wordle;

-- ============================================================
-- Wordle coloring moved to common.wordle_colors
-- ============================================================
-- The per-word green/yellow/gray algorithm now lives once in
-- common.wordle_colors (shared with waffle). submit_guess calls it directly.

-- ============================================================
-- wordle.games — one row per playthrough
-- ============================================================
-- `target` is the answer key — HIDDEN via a column-level grant and
-- revealed only post-terminal through games_state (the
-- waffle/spellingbee/psychicnum hidden-answer pattern). `max_guesses` is
-- the budget; in coop it's shared by the team, in compete it's each
-- player's own.
create table wordle.games (
  id          uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  -- Sibling-manifest mode axis; agrees with the gametype string
  -- ('wordle_coop' / 'wordle_compete') by construction in create_game.
  mode        text not null check (mode in ('coop', 'compete')),
  target      char(5) not null,    -- HIDDEN answer key
  max_guesses int not null,        -- guess budget (5..8)
  -- A guess is legal iff it's a real 5-letter word of difficulty ≤ this band
  -- (setup.legal_guess, 1..6). Stored here so submit_guess reads it off the
  -- locked games row. (answer_source isn't kept — it's only used to pick the
  -- target at create time.)
  legal_guess int not null default 4,
  created_at  timestamptz not null default now()
);

create index wordle_games_club_handle_idx on wordle.games (club_handle);

alter table wordle.games enable row level security;

-- ============================================================
-- wordle.players — per-player working state
-- ============================================================
-- One row per player. In COOP every row is kept identical and updated
-- in lock-step on each guess (shared budget + shared solved flag);
-- in COMPETE each row moves independently. `solved` / `solved_at` drive
-- the compete fewest-guesses + earliest-time tie-break.
create table wordle.players (
  game_id      uuid not null references wordle.games(id) on delete cascade,
  user_id      uuid not null references common.profiles(user_id) on delete cascade,
  guesses_used int not null default 0,
  solved       boolean not null default false,
  solved_at    timestamptz,
  primary key (game_id, user_id)
);

create index wordle_players_game_id_idx on wordle.players (game_id);

alter table wordle.players enable row level security;

-- ============================================================
-- wordle.guesses — the per-guess log
-- ============================================================
-- One row per accepted (valid, non-duplicate) guess. `colors` is the
-- 5-char g/y/x feedback computed at submit time. Coop: a shared
-- sequence — every member sees every guess. Compete: per-player; the
-- RLS policy hides opponents' rows until the game is terminal (the
-- end-of-game reveal). `seq` is the guesser's 1-based count;
-- in coop it's the shared team count.
create table wordle.guesses (
  game_id     uuid not null references wordle.games(id) on delete cascade,
  user_id     uuid not null references common.profiles(user_id) on delete cascade,
  seq int not null,          -- 1-based; coop = shared team count
  guess       char(5) not null,
  colors      char(5) not null,      -- g/y/x per letter
  is_correct  boolean not null,
  guessed_at  timestamptz not null default now(),
  primary key (game_id, user_id, seq)
);

create index wordle_guesses_game_id_idx on wordle.guesses (game_id);

alter table wordle.guesses enable row level security;

-- No INSERT/UPDATE/DELETE policies anywhere — writes go through the
-- security-definer RPCs below.

-- Realtime: coop sees the shared board update live; compete sees the
-- opponent progress strip (players) tick. Subscription is on
-- wordle.{games, players, guesses}.
alter publication supabase_realtime add table wordle.games;
alter publication supabase_realtime add table wordle.players;
alter publication supabase_realtime add table wordle.guesses;

-- ============================================================
-- Register the gametype(s)
-- ============================================================
-- The sibling-manifest pair: coop (shared board, solo allowed) and
-- compete (own board each, fewest-guesses winner — needs ≥2).
-- `hides_solution`: this game keeps its answer covered when a game ends without
-- a win, so a replay of the same board is a genuine second try. The players
-- open it with the terminal Reveal (common.reveal_solution). See
-- common.md → Revealing the solution.
insert into common.gametypes (gametype, min_players, hides_solution) values
  ('wordle_coop', 1, true),
  ('wordle_compete', 2, true)
on conflict do nothing;
