-- ============================================================
-- Test: psychicnum.create_game(target_club, setup)
-- ============================================================
--
-- Doubles as the pgTAP primer for the psychicnum test suite.
-- See ../tinyspy/create_game_test.sql for the deeper primer
-- (fixture setup, the as_user helper, why we wrap in begin/rollback).
--
-- What we check here:
--   1. unauthenticated callers rejected (42501)
--   2. non-member callers rejected (42501)
--   3. setup validation: out-of-range guesses, missing guesses
--   4. happy path: returns a game id, picks a target in 1..10,
--      sets guesses_remaining = setup.guesses, status = 'active'
--   5. setup column persists the player's choice (for end-of-
--      game review)
--   6. guesses_remaining is initialized from setup.guesses (a
--      non-default test value pins the linkage)
--   7. the call upserts common.club_active_game pointing at it
--   8. a second create in the same club replaces (auto-pauses)
--      the first
--   9. the `target` column is NOT visible to authenticated SELECT
-- ============================================================

begin;

set search_path = psychicnum, common, public, extensions;

select plan(15);

\ir ../_shared/setup.psql

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
  $$ select psychicnum.create_game(
       '00000000-0000-0000-0000-000000000000'::uuid,
       '{"guesses": 7}'::jsonb
     ) $$,
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
  format(
    $$ select psychicnum.create_game(%L::uuid, '{"guesses": 7}'::jsonb) $$,
    (select id from club)
  ),
  '42501',
  'not a member of this club',
  'non-member create_game is rejected'
);

-- ============================================================
-- (3) Config validation
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select throws_ok(
  format(
    $$ select psychicnum.create_game(%L::uuid, '{"guesses": 4}'::jsonb) $$,
    (select id from club)
  ),
  'P0001',
  'setup.guesses must be 3, 5, 7, or 9 (got 4)',
  'create_game: setup.guesses outside {3,5,7,9} is rejected'
);

select throws_ok(
  format(
    $$ select psychicnum.create_game(%L::uuid, '{}'::jsonb) $$,
    (select id from club)
  ),
  'P0001',
  'setup.guesses is required',
  'create_game: missing setup.guesses is rejected'
);

-- ============================================================
-- (4) Happy path — ada creates a game with the default-ish 7
-- ============================================================

create temp table g on commit drop as
select * from psychicnum.create_game(
  (select id from club),
  '{"guesses": 7}'::jsonb
);

select is(
  (select count(*) from g),
  1::bigint,
  'create_game returns one (id) row'
);

-- Reset to postgres to read the `target` column for assertions —
-- authenticated callers can't see target (verified in test 11
-- below). The other column reads are fine either way.
reset role;
select is(
  (select status from psychicnum.games where id = (select id from g)),
  'active',
  'newly-created game has status = active'
);
select is(
  (select guesses_remaining from psychicnum.games where id = (select id from g)),
  7,
  'newly-created game starts with 7 guesses remaining (setup-driven)'
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
-- "paused" is purely a derived club-level state (no
-- club_active_game row pointing at it).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from psychicnum.create_game(
  (select id from club),
  '{"guesses": 7}'::jsonb
);

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
-- (7) Config column persists + guesses_remaining is linked to it
-- ============================================================
-- Use a non-default value (5) so the assertion proves the link
-- (without varying, "guesses_remaining = 7" could just be the
-- old hardcoded default leaking through). setup column also
-- captures the original intent for end-of-game review.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select * from psychicnum.create_game(
  (select id from club),
  '{"guesses": 5}'::jsonb
);

reset role;
select is(
  (select guesses_remaining from psychicnum.games where id = (select id from g3)),
  5,
  'guesses_remaining is initialized from setup.guesses'
);
select is(
  (select setup->>'guesses' from psychicnum.games where id = (select id from g3)),
  '5',
  'setup column persists the starting guesses value'
);

-- ============================================================
-- (8) target is hidden from authenticated SELECT
-- ============================================================
-- The column-level grant on psychicnum.games includes id, club_id,
-- status, guesses_remaining, winner_id, created_at — but NOT
-- target. Selecting target as the authenticated role should raise
-- SQLSTATE 42501 ("permission denied for column").

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
