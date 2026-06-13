-- ============================================================
-- Test: row-level security boundaries
-- ============================================================
--
-- The single highest-value security check: a user who is not in a
-- game must not be able to see anything about it, and must not be
-- able to write to its state through any path.
--
-- Three users:
--   alice + bob — play a game together
--   carol       — signed in, but outside the game
--
-- For carol, we check:
--   - SELECTs on every game-scoped table return zero rows
--   - RPCs that mutate the game throw
--   - direct INSERTs to game tables are blocked by RLS
--
-- And one positive check: alice (a player) CAN see the games row.
-- Without it, "carol returns 0 rows" wouldn't actually prove RLS is
-- doing anything — it could just be that there's nothing to see.
--
-- See `lobby_test.sql` for the pgTAP primer.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = tinyspy, common, public, extensions;

select plan(8);

-- ============================================================
-- Fixtures
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

-- ============================================================
-- Set up a game in progress that carol is not part of
-- ============================================================

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table g on commit drop as select * from create_game();

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select join_game((select join_code from g));

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select start_game((select id from g));
select submit_clue((select id from g), 'TOOLS', 2);

-- ============================================================
-- Positive baseline: alice CAN see the game
-- ============================================================
-- This sanity check matters — without it, "carol sees zero rows"
-- could just mean no data exists, not that RLS is filtering.

select is(
  (select count(*) from games where id = (select id from g)),
  1::bigint,
  'sanity: alice (a player) sees her own game'
);

-- ============================================================
-- Carol's SELECTs against game-scoped tables must return zero rows.
-- The `is_player_in_game(game_id)` helper used by the RLS policies
-- evaluates false for her, hiding the row entirely (no error,
-- empty result — the standard RLS behavior).
-- ============================================================

select pg_temp.as_user('33333333-3333-3333-3333-333333333333');

select is(
  (select count(*) from games where id = (select id from g)),
  0::bigint,
  'carol cannot SELECT a games row she is not a player in'
);

select is(
  (select count(*) from game_players where game_id = (select id from g)),
  0::bigint,
  'carol cannot SELECT game_players rows for a game she is outside'
);

select is(
  (select count(*) from words where game_id = (select id from g)),
  0::bigint,
  'carol cannot SELECT words for a game she is outside'
);

select is(
  (select count(*) from clues where game_id = (select id from g)),
  0::bigint,
  'carol cannot SELECT clues for a game she is outside'
);

-- ============================================================
-- Carol's mutating RPCs must throw.
-- ============================================================
-- These all raise SQLSTATE 42501 from the RPC's own auth check —
-- the RPC body uses `is_player_in_game` (which bypasses RLS via
-- security definer) to decide whether to proceed.

select throws_ok(
  $$ select submit_clue((select id from g), 'X', 1) $$,
  '42501',
  'not a player in this game',
  'carol cannot call submit_clue on a game she is outside'
);

select throws_ok(
  $$ select submit_guess((select id from g), 0) $$,
  '42501',
  'not a player in this game',
  'carol cannot call submit_guess on a game she is outside'
);

-- ============================================================
-- Carol can't write directly to game tables either.
-- ============================================================
-- This is actually defense-in-depth: the baseline migration only
-- `grant select` to the authenticated role on every game table —
-- no INSERT/UPDATE/DELETE grants. PostgreSQL blocks the write at
-- the grant layer ("permission denied") *before* RLS even gets to
-- evaluate it. The RLS policies are still there as a second
-- guard, but the missing grant is what trips first.
--
-- Net effect either way: all writes have to go through the
-- security-definer RPCs.

select throws_ok(
  $$ insert into game_players (game_id, user_id, seat)
     values ((select id from g),
             '33333333-3333-3333-3333-333333333333',
             'B') $$,
  '42501',
  'permission denied for table game_players',
  'direct INSERT into game_players is blocked (no grant on authenticated)'
);

-- ============================================================
select * from finish();
rollback;
