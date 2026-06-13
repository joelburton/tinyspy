-- ============================================================
-- v1 baseline — multi-game shape
-- ============================================================
-- Single squashed baseline for the multi-game architecture. This
-- replaces the earlier single-schema (public) baseline; we're
-- rebuilding the Supabase project from scratch with the new shape,
-- so there's no history to preserve.
--
-- Two schemas are created:
--   common  — shared user-data (profiles) and helpers. Must never
--             reference any game schema.
--   tinyspy — everything Codenames-Duet-specific: tables, RPCs, RLS.
--
-- The `public` schema stays as Postgres's home for things like
-- gen_random_uuid() and any extension-owned objects; we don't add
-- our own tables or RPCs there.
--
-- See docs/naming.md for the full convention. Once this baseline has
-- been applied to a hosted project, do NOT edit it — write new
-- append-only migrations for subsequent schema changes.

-- ============================================================
-- Schemas
-- ============================================================

create schema if not exists common;
create schema if not exists tinyspy;

-- Authenticated users need usage on both schemas so PostgREST can
-- expose tables/RPCs in them. (`public` already grants this by default.)
grant usage on schema common to authenticated;
grant usage on schema tinyspy to authenticated;

-- ============================================================
-- common.profiles: one row per auth user, holds display name.
-- ============================================================
-- Auto-created by the on_auth_user_created trigger below; cascades
-- on auth.users delete. Lives in `common` because every game (and
-- the auth surface itself) needs to know who's signed in and what
-- to call them.

create table common.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table common.profiles enable row level security;

-- INTENTIONAL: any signed-in user can read any profile (display_name
-- only — there is no sensitive data on profiles today). Required for
-- showing opponent display names without per-game indirection. If
-- profile data ever grows sensitive, tighten this to "rows for users
-- I share a game/club with" via a security-definer helper.
create policy profiles_select_authenticated on common.profiles
  for select to authenticated using (true);

create policy profiles_update_own on common.profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, update on common.profiles to authenticated;

-- Materializes a profile row whenever a new auth.users row appears
-- (i.e. after first magic-link login). Default display_name is the
-- part of the email before `@`; the user can edit it via the
-- profiles_update_own policy afterward.
create function common.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = common, public, extensions
as $$
begin
  insert into common.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(nullif(split_part(new.email, '@', 1), ''), 'player')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function common.handle_new_user();

-- ============================================================
-- tinyspy.games and supporting tables
-- ============================================================
-- All game state lives in the tinyspy schema. Cross-schema FKs to
-- common.profiles work because both schemas are owned by `postgres`
-- and exposed by PostgREST.

create table tinyspy.games (
  id uuid primary key default gen_random_uuid(),
  join_code text unique not null,
  status text not null default 'lobby'
    check (status in ('lobby', 'active', 'sudden_death', 'won', 'lost_assassin', 'lost_clock')),
  turns_remaining int not null default 9,
  turn_number int not null default 1,
  current_clue_giver text check (current_clue_giver in ('A', 'B')),
  next_game_id uuid references tinyspy.games(id),
  created_at timestamptz not null default now()
);

create table tinyspy.game_players (
  game_id uuid not null references tinyspy.games(id) on delete cascade,
  -- FK to common.profiles (not auth.users directly) so PostgREST can
  -- auto-embed display_name. profiles cascades from auth.users, so a
  -- user delete still cleans up the chain.
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  seat text not null check (seat in ('A', 'B')),
  -- jsonb array of exactly 25 elements, each 'G' | 'N' | 'A', indexed
  -- 0..24 and matching tinyspy.words.position. Populated by start_game;
  -- null until then. Holds *this seat's* view only — the partner has
  -- their own row with their own view.
  key_card jsonb,
  joined_at timestamptz not null default now(),
  primary key (game_id, seat),
  unique (game_id, user_id)
);

create table tinyspy.word_pool (
  word text primary key
);

create table tinyspy.words (
  game_id uuid not null references tinyspy.games(id) on delete cascade,
  position int not null check (position between 0 and 24),
  word text not null,
  revealed_by text check (revealed_by in ('A', 'B')),
  revealed_as text check (revealed_as in ('G', 'N', 'A')),
  revealed_at timestamptz,
  revealed_in_turn int,
  primary key (game_id, position)
);

create table tinyspy.clues (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references tinyspy.games(id) on delete cascade,
  turn_number int not null,
  by_seat text not null check (by_seat in ('A', 'B')),
  word text not null,
  count int not null check (count >= 0),
  submitted_at timestamptz not null default now(),
  unique (game_id, turn_number)
);

