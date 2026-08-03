-- ============================================================
-- waffle — Waffle-style swap-to-solve puzzle
-- ============================================================
--
-- A 5×5 lattice of 6 interlocking 5-letter words (3 across on rows
-- 0/2/4, 3 down on cols 0/2/4). Every correct letter is on the board
-- but scrambled; players SWAP tile pairs to solve within a budget,
-- with Wordle-style green/yellow/gray feedback. Codename `waffle`
-- everywhere in code; the user-facing brand lives only in the FE
-- manifest (see docs/naming.md).
--
-- See docs/games/waffle.md for the full design (schema, RPCs,
-- coop/compete terminal logic, the on-demand board generation).

create schema if not exists waffle;

-- ============================================================
-- waffle.games — one row per playthrough
-- ============================================================
-- Boards are generated on demand by the `waffle-build-board` edge
-- function (no pre-generated puzzle library) and stored here, so the
-- game is self-contained. `solution` is the answer key — HIDDEN via a
-- column-level grant and revealed only post-terminal through
-- games_state (the spellingbee/psychicnum hidden-answer pattern).
-- `scramble` is the starting board (public).
create table waffle.games (
  id          uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  -- Sibling-manifest mode axis; agrees with the gametype string
  -- ('waffle_coop' / 'waffle_compete') by construction in create_game.
  mode        text not null check (mode in ('coop', 'compete')),
  scramble    char(25) not null,   -- starting board, holes '.'
  par_swaps   int not null,        -- minimum swaps to solve (from the build)
  max_swaps   int not null,        -- par + extra (the swap budget)
  solution    char(25) not null,   -- HIDDEN answer key
  created_at  timestamptz not null default now()
);

create index waffle_games_club_handle_idx on waffle.games (club_handle);

alter table waffle.games enable row level security;

-- ============================================================
-- waffle.players — per-player working state
-- ============================================================
-- One row per player. `board` is the player's current arrangement,
-- starting equal to the scramble. In COOP every row is kept identical
-- and updated in lock-step on each swap (mirrors connections.players);
-- in COMPETE each row moves independently. `solved` / `solved_at`
-- drive the compete fewest-swaps + earliest-time tie-break.
create table waffle.players (
  game_id    uuid not null references waffle.games(id) on delete cascade,
  user_id    uuid not null references common.profiles(user_id) on delete cascade,
  board      char(25) not null,
  swaps_used int not null default 0,
  solved     boolean not null default false,
  solved_at  timestamptz,
  primary key (game_id, user_id)
);

create index waffle_players_game_id_idx on waffle.players (game_id);

alter table waffle.players enable row level security;

-- ============================================================
-- waffle.swaps — the per-swap move log (coop only)
-- ============================================================
-- One row per swap, the shared move history other games keep (cf.
-- psychicnum.guesses, connections's guess log). Written ONLY in coop:
-- there the board is shared and public, so the whole log is club-
-- readable and the FE renders it during and after the game. Compete
-- never writes here — an opponent's swap sequence would leak the
-- deductions their hidden board is meant to protect — and the FE hides
-- the log in compete anyway.
--
-- `seq` is the coop shared swap count after the move (1-based),
-- which the games-row `for update` lock in submit_swap keeps sequential
-- and collision-free. `letter_a` / `letter_b` are the letters that sat
-- on `pos_a` / `pos_b` *before* the swap — stored (not derived) so the
-- log is self-contained as the board moves on.
create table waffle.swaps (
  game_id    uuid not null references waffle.games(id) on delete cascade,
  user_id    uuid not null references common.profiles(user_id) on delete cascade,
  seq int  not null,          -- 1-based ordinal within the game
  pos_a      int  not null,          -- 0..24
  pos_b      int  not null,          -- 0..24
  letter_a   char(1) not null,       -- letter on pos_a before the swap
  letter_b   char(1) not null,       -- letter on pos_b before the swap
  swapped_at timestamptz not null default now(),
  -- user_id is in the key because `seq` is the CALLER's swap count
  -- (p_swaps + 1), not a game-wide ordinal. Coop's rows move in lock-step so
  -- it happens to be game-wide there; in compete each player counts
  -- independently, and without user_id two players' swap #3 would collide.
  primary key (game_id, user_id, seq)
);

create index waffle_swaps_game_id_idx on waffle.swaps (game_id);

alter table waffle.swaps enable row level security;

-- Realtime: coop sees the shared board update live; the in-game
-- subscription is on waffle.{games, players, swaps}.
alter publication supabase_realtime add table waffle.games;
alter publication supabase_realtime add table waffle.players;
alter publication supabase_realtime add table waffle.swaps;

-- ============================================================
-- Register the gametype(s)
-- ============================================================
-- The sibling-manifest pair: coop (shared board, lock-step) and
-- compete (own board each, fewest-swaps winner).
-- `hides_solution`: this game keeps its answer covered when a game ends without
-- a win, so a replay of the same board is a genuine second try. The players
-- open it with the terminal Reveal (common.reveal_solution). See
-- common.md → Revealing the solution.
insert into common.gametypes (gametype, min_players, hides_solution) values
  ('waffle_coop', 1, true),
  ('waffle_compete', 2, true)
on conflict do nothing;
