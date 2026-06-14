-- ============================================================
-- Test: play_again RPC
-- ============================================================
--
-- play_again is the "let's play another round with the same opponent"
-- shortcut from the game-over banner. It must:
--   - reject if the previous game hasn't ended
--   - reject if the caller wasn't a player in the previous game
--   - create a fresh game and pre-seat both players (in the same club)
--   - be idempotent: whichever player clicks first creates; the other
--     gets back the same id instead of a second game
--
-- Strategy: end a real game by hitting an assassin, then exercise
-- play_again from both players and a third party.
--
-- See `create_game_test.sql` for the pgTAP primer.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = tinyspy, common, public, extensions;

select plan(9);

-- ============================================================
-- Fixtures: three users — alice + bob play, carol is outside
-- ============================================================

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@test.local', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@test.local',   now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'carol@test.local', now(), now(), now());

create function pg_temp.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.find_position(g uuid, s text, target text) returns int
language sql as $$
  select (ord - 1)::int
  from tinyspy.game_players gp,
       jsonb_array_elements_text(gp.key_card) with ordinality as t(label, ord)
  where gp.game_id = g and gp.seat = s and t.label = target
  limit 1;
$$;

-- ============================================================
-- Set up a finished game so play_again has something to act on
-- ============================================================

-- Alice creates a 2-member club; tinyspy.create_game seats both
-- and brings the game straight to 'active'.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('test club', array['alice','bob']);
create temp table prev on commit drop as
select * from tinyspy.create_game((select id from club));

-- (1) While the game is still 'active', play_again rejects.
select throws_ok(
  $$ select play_again((select id from prev)) $$,
  'P0001',
  'previous game has not ended',
  'play_again rejects while the previous game is still active'
);

-- End the game: Alice gives a clue, Bob guesses Alice's assassin cell.
select submit_clue((select id from prev), 'DOOM', 1);

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select submit_guess(
  (select id from prev),
  pg_temp.find_position((select id from prev), 'A', 'A')
);

-- ============================================================
-- play_again, take 1: Alice creates the successor
-- ============================================================

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table next on commit drop as
select * from play_again((select id from prev));

-- (2) Alice's play_again call should have returned one row.
select is(
  (select count(*) from next),
  1::bigint,
  'play_again returns one (id) row'
);

-- (3) The previous game's next_game_id pointer should now match.
select is(
  (select next_game_id from games where id = (select id from prev)),
  (select id from next),
  'previous game now points to its successor via next_game_id'
);

-- ============================================================
-- play_again, take 2: Bob's idempotent call from the same prev game
-- ============================================================
-- Whichever player clicks first creates the new game. A later caller
-- from the same prev_game should get back the same id, not a
-- second game. This is what makes the UI race-free.

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
create temp table bob_result on commit drop as
select * from play_again((select id from prev));

-- (4) — same id back. (Idempotency check used to also cover join_code,
-- but the column is gone with the clubs migration; the game id is
-- the only stable handle now.)
select is(
  (select id from bob_result),
  (select id from next),
  'play_again is idempotent: second caller gets the same game id'
);

-- ============================================================
-- Verify the successor's seating
-- ============================================================
-- Both players should already be in the new game with the same seats.

-- (5) and (6) — the seating rows exist as expected.
select is(
  (select seat from game_players
   where game_id = (select id from next)
     and user_id = '11111111-1111-1111-1111-111111111111'),
  'A',
  'alice is pre-seated as A in the successor game'
);
select is(
  (select seat from game_players
   where game_id = (select id from next)
     and user_id = '22222222-2222-2222-2222-222222222222'),
  'B',
  'bob is pre-seated as B in the successor game'
);

-- (7) Successor game starts in 'active' directly (no lobby state
-- under the clubs model).
select is(
  (select status from games where id = (select id from next)),
  'active',
  'successor game starts in active state'
);

-- (8) And the successor is now the club's active game, with the
-- previous one auto-paused (cleared from club_active_game by the
-- termination trigger when the assassin reveal flipped it to
-- lost_assassin, then re-set by play_again pointing at next).
select is(
  (select game_id from common.club_active_game
    where club_id = (select id from club)),
  (select id from next),
  'play_again upserts club_active_game to point at the new game'
);

-- ============================================================
-- Carol (not a player in `prev`) cannot call play_again on it.
-- ============================================================

select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$ select play_again((select id from prev)) $$,
  '42501',
  'not a player in this game',
  'play_again rejects a non-player'
);

-- ============================================================
select * from finish();
rollback;