-- ============================================================
-- tinyspy.messages: in-game chat (interim location)
-- ============================================================
-- Chat lives in tinyspy for now because the only authorization we
-- can do today is "is this user a seated player in this game" —
-- which means cross-schema referencing of tinyspy.game_players.
-- Once clubs land, chat moves to common.messages keyed off club_id
-- (membership in common, no cross-schema reach). See docs/naming.md.

create table tinyspy.messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references tinyspy.games(id) on delete cascade,
  -- FK to common.profiles for the same display_name embed reason as
  -- tinyspy.game_players.
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  content text not null check (length(trim(content)) > 0 and length(content) <= 1000),
  sent_at timestamptz not null default now()
);

create index messages_game_id_sent_at_idx
  on tinyspy.messages (game_id, sent_at);

-- ============================================================
-- tinyspy RLS
-- ============================================================

alter table tinyspy.games enable row level security;
alter table tinyspy.game_players enable row level security;
alter table tinyspy.word_pool enable row level security;
alter table tinyspy.words enable row level security;
alter table tinyspy.clues enable row level security;
alter table tinyspy.messages enable row level security;

-- Helper: prevents RLS infinite recursion when game_players policies
-- need to ask "is the caller a player?" security definer bypasses
-- RLS inside the function body. Owned by tinyspy because the question
-- is tinyspy-specific (membership lives in tinyspy.game_players).
-- Other games will define their own equivalent.
create function tinyspy.is_player_in_game(target_game uuid)
returns boolean
language sql
security definer
set search_path = tinyspy, common, public, extensions
stable
as $$
  select exists (
    select 1 from tinyspy.game_players
    where game_id = target_game and user_id = auth.uid()
  );
$$;

create policy games_select on tinyspy.games
  for select to authenticated
  using (tinyspy.is_player_in_game(id));

-- INTENTIONAL: this policy allows any in-game player to read ALL
-- columns of game_players for that game — including the partner's
-- key_card. Client code (useBoard) filters to user_id = self by
-- convention and never asks for the partner's key during play, so
-- it isn't leaked in practice. For a hardened version, drop this in
-- favor of (a) own-row reads on game_players, plus (b) a
-- game_players_roster view (omitting key_card) for lobby/header
-- needs. Deliberately deferred for v1 — see CODE_REVIEW.md item 13.
create policy game_players_select on tinyspy.game_players
  for select to authenticated
  using (tinyspy.is_player_in_game(game_id));

create policy words_select on tinyspy.words
  for select to authenticated
  using (tinyspy.is_player_in_game(game_id));

create policy clues_select on tinyspy.clues
  for select to authenticated
  using (tinyspy.is_player_in_game(game_id));

create policy messages_select on tinyspy.messages
  for select to authenticated
  using (tinyspy.is_player_in_game(game_id));

-- No insert/update/delete policies on any table. All writes go through
-- RPCs. word_pool has no policies at all — only security-definer RPCs
-- read from it.

grant select on tinyspy.games to authenticated;
grant select on tinyspy.game_players to authenticated;
grant select on tinyspy.words to authenticated;
grant select on tinyspy.clues to authenticated;
grant select on tinyspy.messages to authenticated;

-- ============================================================
-- Realtime publication
-- ============================================================
-- supabase_realtime is the publication Realtime listens on. Tables
-- not in the publication won't emit postgres_changes events.

alter publication supabase_realtime add table tinyspy.games;
alter publication supabase_realtime add table tinyspy.game_players;
alter publication supabase_realtime add table tinyspy.words;
alter publication supabase_realtime add table tinyspy.clues;
alter publication supabase_realtime add table tinyspy.messages;

-- ============================================================
-- tinyspy.generate_join_code: internal helper
-- ============================================================

create function tinyspy.generate_join_code()
returns text
language plpgsql
set search_path = tinyspy, common, public, extensions
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- no O/0, no I/1/l
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from tinyspy.games where join_code = code);
  end loop;
  return code;
end;
$$;

revoke execute on function tinyspy.generate_join_code() from public;

-- ============================================================
-- tinyspy lobby RPCs: create_game, join_game
-- ============================================================

create function tinyspy.create_game()
returns table(id uuid, join_code text)
language plpgsql
security definer
set search_path = tinyspy, common, public, extensions
as $$
declare
  new_id uuid;
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  new_code := tinyspy.generate_join_code();

  insert into tinyspy.games (join_code) values (new_code)
  returning games.id into new_id;

  insert into tinyspy.game_players (game_id, user_id, seat)
  values (new_id, auth.uid(), 'A');

  return query select new_id as id, new_code as join_code;
