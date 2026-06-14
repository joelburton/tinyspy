-- ============================================================
-- tinyspy schema — baseline
-- ============================================================
--
-- Squashed: a single migration that brings the `tinyspy` schema to
-- its current shape in one shot. Replaces the original two-step
-- progression (initial baseline with join-code lobby flow →
-- tinyspy_to_clubs atomic flip), now that the schema is stable
-- enough to flatten into a clean starting point. Read the git
-- history for the narrative — what's preserved here is the end
-- state and the teaching commentary worth keeping.
--
-- Tinyspy is Codenames Duet for two: a cooperative word-guessing
-- game played by exactly two club members. See docs/duet-rules.md
-- for the rules; the RPCs in this file are the canonical
-- implementation.
--
-- Depends on `common` (clubs, profiles, club_active_game,
-- is_club_member). Per the removability invariant in
-- docs/naming.md, common MUST NOT reference tinyspy back.
--
-- Per the alpha-software prior in CLAUDE.md, schema changes after
-- this baseline are written as new timestamped migrations, not as
-- edits to this file.

-- ============================================================
-- Schema + usage grant
-- ============================================================

create schema if not exists tinyspy;
grant usage on schema tinyspy to authenticated;

-- ============================================================
-- tinyspy.games
-- ============================================================
-- Every game belongs to a club (the 2-member-club requirement is
-- enforced at create_game time, not by the schema — the FK is
-- just "must exist and not be deleted"). Status starts at
-- 'active' since there's no lobby state under the club model;
-- both members are seated immediately on create_game.

create table tinyspy.games (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references common.clubs(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'sudden_death', 'won', 'lost_assassin', 'lost_clock')),
  turns_remaining int not null default 9,
  turn_number int not null default 1,
  current_clue_giver text check (current_clue_giver in ('A', 'B')),
  next_game_id uuid references tinyspy.games(id),
  created_at timestamptz not null default now()
);

create index games_club_id_idx on tinyspy.games (club_id);

-- ============================================================
-- tinyspy.game_players
-- ============================================================
-- Two rows per game (seat 'A' and seat 'B'). FK to common.profiles
-- (not auth.users directly) so the FK relationship lives between
-- two schemas the FE addresses through PostgREST.

create table tinyspy.game_players (
  game_id uuid not null references tinyspy.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  seat text not null check (seat in ('A', 'B')),
  -- jsonb array of exactly 25 elements, each 'G' | 'N' | 'A',
  -- indexed 0..24 and matching tinyspy.words.position. Populated
  -- by create_game at game-creation time. Holds *this seat's*
  -- view only — the partner has their own row with their own view.
  key_card jsonb,
  joined_at timestamptz not null default now(),
  primary key (game_id, seat),
  unique (game_id, user_id)
);

-- ============================================================
-- tinyspy.word_pool — source of words to pick 25 from
-- ============================================================
-- The actual word data is inserted at the bottom of this file
-- (after all the schema is in place, so a partial replay can't
-- leave the table empty if it crashed mid-RPC-creation).

create table tinyspy.word_pool (
  word text primary key
);

-- ============================================================
-- tinyspy.words — the 25 words drawn at game-create time
-- ============================================================
-- Per-game per-position record of which word is at which board
-- position, plus reveal state (set by submit_guess).

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

-- ============================================================
-- tinyspy.clues — append-only log of clues given
-- ============================================================
-- Unique constraint on (game_id, turn_number) means one clue per
-- turn, which submit_clue checks explicitly with a clearer error
-- message before the constraint would fire.

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
-- RLS
-- ============================================================

alter table tinyspy.games enable row level security;
alter table tinyspy.game_players enable row level security;
alter table tinyspy.word_pool enable row level security;
alter table tinyspy.words enable row level security;
alter table tinyspy.clues enable row level security;

-- Helper: prevents RLS infinite recursion when game_players
-- policies need to ask "is the caller a player?" — security
-- definer bypasses RLS inside the function body. The question is
-- tinyspy-specific (membership lives in tinyspy.game_players);
-- other games define their own equivalent (psychicnum uses
-- common.is_club_member directly since it has no seat structure).
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
-- it isn't leaked in practice. For a hardened version, drop this
-- in favor of own-row reads plus a game_players_roster view that
-- omits key_card. Deliberately deferred for v1 — see
-- CODE_REVIEW.md item 13.
create policy game_players_select on tinyspy.game_players
  for select to authenticated
  using (tinyspy.is_player_in_game(game_id));

