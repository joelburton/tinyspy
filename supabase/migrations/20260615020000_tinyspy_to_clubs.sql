-- ============================================================
-- Tinyspy → clubs: schema, RPCs, chat move (atomic flip)
-- ============================================================
--
-- This migration is the atomic switch from tinyspy's ad-hoc model
-- (join codes, lobby, per-game messages) to the clubs model:
--
--   - tinyspy.games gains `club_id uuid not null`. The 2 club
--     members are seated immediately on create_game; there is no
--     lobby state and no second member joining via a code.
--   - join_code / generate_join_code / join_game / start_game all
--     go away. The lobby flow is gone entirely.
--   - tinyspy.messages and tinyspy.send_message are dropped. Chat
--     lives in common.messages (added by the clubs migration),
--     keyed by club_id and shared across all games played in the
--     club.
--   - common.club_active_game gains a row whenever a tinyspy game
--     is created or play-again'd; the new game auto-pauses any
--     previously-active game in that club. The matching row is
--     auto-deleted by a trigger when the game's status flips to
--     a terminal value.
--   - submit_clue/guess/pass_turn lose their lobby-state checks
--     (no game can be in lobby anymore).
--
-- Per the alpha-software prior in CLAUDE.md, all existing tinyspy
-- game/chat data is wiped at the top of this migration — we don't
-- engineer a back-compat path for the few test games the local DB
-- has.

-- ============================================================
-- 1. Wipe existing tinyspy game state
-- ============================================================
-- Order matters: child rows first, since the table drops below
-- would cascade anyway but explicit cleanup keeps the migration
-- readable.

delete from tinyspy.clues;
delete from tinyspy.words;
delete from tinyspy.messages;
delete from tinyspy.game_players;
delete from tinyspy.games;

-- ============================================================
-- 2. Drop the obsolete plumbing
-- ============================================================

drop function tinyspy.send_message(uuid, text);
drop table tinyspy.messages;
-- supabase_realtime publication entry auto-removes on drop table.

drop function tinyspy.join_game(text);
drop function tinyspy.start_game(uuid);
drop function tinyspy.generate_join_code();

-- ============================================================
-- 3. tinyspy.games schema changes
-- ============================================================
-- club_id NOT NULL — every game lives inside a club from now on.
-- The 2-member-club requirement is enforced by create_game.
--
-- join_code column dropped. Old games are gone (step 1), so the
-- unique constraint going away with the column is safe.
--
-- status default changes from 'lobby' to 'active' (there is no
-- lobby state anymore). The check constraint drops 'lobby' from
-- the allowed values.

alter table tinyspy.games add column club_id uuid not null references common.clubs(id) on delete cascade;

alter table tinyspy.games drop column join_code;

alter table tinyspy.games alter column status set default 'active';
alter table tinyspy.games drop constraint games_status_check;
alter table tinyspy.games add constraint games_status_check
  check (status in ('active', 'sudden_death', 'won', 'lost_assassin', 'lost_clock'));

-- ============================================================
-- 4. tinyspy.create_game(target_club) — the new entry RPC
-- ============================================================
--
-- Replaces both the old create_game() and join_game(code) +
-- start_game(target_game) flow. One call:
--
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
--
-- Drop the old zero-arg create_game first; CREATE OR REPLACE
-- can't change a function's signature.

drop function tinyspy.create_game();

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

  -- Pick the 25 words. The word_pool seed migration guarantees ≥ 25.
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
-- 5. tinyspy.play_again — updated for club model
-- ============================================================
--
-- Same seat layout as the previous game, but no join code anymore.
-- The new game inherits the previous game's club_id. Idempotent
-- via prev_game.next_game_id, same as before.
--
-- Body is essentially a slimmer create_game (no member resolution
-- since we copy seats from prev_game; we still pick fresh words +
-- key card and upsert club_active_game).
--
-- Return type changes from `table(id uuid, join_code text)` to
-- `table(id uuid)` (no more join codes), so we have to drop the
-- existing function and recreate — CREATE OR REPLACE doesn't allow
-- return-type changes.

drop function tinyspy.play_again(uuid);

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
-- 6. Trigger: clear club_active_game when a game terminates
-- ============================================================
-- Fires whenever tinyspy.games.status updates to a terminal value.
-- Deletes the matching row from common.club_active_game so the club
-- has no "active" game; any non-terminal games for the club then
-- naturally show as "paused" in the UI.
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
-- 7. submit_clue / submit_guess / pass_turn — drop lobby checks
-- ============================================================
-- The functions were already gated on `status = 'active'` (or
-- 'active' / 'sudden_death' for guesses), so removing the lobby
-- state doesn't change the guard logic. The CREATE OR REPLACE
-- below is essentially a no-op semantically but it makes explicit
-- that we've reviewed each for compatibility with the new model.
--
-- The error message in submit_clue / pass_turn mentioned "active
-- play" which still reads naturally; no changes there.

-- (Bodies unchanged — copied from the baseline migration; included
-- here so the migration tells a complete story of what tinyspy
-- looks like under clubs.)

create or replace function tinyspy.submit_clue(target_game uuid, word text, clue_count int)
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

-- submit_guess unchanged in behavior; recreated for hygiene.
create or replace function tinyspy.submit_guess(target_game uuid, target_position int)
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

-- pass_turn unchanged in behavior; recreated for hygiene.
create or replace function tinyspy.pass_turn(target_game uuid)
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