end;
$$;

revoke execute on function tinyspy.create_game() from public;
grant execute on function tinyspy.create_game() to authenticated;

create function tinyspy.join_game(code text)
returns uuid
language plpgsql
security definer
set search_path = tinyspy, common, public, extensions
as $$
declare
  target_id uuid;
  target_status text;
  upper_code text := upper(code);
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  select id, status into target_id, target_status
  from tinyspy.games where join_code = upper_code;

  if target_id is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  -- Idempotent: already a player → return the id (rejoin support).
  if exists (
    select 1 from tinyspy.game_players
    where game_id = target_id and user_id = auth.uid()
  ) then
    return target_id;
  end if;

  if target_status != 'lobby' then
    raise exception 'game already started' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from tinyspy.game_players where game_id = target_id and seat = 'B'
  ) then
    raise exception 'game is full' using errcode = 'P0001';
  end if;

  insert into tinyspy.game_players (game_id, user_id, seat)
  values (target_id, auth.uid(), 'B');

  return target_id;
end;
$$;

revoke execute on function tinyspy.join_game(text) from public;
grant execute on function tinyspy.join_game(text) to authenticated;

-- ============================================================
-- tinyspy.start_game: picks 25 words, generates the Duet key card,
-- flips the game to active. Callable only by a player in the game.
-- ============================================================

create function tinyspy.start_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = tinyspy, common, public, extensions
as $$
declare
  picked_words text[];
  tiles jsonb[];
  a_view text[];
  b_view text[];
  j int;
  tmp jsonb;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tinyspy.game_players
    where game_id = target_game and user_id = auth.uid()
  ) then
    raise exception 'not a player in this game' using errcode = '42501';
  end if;

  -- Serialize concurrent start attempts.
  perform 1 from tinyspy.games where id = target_game for update;

  if not exists (
    select 1 from tinyspy.games where id = target_game and status = 'lobby'
  ) then
    raise exception 'game is not in lobby' using errcode = 'P0001';
  end if;

  if (select count(*) from tinyspy.game_players where game_id = target_game) <> 2 then
    raise exception 'need 2 players to start' using errcode = 'P0001';
  end if;

  select array_agg(word) into picked_words
  from (select word from tinyspy.word_pool order by random() limit 25) sub;

  if array_length(picked_words, 1) <> 25 then
    raise exception 'word_pool must contain at least 25 words' using errcode = 'P0001';
  end if;

  -- Duet key card distribution (25 tiles total):
  --   G/G:3  G/N:5  G/A:1
  --   N/G:5  N/N:7  N/A:1
  --   A/G:1  A/N:1  A/A:1
  tiles := array[]::jsonb[];
  for i in 1..3 loop tiles := tiles || jsonb_build_object('a','G','b','G'); end loop;
  for i in 1..5 loop tiles := tiles || jsonb_build_object('a','G','b','N'); end loop;
  tiles := tiles || jsonb_build_object('a','G','b','A');
  for i in 1..5 loop tiles := tiles || jsonb_build_object('a','N','b','G'); end loop;
  for i in 1..7 loop tiles := tiles || jsonb_build_object('a','N','b','N'); end loop;
  tiles := tiles || jsonb_build_object('a','N','b','A');
  tiles := tiles || jsonb_build_object('a','A','b','G');
  tiles := tiles || jsonb_build_object('a','A','b','N');
  tiles := tiles || jsonb_build_object('a','A','b','A');

  -- Fisher-Yates shuffle.
  for i in reverse 25..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := tiles[i];
    tiles[i] := tiles[j];
    tiles[j] := tmp;
  end loop;

  a_view := array[]::text[];
  b_view := array[]::text[];
  for i in 1..25 loop
    a_view := a_view || (tiles[i]->>'a');
    b_view := b_view || (tiles[i]->>'b');
  end loop;

  for i in 0..24 loop
    insert into tinyspy.words (game_id, position, word)
    values (target_game, i, picked_words[i+1]);
  end loop;

  update tinyspy.game_players
    set key_card = to_jsonb(a_view)
    where game_id = target_game and seat = 'A';

  update tinyspy.game_players
    set key_card = to_jsonb(b_view)
    where game_id = target_game and seat = 'B';

  update tinyspy.games
    set status = 'active', current_clue_giver = 'A'
    where id = target_game;