create policy words_select on tinyspy.words
  for select to authenticated
  using (tinyspy.is_player_in_game(game_id));

create policy clues_select on tinyspy.clues
  for select to authenticated
  using (tinyspy.is_player_in_game(game_id));

-- No insert/update/delete policies on any table. All writes go
-- through RPCs. word_pool has no policies at all — only
-- security-definer RPCs read from it.

grant select on tinyspy.games to authenticated;
grant select on tinyspy.game_players to authenticated;
grant select on tinyspy.words to authenticated;
grant select on tinyspy.clues to authenticated;

-- ============================================================
-- Realtime publication
-- ============================================================

alter publication supabase_realtime add table tinyspy.games;
alter publication supabase_realtime add table tinyspy.game_players;
alter publication supabase_realtime add table tinyspy.words;
alter publication supabase_realtime add table tinyspy.clues;

-- ============================================================
-- tinyspy._end_turn — internal helper
-- ============================================================
-- Advances the turn counter and swaps the clue-giver. Also handles
-- the "last timer token spent → sudden death" transition. Called
-- by submit_guess (after a non-green-non-assassin reveal) and
-- pass_turn (after a clue was given but no guesses taken).

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

-- ============================================================
-- tinyspy.create_game(target_club) — start a new game in a club
-- ============================================================
-- One call:
--   - verifies caller is in the target club
--   - verifies the club has exactly 2 members (tinyspy is 2-player)
--   - seats the caller as A and the other member as B
--   - picks 25 words from word_pool
--   - generates the Duet key card distribution and assigns both
--     seats their views
--   - sets status='active' directly (no lobby)
--   - upserts common.club_active_game pointing at this game
--     (which auto-pauses whatever was previously active for the
--     club, per the v1 active/paused/completed semantics)

