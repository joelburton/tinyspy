-- cs-unmet

-- ============================================================
-- wordsy — Gil Hova's Wordsy (FlipWord): the shape
-- ============================================================
--
-- Eight faceup consonant cards in four columns worth 5, 4, 3 and 2. Every
-- player writes one word at once; only the faceup letters score. The first
-- submit of a round starts a 30-second clock, and when it runs out every word
-- is revealed and scored. Seven rounds, best five plus the bonuses.
-- plans/wordsy.md is the design.
--
-- Shape only; the functions, policies and grants are supabase/sql/'s
-- (docs/supabase.md → Schema vs code).

create schema if not exists wordsy;

-- ============================================================
-- wordsy.games — one row per game
-- ============================================================
-- A card is its deck number, 1–60, and the number says its letter and kind
-- (plans/wordsy.md → The game, in the app's terms). `deck` is the frozen
-- shuffle of all 60, withheld by the column grant in supabase/sql/: nothing
-- shows which cards come next. `drawn` is the numbers dealt so far, in order;
-- a deal takes the first number in `deck` not yet in `drawn` that the rules
-- of two allow, so a card they refuse waits in its place rather than being
-- thrown away.
create table wordsy.games (
  game_id     uuid primary key references common.games(id) on delete cascade,
  deck        smallint[] not null check (cardinality(deck) = 60),
  drawn       smallint[] not null default '{}' check (cardinality(drawn) <= 60),
  legal_band  int not null check (legal_band between 1 and 6),
  round_style text not null check (round_style in ('timer', 'no-timer'))
);

alter table wordsy.games enable row level security;

-- ============================================================
-- wordsy.players — one row per player
-- ============================================================
-- No counts: a player's total is summed off wordsy.events when the blobs are
-- built. The row is what the rounds' player references point at.
create table wordsy.players (
  game_id uuid not null references wordsy.games(game_id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  primary key (game_id, user_id)
);

create index wordsy_players_game_id_idx on wordsy.players (game_id);

alter table wordsy.players enable row level security;

-- ============================================================
-- wordsy.rounds — one row per round dealt
-- ============================================================
-- `tiles` is the round's table in slot order: slots 1–2 under the 5, 3–4
-- under the 4, 5–6 under the 3, 7–8 under the 2. Fixed once dealt.
--
-- `fastest_user_id` is the Fastest Wordsmith, null until the first submit of
-- a `timer` round; in a `no-timer` round it is the First Wordsmith, named at
-- the deal. `no_flip_user_id` holds the No Flip card: the player who may not
-- start this round's clock. `timer_started_at` is the first submit;
-- `ended_at` the round's end.
create table wordsy.rounds (
  game_id          uuid not null references wordsy.games(game_id) on delete cascade,
  num              int not null check (num between 1 and 7),
  tiles            smallint[] not null
    check (cardinality(tiles) = 8 and 1 <= all(tiles) and 60 >= all(tiles)),
  fastest_user_id  uuid,
  no_flip_user_id  uuid,
  timer_started_at timestamptz,
  ended_at         timestamptz,
  primary key (game_id, num),
  foreign key (game_id, fastest_user_id)
    references wordsy.players(game_id, user_id) on delete cascade,
  foreign key (game_id, no_flip_user_id)
    references wordsy.players(game_id, user_id) on delete cascade
);

alter table wordsy.rounds enable row level security;

-- ============================================================
-- wordsy.round_words — each player's standing word, this round
-- ============================================================
-- The working table: a submit that stands writes the row, and a later one
-- replaces it, except the Fastest's, which is frozen. Private until the
-- round ends, when the reveal copies each word into wordsy.events.
create table wordsy.round_words (
  game_id      uuid not null,
  num          int not null,
  user_id      uuid not null,
  word         text not null check (word ~ '^[a-z]{1,45}$'),
  submitted_at timestamptz not null default now(),
  primary key (game_id, num, user_id),
  foreign key (game_id, num)
    references wordsy.rounds(game_id, num) on delete cascade,
  foreign key (game_id, user_id)
    references wordsy.players(game_id, user_id) on delete cascade
);

alter table wordsy.round_words enable row level security;

-- ============================================================
-- wordsy.events — the reveal log
-- ============================================================
-- The events skeleton (docs/supabase.md → Every game's log is
-- `<game>.events`) plus the round's word. One row per player still playing
-- per finished round, written together at the round's end in seat order.
-- `word` is '' for a player who submitted nothing; `score` is the word's
-- against the round's table, `bonus` what the round's bonuses gave.
create table wordsy.events (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references wordsy.games(game_id) on delete cascade,
  user_id    uuid not null references common.profiles(user_id) on delete cascade,
  kind       text not null check (kind in ('word')),
  took_turn  boolean not null default false,
  created_at timestamptz not null default now(),
  num        int not null check (num between 1 and 7),
  word       text not null check (word ~ '^[a-z]{0,45}$'),
  score      int not null check (score >= 0),
  bonus      int not null check (bonus between 0 and 4),
  unique (game_id, num, user_id)
);

create index wordsy_events_game_id_id_idx on wordsy.events (game_id, id);

alter table wordsy.events enable row level security;

-- ============================================================
-- Register the gametype
-- ============================================================
-- Compete only (plans/wordsy.md, decision 1); `_compete` so a coop sibling
-- lands beside it without renaming stored rows (decision 13).
insert into common.gametypes (gametype, min_players, brand) values
  ('wordsy_compete', 2, 'FlipWord')
on conflict do nothing;

-- Every existing club gets a row, since a missing `clubs_gametypes` row is a
-- disabled game (20261007000002_paw_protection). Enabled by
-- `common._default_gametypes_for_club`'s rule, written out here because a
-- migration cannot call supabase/sql/: a default-enrolled gametype, except
-- one that needs two players in a solo club.
insert into common.clubs_gametypes (club_handle, gametype, is_enabled)
select c.handle,
       g.gametype,
       g.default_enroll and (not c.is_solo or g.min_players <= 1)
  from common.clubs c
 cross join common.gametypes g
 where g.gametype = 'wordsy_compete'
on conflict (club_handle, gametype) do nothing;