end;
$$;

revoke execute on function tinyspy.start_game(uuid) from public;
grant execute on function tinyspy.start_game(uuid) to authenticated;

-- ============================================================
-- tinyspy game loop: _end_turn + submit_clue + submit_guess + pass_turn
-- ============================================================

create function tinyspy._end_turn(target_game uuid)
returns void
language plpgsql
security definer
set search_path = tinyspy, common, public, extensions
as $$
declare
  remaining int;
  giver text;
begin
  select turns_remaining, current_clue_giver
    into remaining, giver
    from tinyspy.games where id = target_game for update;

  if remaining <= 1 then
    update tinyspy.games
      set turns_remaining = 0,
          turn_number = turn_number + 1,
          status = 'sudden_death',
          current_clue_giver = case giver when 'A' then 'B' else 'A' end
      where id = target_game;
  else
    update tinyspy.games
      set turns_remaining = remaining - 1,
          turn_number = turn_number + 1,
          current_clue_giver = case giver when 'A' then 'B' else 'A' end
      where id = target_game;
  end if;
end;
$$;

revoke execute on function tinyspy._end_turn(uuid) from public;

-- Parameter is named clue_count (not "count") to avoid shadowing the
-- SQL aggregate function. The matching column on tinyspy.clues stays
-- "count" since it's only ever referenced in column lists, never as
-- a function call.
create function tinyspy.submit_clue(target_game uuid, word text, clue_count int)
returns void
language plpgsql
security definer
set search_path = tinyspy, common, public, extensions
as $$
declare
  giver text;
  game_status text;
  current_turn int;
  caller_seat text;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  select status, current_clue_giver, turn_number
    into game_status, giver, current_turn
    from tinyspy.games where id = target_game for update;

  if game_status is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if game_status <> 'active' then
    raise exception 'clues only allowed during active play' using errcode = 'P0001';
  end if;

  select seat into caller_seat from tinyspy.game_players
    where game_id = target_game and user_id = auth.uid();

  if caller_seat is null then
    raise exception 'not a player in this game' using errcode = '42501';
  end if;

  if caller_seat <> giver then
    raise exception 'not your turn to give a clue' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from tinyspy.clues
    where game_id = target_game and turn_number = current_turn
  ) then
    raise exception 'a clue has already been submitted this turn' using errcode = 'P0001';
  end if;

  insert into tinyspy.clues (game_id, turn_number, by_seat, word, count)
  values (target_game, current_turn, caller_seat, word, clue_count);
end;
$$;

revoke execute on function tinyspy.submit_clue(uuid, text, int) from public;
grant execute on function tinyspy.submit_clue(uuid, text, int) to authenticated;

create function tinyspy.submit_guess(target_game uuid, target_position int)
returns text  -- returns the revealed label ('G' | 'N' | 'A') for caller convenience
language plpgsql
security definer
set search_path = tinyspy, common, public, extensions
as $$
declare
  game_status text;
  giver text;
  current_turn int;
  caller_seat text;
  key_owner_seat text;
  key_card jsonb;
  revealed_label text;
  green_total int;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  if target_position < 0 or target_position > 24 then
    raise exception 'position must be 0..24' using errcode = 'P0001';
  end if;

  select status, current_clue_giver, turn_number
    into game_status, giver, current_turn
    from tinyspy.games where id = target_game for update;

  if game_status is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if game_status not in ('active', 'sudden_death') then
    raise exception 'game is not in a guessable state' using errcode = 'P0001';
  end if;

  select seat into caller_seat from tinyspy.game_players
    where game_id = target_game and user_id = auth.uid();

  if caller_seat is null then
    raise exception 'not a player in this game' using errcode = '42501';
  end if;

  -- Whose key view labels this reveal? This is the most subtle rule
  -- in Duet.
  --
  -- During active play: the clue-giver's view. A green agent on the
  -- clue-giver's side counts toward the 15; a neutral on their side
  -- ends the turn; an assassin on their side ends the game. The
  -- guesser's own view does NOT matter for this reveal — the guess
  -- is in response to the clue-giver's clue, so the clue-giver's
  -- labels apply.
  --
  -- In sudden death: there is no clue-giver, but guesses are "from
  -- memory of past clues", and those clues came from the partner. So
  -- we still use the partner's view (the seat opposite to the caller).
  if game_status = 'active' then
    if caller_seat = giver then
      raise exception 'you are the clue-giver this turn' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from tinyspy.clues
      where game_id = target_game and turn_number = current_turn
    ) then
      raise exception 'waiting for clue this turn' using errcode = 'P0001';
    end if;
    key_owner_seat := giver;
  else
    -- sudden_death: either player may guess; the partner's key labels
    -- the reveal.
    key_owner_seat := case caller_seat when 'A' then 'B' else 'A' end;
  end if;

  if exists (
    select 1 from tinyspy.words
    where game_id = target_game and position = target_position and revealed_as is not null
  ) then
    raise exception 'cell already revealed' using errcode = 'P0001';
  end if;

  select gp.key_card into key_card from tinyspy.game_players gp
    where gp.game_id = target_game and gp.seat = key_owner_seat;

  revealed_label := key_card ->> target_position;

  update tinyspy.words
    set revealed_as = revealed_label,
        revealed_by = caller_seat,
        revealed_at = now(),
        revealed_in_turn = current_turn
    where game_id = target_game and position = target_position;

  if revealed_label = 'A' then
    update tinyspy.games set status = 'lost_assassin', current_clue_giver = null
      where id = target_game;
    return revealed_label;
  end if;

  if game_status = 'sudden_death' and revealed_label <> 'G' then
    update tinyspy.games set status = 'lost_clock', current_clue_giver = null
      where id = target_game;
    return revealed_label;
  end if;

  if revealed_label = 'G' then
    select count(*) into green_total from tinyspy.words
      where game_id = target_game and revealed_as = 'G';
    if green_total >= 15 then
      update tinyspy.games set status = 'won', current_clue_giver = null
        where id = target_game;
    end if;
    return revealed_label;
  end if;

  perform tinyspy._end_turn(target_game);
  return revealed_label;