create function tinyspy.create_game(target_club uuid)
returns table(id uuid)
language plpgsql
security definer
set search_path = tinyspy, common, public, extensions
as $$
declare
  caller_id uuid;
  other_id uuid;
  member_count int;
  new_id uuid;
  picked_words text[];
  tiles jsonb[];
  a_view text[];
  b_view text[];
  j int;
  tmp jsonb;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  -- Caller must be a member of the target club.
  if not exists (
    select 1 from common.club_members
    where club_id = target_club and user_id = caller_id
  ) then
    raise exception 'not a member of this club' using errcode = '42501';
  end if;

  -- Tinyspy needs exactly 2 club members.
  select count(*) into member_count
    from common.club_members where club_id = target_club;
  if member_count <> 2 then
    raise exception 'tinyspy requires a 2-member club (this club has %)', member_count
      using errcode = 'P0001';
  end if;

  -- Find the other member (the one who isn't the caller).
  select user_id into other_id
    from common.club_members
   where club_id = target_club and user_id <> caller_id
   limit 1;

  -- Pick the 25 words. The word_pool seed at the bottom of this
  -- file guarantees ≥ 25 words exist.
  select array_agg(word) into picked_words
    from (select word from tinyspy.word_pool order by random() limit 25) sub;
  if array_length(picked_words, 1) <> 25 then
    raise exception 'word_pool must contain at least 25 words'
      using errcode = 'P0001';
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

  -- Insert the game row directly in 'active' state.
  insert into tinyspy.games (club_id, status, current_clue_giver)
  values (target_club, 'active', 'A')
  returning games.id into new_id;

  -- Seat both members.
  insert into tinyspy.game_players (game_id, user_id, seat, key_card) values
    (new_id, caller_id, 'A', to_jsonb(a_view)),
    (new_id, other_id,  'B', to_jsonb(b_view));

  -- Insert the 25 words.
  for i in 0..24 loop
    insert into tinyspy.words (game_id, position, word)
    values (new_id, i, picked_words[i+1]);
  end loop;

  -- Upsert into club_active_game — auto-pauses any prior active
  -- game for this club by overwriting the row.
  insert into common.club_active_game (club_id, gametype, game_id, set_active_at)
  values (target_club, 'tinyspy', new_id, now())
  on conflict (club_id) do update set
    gametype = excluded.gametype,
    game_id = excluded.game_id,
    set_active_at = excluded.set_active_at;

  return query select new_id;
end;
$$;

revoke execute on function tinyspy.create_game(uuid) from public;
grant execute on function tinyspy.create_game(uuid) to authenticated;

-- ============================================================
-- tinyspy.submit_clue
-- ============================================================
-- Parameter is named clue_count (not "count") to avoid shadowing
-- the SQL aggregate function. The matching column on tinyspy.clues
-- stays "count" since it's only ever referenced in column lists,
-- never as a function call.

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

-- ============================================================
-- tinyspy.submit_guess
-- ============================================================
-- Returns the revealed label ('G' | 'N' | 'A') for caller
-- convenience. Handles all the Duet rules:
--   - whose key view labels this reveal (the clue-giver's during
--     active play; the partner's in sudden death)
--   - assassin reveal → lost_assassin
--   - non-green during sudden death → lost_clock
--   - green reveal → check win; turn continues
--   - neutral reveal during active → turn ends via _end_turn

create function tinyspy.submit_guess(target_game uuid, target_position int)
returns text
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

  -- Whose key view labels this reveal? This is the most subtle
  -- rule in Duet.
  --
  -- During active play: the clue-giver's view. A green agent on
  -- the clue-giver's side counts toward the 15; a neutral on
  -- their side ends the turn; an assassin on their side ends the
  -- game. The guesser's own view does NOT matter for this reveal
  -- — the guess is in response to the clue-giver's clue, so the
  -- clue-giver's labels apply.
  --
  -- In sudden death: there is no clue-giver, but guesses are
  -- "from memory of past clues", and those clues came from the
  -- partner. So we still use the partner's view (the seat
  -- opposite to the caller).
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

-- ============================================================
-- tinyspy.pass_turn
-- ============================================================
-- The guesser ends the turn without taking any more guesses,
-- spending one timer token. Legal even after zero guesses on the
-- turn (e.g. "the clue makes no sense, let's just move on").

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
-- tinyspy.play_again
-- ============================================================
-- Same seat layout as the previous game. The new game inherits
-- the previous game's club_id. Idempotent via
-- prev_game.next_game_id: whichever caller arrives first creates;
-- a later call from the same prev_game gets back the same id.

create function tinyspy.play_again(prev_game uuid)
returns table(id uuid)
language plpgsql
security definer
set search_path = tinyspy, common, public, extensions
as $$
declare
  prev_status text;
  prev_next uuid;
  prev_club uuid;
  new_id uuid;
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

  select status, next_game_id, club_id
    into prev_status, prev_next, prev_club
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

  -- Idempotent: another caller already created the next game.
  if prev_next is not null then
    return query select prev_next;
    return;
  end if;

  -- Fresh words.
  select array_agg(word) into picked_words
    from (select word from tinyspy.word_pool order by random() limit 25) sub;
  if array_length(picked_words, 1) <> 25 then
    raise exception 'word_pool must contain at least 25 words'
      using errcode = 'P0001';
  end if;

  -- Fresh key card.
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

  -- New game in the same club, status='active' immediately.
  insert into tinyspy.games (club_id, status, current_clue_giver)
  values (prev_club, 'active', 'A')
  returning games.id into new_id;

  -- Carry forward seats from the previous game, with fresh keys.
  insert into tinyspy.game_players (game_id, user_id, seat, key_card)
  select new_id,
         user_id,
         seat,
         case seat when 'A' then to_jsonb(a_view) else to_jsonb(b_view) end
    from tinyspy.game_players where game_id = prev_game;

  for i in 0..24 loop
    insert into tinyspy.words (game_id, position, word)
    values (new_id, i, picked_words[i+1]);
  end loop;

  -- Link the chain and re-take the active slot for this club.
  update tinyspy.games set next_game_id = new_id where games.id = prev_game;

  insert into common.club_active_game (club_id, gametype, game_id, set_active_at)
  values (prev_club, 'tinyspy', new_id, now())
  on conflict (club_id) do update set
    gametype = excluded.gametype,
    game_id = excluded.game_id,
    set_active_at = excluded.set_active_at;

  return query select new_id;
end;
$$;

revoke execute on function tinyspy.play_again(uuid) from public;
grant execute on function tinyspy.play_again(uuid) to authenticated;

-- ============================================================
-- tinyspy.clear_active_on_termination — trigger function
-- ============================================================
-- Fires whenever tinyspy.games.status updates to a terminal
-- value. Deletes the matching row from common.club_active_game
-- so the club has no "active" game; any non-terminal games for
-- the club then naturally show as "paused" in the UI.
--
-- security definer because the calling RPC is running as the
-- authenticated user, but common.club_active_game has no delete
-- policy for that role.

create function tinyspy.clear_active_on_termination()
returns trigger
language plpgsql
security definer
set search_path = tinyspy, common, public, extensions
as $$
begin
  if new.status in ('won', 'lost_assassin', 'lost_clock')
     and old.status not in ('won', 'lost_assassin', 'lost_clock') then
    delete from common.club_active_game
     where club_id = new.club_id
       and gametype = 'tinyspy'
       and game_id = new.id;
  end if;
  return new;
end;
$$;

create trigger clear_active_on_termination
  after update of status on tinyspy.games
  for each row execute function tinyspy.clear_active_on_termination();

-- ============================================================
-- tinyspy.get_clue_context — read-only RPC for the suggester
-- ============================================================
-- Returns a jsonb object with:
--   greens:         text[]  — caller's unrevealed green agents
--   neutrals:       text[]  — caller's unrevealed neutrals (avoid)
--   assassin:       text    — caller's unrevealed assassin (avoid),
--                              or null if it's already revealed
--   previous_clues: array of {word, count, by_seat, turn_number}
--
-- Authorization: caller must be the current clue-giver of an
-- active (or sudden-death) game. We do the check here so the
-- Edge Function can stay a thin orchestrator; it gets back either
-- a clean context or a clean rejection.

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

  -- Build the context object. Each of the three category lookups
  -- uses the caller's key view (caller_key) indexed by w.position.
  -- `->>` returns the label as text ('G' | 'N' | 'A').
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

-- ============================================================
-- Seed: tinyspy.word_pool (390 Codenames Duet words)
-- ============================================================
-- Lives in this migration (rather than seed.sql) so it's applied
-- to hosted projects by `supabase db push`. `db reset` locally
-- replays migrations too, so this still seeds the local DB.
--
-- Source: https://github.com/koosvary/codenames/blob/master/word_lists/duet.txt
-- (the typo "UNIVERITY" → "UNIVERSITY" was corrected during import).
--
-- `on conflict do nothing` makes this idempotent — running the
-- migration twice (e.g. against a partially-seeded DB) is safe.

insert into tinyspy.word_pool (word) values
  ('ACE'),
  ('ALASKA'),
  ('ANCHOR'),
  ('ANT'),
  ('ANTHEM'),
  ('APRON'),
  ('ARMOR'),
  ('ARMY'),
  ('ASTRONAUT'),
  ('ATTIC'),
  ('AVALANCHE'),
  ('AXE'),
  ('BABY'),
  ('BACON'),
  ('BALLOON'),
  ('BANANA'),
  ('BARBECUE'),
  ('BASS'),
  ('BATH'),
  ('BATTLE'),
  ('BATTLESHIP'),
  ('BAY'),
  ('BEAM'),
  ('BEAN'),
  ('BEARD'),
  ('BEE'),
  ('BEER'),
  ('BENCH'),
  ('BICYCLE'),
  ('BIG BANG'),
  ('BIG BEN'),
  ('BIKINI'),
  ('BISCUIT'),
  ('BLACK HOLE'),
  ('BLACKSMITH'),
  ('BLADE'),
  ('BLIND'),
  ('BLIZZARD'),
  ('BLUES'),
  ('BOIL'),
  ('BONSAI'),
  ('BOOK'),
  ('BOSS'),
  ('BOWL'),
  ('BOWLER'),
  ('BOXER'),
  ('BRAIN'),
  ('BRASS'),
  ('BRAZIL'),
  ('BREAD'),
  ('BREAK'),
  ('BRICK'),
  ('BRIDE'),
  ('BROTHER'),
  ('BUBBLE'),
  ('BUCKET'),
  ('BULB'),
  ('BUNK'),
  ('BUTTER'),
  ('BUTTERFLY'),
  ('CABLE'),
  ('CAESAR'),
  ('CAKE'),
  ('CAMP'),
  ('CANE'),
  ('CAPTAIN'),
  ('CASTLE'),
  ('CAVE'),
  ('CHAIN'),
  ('CHALK'),
  ('CHEESE'),
  ('CHERRY'),
  ('CHIP'),
  ('CHRISTMAS'),
  ('CLEOPATRA'),
  ('CLOCK'),
  ('CLOUD'),
  ('COACH'),
  ('COAST'),
  ('COFFEE'),
  ('COLLAR'),
  ('COLUMBUS'),
  ('COMB'),
  ('COMET'),
  ('COMPUTER'),
  ('CONE'),
  ('COW'),
  ('COWBOY'),
  ('CRAB'),
  ('CRAFT'),
  ('CROW'),
  ('CRUSADER'),
  ('CRYSTAL'),
  ('CUCKOO'),
  ('CURRY'),
  ('DASH'),
  ('DELTA'),
  ('DENTIST'),
  ('DESK'),
  ('DIRECTOR'),
  ('DISK'),
  ('DOLL'),
  ('DOLLAR'),
  ('DRAWING'),
  ('DREAM'),
  ('DRESSING'),
  ('DRIVER'),
  ('DRONE'),
  ('DRUM'),
  ('DRYER'),
  ('DUST'),
  ('EAR'),
  ('EARTH'),
  ('EARTHQUAKE'),
  ('EASTER'),
  ('EDEN'),
  ('EGG'),
  ('EINSTEIN'),
  ('FARM'),
  ('FEVER'),
  ('FIDDLE'),
  ('FLAG'),
  ('FLAT'),
  ('FLOOD'),
  ('FLOOR'),
  ('FOAM'),
  ('FOG'),
  ('FROG'),
  ('FROST'),
  ('FUEL'),
  ('GANGSTER'),
  ('GEAR'),
  ('GENIE'),
  ('GLACIER'),
  ('GLASSES'),
  ('GOAT'),
  ('GOLDILOCKS'),
  ('GOLF'),
  ('GOVERNOR'),
  ('GREENHOUSE'),
  ('GROOM'),
  ('GUITAR'),
  ('GUM'),
  ('GYMNAST'),
  ('HAIR'),
  ('HALLOWEEN'),
  ('HAMBURGER'),
  ('HAMMER'),
  ('HAWAII'),
  ('HELMET'),
  ('HERCULES'),
  ('HIDE'),
  ('HIT'),
  ('HOMER'),
  ('HOSE'),
  ('HOUSE'),
  ('ICE AGE'),
  ('ICELAND'),
  ('IGLOO'),
  ('INK'),
  ('JAIL'),
  ('JELLYFISH'),
  ('JEWELER'),
  ('JOAN OF ARC'),
  ('JOCKEY'),
  ('JOKER'),
  ('JUDGE'),
  ('JUMPER'),
  ('KICK'),
  ('KILT'),
  ('KING ARTHUR'),
  ('KISS'),
  ('KITCHEN'),
  ('KNOT'),
  ('KUNG FU'),
  ('LACE'),
  ('LADDER'),
  ('LAUNDRY'),
  ('LEATHER'),
  ('LEMONADE'),
  ('LETTER'),
  ('LIGHTNING'),
  ('LIP'),
  ('LOCUST'),
  ('LOVE'),
  ('LUMBERJACK'),
  ('LUNCH'),
  ('MAGAZINE'),
  ('MAGICIAN'),
  ('MAKEUP'),
  ('MANICURE'),
  ('MAP'),
  ('MARACAS'),
  ('MARATHON'),
  ('MEDIC'),
  ('MEMORY'),
  ('MESS'),
  ('METER'),
  ('MICROWAVE'),
  ('MILE'),
  ('MILK'),
  ('MILL'),
  ('MINOTAUR'),
  ('MINUTE'),
  ('MIRROR'),
  ('MISS'),
  ('MOHAWK'),
  ('MONA LISA'),
  ('MONKEY'),
  ('MOSES'),
  ('MOSQUITO'),
  ('MOTHER'),
  ('MOUNTIE'),
  ('MUD'),
  ('MUMMY'),
  ('MUSKETEER'),
  ('MUSTARD'),
  ('NAPOLEON'),
  ('NERVE'),
  ('NEWTON'),
  ('NOAH'),
  ('NOSE'),
  ('NOTRE DAME'),
  ('NYLON'),
  ('OASIS'),
  ('ONION'),
  ('PACIFIC'),
  ('PAD'),
  ('PADDLE'),
  ('PAGE'),
  ('PAINT'),
  ('PARADE'),
  ('PARROT'),
  ('PATIENT'),
  ('PEA'),
  ('PEACH'),
  ('PEANUT'),
  ('PEARL'),
  ('PEN'),
  ('PENNY'),
  ('PENTAGON'),
  ('PEPPER'),
  ('PEW'),
  ('PIG'),
  ('PILLOW'),
  ('PINE'),
  ('PIZZA'),
  ('POCKET'),
  ('POLISH'),
  ('POLO'),
  ('POP'),
  ('POPCORN'),
  ('POTATO'),
  ('POTTER'),
  ('POWDER'),
  ('PUPPET'),
  ('PURSE'),
  ('QUACK'),
  ('QUARTER'),
  ('RADIO'),
  ('RAIL'),
  ('RAINBOW'),
  ('RAM'),
  ('RANCH'),
  ('RAT'),
  ('RAZOR'),
  ('RECORD'),
  ('REINDEER'),
  ('RICE'),
  ('RIFLE'),
  ('RIP'),
  ('RIVER'),
  ('ROAD'),
  ('RODEO'),
  ('ROLL'),
  ('ROPE'),
  ('RUBBER'),
  ('RUSSIA'),
  ('RUST'),
  ('SACK'),
  ('SADDLE'),
  ('SAHARA'),
  ('SAIL'),
  ('SALAD'),
  ('SALOON'),
  ('SALSA'),
  ('SALT'),
  ('SAND'),
  ('SANTA'),
  ('SAW'),
  ('SCARECROW'),
  ('SCRATCH'),
  ('SCROLL'),
  ('SECOND'),
  ('SHAMPOO'),
  ('SHED'),
  ('SHEET'),
  ('SHELL'),
  ('SHERLOCK'),
  ('SHERWOOD'),
  ('SHOOT'),
  ('SHORTS'),
  ('SHOULDER'),
  ('SHOWER'),
  ('SIGN'),
  ('SILK'),
  ('SISTER'),
  ('SKATES'),
  ('SKI'),
  ('SKULL'),
  ('SLED'),
  ('SLEEP'),
  ('SLING'),
  ('SLIPPER'),
  ('SLOTH'),
  ('SMOKE'),
  ('SMOOTHIE'),
  ('SNAKE'),
  ('SNAP'),
  ('SOAP'),
  ('SOUP'),
  ('SPHINX'),
  ('SPIRIT'),
  ('SPOON'),
  ('SPRAY'),
  ('SPURS'),
  ('SQUASH'),
  ('SQUIRREL'),
  ('ST.PATRICK'),
  ('STABLE'),
  ('STAMP'),
  ('STEAM'),
  ('STEEL'),
  ('STEP'),
  ('STETHOSCOPE'),
  ('STICKER'),
  ('STORM'),
  ('STORY'),
  ('STREET'),
  ('SUGAR'),
  ('SUMO'),
  ('SUN'),
  ('SWAMP'),
  ('SWEAT'),
  ('SWORD'),
  ('TANK'),
  ('TASTE'),
  ('TATTOO'),
  ('TEA'),
  ('TEAM'),
  ('TEAR'),
  ('TEXAS'),
  ('THUNDER'),
  ('TIGER'),
  ('TIN'),
  ('TIP'),
  ('TIPI'),
  ('TOAST'),
  ('TORNADO'),
  ('TRICK'),
  ('TROLL'),
  ('TUNNEL'),
  ('TURTLE'),
  ('TUTU'),
  ('TUXEDO'),
  ('UNIVERSITY'),
  ('VALENTINE'),
  ('VAMPIRE'),
  ('VENUS'),
  ('VIKING'),
  ('VIOLET'),
  ('VIRUS'),
  ('VOLCANO'),
  ('VOLUME'),
  ('WAGON'),
  ('WAITRESS'),
  ('WALRUS'),
  ('WEDDING'),
  ('WEREWOLF'),
  ('WHEEL'),
  ('WHEELCHAIR'),
  ('WHISTLE'),
  ('WINDOW'),
  ('WING'),
  ('WISH'),
  ('WIZARD'),
  ('WONDERLAND'),
  ('WOOL'),
  ('YELLOWSTONE'),
  ('ZOMBIE') on conflict do nothing;
