-- ============================================================
-- Test: psychicnum.create_game — the entry RPC
-- ============================================================
--
-- Doubles as the pgTAP primer for the psychicnum test suite.
-- See ../tinyspy/create_game_test.sql for the deeper primer
-- (fixture setup, the as_user helper, why we wrap in begin/rollback).
--
-- What we check here:
--   1. unauthenticated callers are rejected (42501)
--   2. non-member callers are rejected (42501)
--   3. a valid call returns a game id, picks a target in 1..10,
--      sets guesses_remaining = 7, status = 'active'
--   4. the call upserts common.club_active_game pointing at it
--   5. a second create in the same club replaces (auto-pauses)
--      the first — common.club_active_game has PK on club_id
--   6. the `target` column is NOT visible to authenticated SELECT
--      (column-level grant excludes it)
-- ============================================================

begin;

set search_path = psychicnum, common, public, extensions;

select plan(11);

\ir ../_common/setup.psql

-- ============================================================
-- (1) Unauthenticated callers are rejected
-- ============================================================
-- Clearing request.jwt.claims makes auth.uid() return null inside
-- the RPC body, which trips the "must be authenticated" guard.
-- We set role=postgres for the call itself so that grant-layer
-- enforcement (the function is granted to `authenticated`, not
-- `postgres`) doesn't trip first — we want to land inside the
-- function body and see its own guard.

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select throws_ok(
  $$ select psychicnum.create_game('00000000-0000-0000-0000-000000000000'::uuid) $$,
  '42501',
  'must be authenticated',
  'unauthenticated create_game is rejected'
);

-- ============================================================
-- Build a club for the happy-path tests
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('test club', array['ada','bea']);

-- ============================================================
-- (2) Non-member callers are rejected
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');  -- dee, outsider
select throws_ok(
  format($$ select psychicnum.create_game(%L::uuid) $$, (select id from club)),
  '42501',
  'not a member of this club',
  'non-member create_game is rejected'
);

-- ============================================================
-- (3) Happy path — ada creates a game
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g on commit drop as
select * from psychicnum.create_game((select id from club));

select is(
  (select count(*) from g),
  1::bigint,
  'create_game returns one (id) row'
);

-- (4) Game row exists with expected initial values.
-- Note: we reset to postgres to read the `target` column for assertions
-- — authenticated callers can't see target (verified in test 8 below).
reset role;
select is(
  (select status from psychicnum.games where id = (select id from g)),
  'active',
  'newly-created game has status = active'
);
select is(
  (select guesses_remaining from psychicnum.games where id = (select id from g)),
  7,
  'newly-created game starts with 7 guesses remaining'
);
select ok(
  (select target between 1 and 10 from psychicnum.games where id = (select id from g)),
  'target is in the 1..10 range'
);

-- (5) club_active_game points at this game, gametype 'psychicnum'.
select is(
  (select game_id from common.club_active_game where club_id = (select id from club)),
  (select id from g),
  'club_active_game points at the new game'
);
select is(
  (select gametype from common.club_active_game where club_id = (select id from club)),
  'psychicnum',
  'club_active_game records gametype = psychicnum'
);

-- ============================================================
-- (6) A second create in the same club auto-pauses the first
-- ============================================================
-- common.club_active_game has primary key (club_id) so the
-- on-conflict-do-update path in create_game replaces the row.
-- The first game's `psychicnum.games.status` stays 'active' —
-- "paused" is purely a derived club-level state (no club_active_game
-- row pointing at it), so we just check the pointer moved.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from psychicnum.create_game((select id from club));

select is(
  (select game_id from common.club_active_game where club_id = (select id from club)),
  (select id from g2),
  'second create_game replaces club_active_game with new game'
);

reset role;
select is(
  (select status from psychicnum.games where id = (select id from g)),
  'active',
  'first game still has status = active (paused is a club-level state, not a row state)'
);

-- ============================================================
-- (8) target is hidden from authenticated SELECT
-- ============================================================
-- The column-level grant on psychicnum.games includes id, club_id,
-- status, guesses_remaining, winner_id, next_game_id, created_at
-- — but NOT target. Selecting target as the authenticated role
-- should raise SQLSTATE 42501 ("permission denied for column").

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select target from psychicnum.games where id = %L $$, (select id from g)),
  '42501',
  null,  -- the exact message includes the column name; just match the code
  'authenticated SELECT of target column is denied (column-level grant)'
);

-- ============================================================
select * from finish();
rollback;