end;
$$;

revoke execute on function tinyspy.submit_guess(uuid, int) from public;
grant execute on function tinyspy.submit_guess(uuid, int) to authenticated;

create function tinyspy.pass_turn(target_game uuid)
returns void
language plpgsql
security definer
set search_path = tinyspy, common, public, extensions
as $$
declare
  game_status text;
  giver text;
  current_turn int;
  caller_seat text;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  select status, current_clue_giver, turn_number
    into game_status, giver, current_turn
    from tinyspy.games where id = target_game for update;

  if game_status is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if game_status <> 'active' then
    raise exception 'can only pass during active play' using errcode = 'P0001';
  end if;

  select seat into caller_seat from tinyspy.game_players
    where game_id = target_game and user_id = auth.uid();

  if caller_seat is null then
    raise exception 'not a player in this game' using errcode = '42501';
  end if;

  if caller_seat = giver then
    raise exception 'clue-giver cannot pass — submit a clue first' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from tinyspy.clues
    where game_id = target_game and turn_number = current_turn
  ) then
    raise exception 'waiting for clue this turn' using errcode = 'P0001';
  end if;

  perform tinyspy._end_turn(target_game);
end;
$$;

revoke execute on function tinyspy.pass_turn(uuid) from public;
grant execute on function tinyspy.pass_turn(uuid) to authenticated;

-- ============================================================
-- tinyspy.play_again: from a finished game, spin up a fresh game
-- and pre-seat both players. Idempotent on next_game_id.
-- ============================================================

create function tinyspy.play_again(prev_game uuid)
returns table(id uuid, join_code text)
language plpgsql
security definer
set search_path = tinyspy, common, public, extensions
as $$
declare
  prev_status text;
  prev_next uuid;
  prev_code text;
  new_id uuid;
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  select status, next_game_id
    into prev_status, prev_next
    from tinyspy.games where prev_game = games.id for update;

  if prev_status is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if prev_status not in ('won', 'lost_assassin', 'lost_clock') then
    raise exception 'previous game has not ended' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from tinyspy.game_players
    where game_id = prev_game and user_id = auth.uid()
  ) then
    raise exception 'not a player in this game' using errcode = '42501';
  end if;

  -- Idempotent: another player already created the next game.
  if prev_next is not null then
    select g.join_code into prev_code from tinyspy.games g where g.id = prev_next;
    return query select prev_next as id, prev_code as join_code;
    return;
  end if;

  new_code := tinyspy.generate_join_code();
  insert into tinyspy.games (join_code) values (new_code) returning games.id into new_id;

  -- Carry both players over with the same seats (predictable; no role swap).
  insert into tinyspy.game_players (game_id, user_id, seat)
  select new_id, user_id, seat
  from tinyspy.game_players
  where game_id = prev_game;

  update tinyspy.games set next_game_id = new_id where games.id = prev_game;

  return query select new_id as id, new_code as join_code;
