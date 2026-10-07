-- cs-unmet

-- ============================================================
-- wordleone — Wordle in 1 (WordNerdier): the shape
-- ============================================================
--
-- One starter word already scored against a hidden answer, and the answer is
-- the only word at or below the game's legal band that makes those colors.
-- Guesses are unlimited: a legal wrong word is a MISS, counted and logged
-- with no colors; the answer is the solve. The puzzle is built by the
-- `wordleone-build-board` edge function and re-checked by `create_game`.
-- plans/wordleone.md is the design.
--
-- Shape only; the functions, policies and grants are supabase/sql/'s
-- (docs/supabase.md → Schema vs code).

create schema if not exists wordleone;

-- ============================================================
-- wordleone.games — one row per game
-- ============================================================
-- `target` is the answer, hidden by the column grant in supabase/sql/.
-- `starter` and `starter_colors` are the half of the puzzle every player
-- sees. `difficulty` is the tier the puzzle was built to (the setup key of
-- the same name), kept for the summary line.
create table wordleone.games (
  game_id        uuid primary key references common.games(id) on delete cascade,
  starter        char(5) not null,
  starter_colors char(5) not null
    check (starter_colors ~ '^[gyx]{5}$' and starter_colors <> 'ggggg'),
  target         char(5) not null,
  legal_band     int not null check (legal_band between 1 and 6),
  difficulty     text not null check (difficulty in ('easy', 'medium', 'hard', 'any'))
);

alter table wordleone.games enable row level security;

-- ============================================================
-- wordleone.players — one row per player
-- ============================================================
-- `n_misses` is the player's own count in both modes; coop's team count is
-- summed when the blobs are built. A solve is `common.game_players.solved_at`.
create table wordleone.players (
  game_id  uuid not null references wordleone.games(game_id) on delete cascade,
  user_id  uuid not null references common.profiles(user_id) on delete cascade,
  n_misses int not null default 0,
  primary key (game_id, user_id)
);

create index wordleone_players_game_id_idx on wordleone.players (game_id);

alter table wordleone.players enable row level security;

-- ============================================================
-- wordleone.events — the guess log
-- ============================================================
-- The events skeleton (docs/supabase.md → Every game's log is
-- `<game>.events`) plus the guess. Only the solve has colors; a miss is
-- logged uncolored, so `colors` is null exactly when `is_correct` is false.
-- A soft reject (not a word, already guessed) writes nothing.
create table wordleone.events (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references wordleone.games(game_id) on delete cascade,
  user_id    uuid not null references common.profiles(user_id) on delete cascade,
  kind       text not null check (kind in ('guess')),
  took_turn  boolean not null default false,
  created_at timestamptz not null default now(),
  word       char(5) not null,
  colors     char(5),
  is_correct boolean not null,
  check ((is_correct and colors = 'ggggg') or (not is_correct and colors is null))
);

create index wordleone_events_game_id_id_idx on wordleone.events (game_id, id);

alter table wordleone.events enable row level security;

-- ============================================================
-- Register the gametypes
-- ============================================================
-- The coop/compete pair, in the shape 20260615000000_common.sql's
-- convention gives.
insert into common.gametypes (gametype, min_players, brand) values
  ('wordleone_coop', 1, 'WordNerdier'),
  ('wordleone_compete', 2, 'WordNerdier')
on conflict do nothing;

-- Every existing club gets a row for each, since a missing
-- `clubs_gametypes` row is a disabled game (20261007000002_paw_protection).
-- Enabled by `common._default_gametypes_for_club`'s rule, written out here
-- because a migration cannot call supabase/sql/: a default-enrolled
-- gametype, except one that needs two players in a solo club.
insert into common.clubs_gametypes (club_handle, gametype, is_enabled)
select c.handle,
       g.gametype,
       g.default_enroll and (not c.is_solo or g.min_players <= 1)
  from common.clubs c
 cross join common.gametypes g
 where g.gametype in ('wordleone_coop', 'wordleone_compete')
on conflict (club_handle, gametype) do nothing;