end;
$$;

revoke execute on function tinyspy.play_again(uuid) from public;
grant execute on function tinyspy.play_again(uuid) to authenticated;

-- ============================================================
-- tinyspy.send_message: post a chat message to a game's chat log.
-- ============================================================
-- Lives in tinyspy (not common) for the interim — see the comment
-- above tinyspy.messages. Authorization is "must be a seated player
-- in this game"; trimmed content must be 1–1000 chars.

create function tinyspy.send_message(target_game uuid, content text)
returns void
language plpgsql
security definer
set search_path = tinyspy, common, public, extensions
as $$
declare
  trimmed text := trim(content);
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tinyspy.game_players
    where game_id = target_game and user_id = auth.uid()
  ) then
    raise exception 'not a player in this game' using errcode = '42501';
  end if;

  if length(trimmed) = 0 then
    raise exception 'message must not be empty' using errcode = 'P0001';
  end if;

  if length(trimmed) > 1000 then
    raise exception 'message too long (max 1000 chars)' using errcode = 'P0001';
  end if;

  insert into tinyspy.messages (game_id, user_id, content)
  values (target_game, auth.uid(), trimmed);
end;
$$;

revoke execute on function tinyspy.send_message(uuid, text) from public;
grant execute on function tinyspy.send_message(uuid, text) to authenticated;

-- ============================================================
-- tinyspy.get_clue_context: read-only RPC returning the data the
-- "suggest a clue" Edge Function needs to ask Anthropic.
-- ============================================================
-- Returns a jsonb object with:
--   greens:         text[]  — caller's unrevealed green agents
--   neutrals:       text[]  — caller's unrevealed neutrals (avoid)
--   assassin:       text    — caller's unrevealed assassin (avoid),
--                              or null if it's already revealed
--   previous_clues: array of {word, count, by_seat, turn_number}
--
-- Authorization: caller must be the current clue-giver of an active
-- (or sudden-death) game. We do the check here so the Edge Function
-- can stay a thin orchestrator; it gets back either a clean context
-- or a clean rejection.

create function tinyspy.get_clue_context(target_game uuid)
returns jsonb
language plpgsql
security definer
set search_path = tinyspy, common, public, extensions
stable
as $$
declare
  caller_seat text;
  game_status text;
  current_giver text;
  caller_key jsonb;
  ctx jsonb;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  -- Pull seat + game state in one shot.
  select gp.seat, g.status, g.current_clue_giver, gp.key_card
    into caller_seat, game_status, current_giver, caller_key
    from tinyspy.game_players gp
    join tinyspy.games g on g.id = gp.game_id
    where gp.game_id = target_game and gp.user_id = auth.uid();

  if caller_seat is null then
    raise exception 'not a player in this game' using errcode = '42501';
  end if;

  if game_status not in ('active', 'sudden_death') then
    raise exception 'no suggestions outside of active play' using errcode = 'P0001';
  end if;

  if caller_seat is distinct from current_giver then
    raise exception 'only the current clue-giver can request a suggestion'
      using errcode = 'P0001';
  end if;

  -- Build the context object. Each of the three category lookups uses
  -- the caller's key view (caller_key) indexed by w.position. `->>`
  -- returns the label as text ('G' | 'N' | 'A').
  select jsonb_build_object(
    'greens', coalesce((
      select jsonb_agg(w.word order by w.position)
      from tinyspy.words w
      where w.game_id = target_game
        and w.revealed_as is null
        and (caller_key->>w.position) = 'G'
    ), '[]'::jsonb),
    'neutrals', coalesce((
      select jsonb_agg(w.word order by w.position)
      from tinyspy.words w
      where w.game_id = target_game
        and w.revealed_as is null
        and (caller_key->>w.position) = 'N'
    ), '[]'::jsonb),
    'assassin', (
      select w.word
      from tinyspy.words w
      where w.game_id = target_game
        and w.revealed_as is null
        and (caller_key->>w.position) = 'A'
      limit 1
    ),
    'previous_clues', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'word', c.word,
          'count', c.count,
          'by_seat', c.by_seat,
          'turn_number', c.turn_number
        ) order by c.turn_number
      )
      from tinyspy.clues c
      where c.game_id = target_game
    ), '[]'::jsonb)
  ) into ctx;

  return ctx;
end;
$$;

revoke execute on function tinyspy.get_clue_context(uuid) from public;
grant execute on function tinyspy.get_clue_context(uuid) to authenticated;
