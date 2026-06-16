-- ============================================================
-- Test: wordknit RLS + access boundaries
-- ============================================================
--
-- A non-member (dee) must not be able to see anything about an
-- ada+bea club's wordknit game, and must not be able to call any
-- mutating RPC against it. Mirrors the structure of
-- ../tinyspy/rls_test.sql and ../psychicnum/rls_test.sql.
--
-- Includes a positive baseline (ada CAN see the game) so the
-- negative assertions are meaningful (otherwise "0 rows" could
-- just mean nothing exists).
--
-- See ../tinyspy/create_game_test.sql for the pgTAP primer.

begin;

set search_path = wordknit, common, public, extensions;

select plan(7);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up a club + a game in progress (from the fixture puzzle)
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('Ada and Bea', array['ada','bea']);
create temp table puzzle on commit drop as
select pg_temp.wordknit_puzzle() as id;
create temp table g on commit drop as
select * from wordknit.create_game(
  (select id from club),
  pg_temp.wordknit_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- A wrong guess so there's a row in wordknit.guesses for dee
-- not to see.
select wordknit.submit_guess(
  (select id from g),
  array['ALPHA','BANANA','CASTLE','DAGGER']::text[],
  'wrong', null
);

-- ============================================================
-- Positive baseline: ada sees her own game + its guesses
-- ============================================================

select is(
  (select count(*) from wordknit.games where id = (select id from g)),
  1::bigint,
  'sanity: ada (a member) sees her wordknit game'
);

select is(
  (select count(*) from wordknit.guesses where game_id = (select id from g)),
  1::bigint,
  'sanity: ada sees the guess she just made'
);

-- ============================================================
-- Dee (outsider) sees zero rows from every wordknit table
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

select is(
  (select count(*) from wordknit.games where id = (select id from g)),
  0::bigint,
  'dee cannot SELECT a wordknit game for a club she is outside'
);

select is(
  (select count(*) from wordknit.guesses where game_id = (select id from g)),
  0::bigint,
  'dee cannot SELECT wordknit guesses for a club she is outside'
);

-- ============================================================
-- Dee's mutating RPCs throw
-- ============================================================

select throws_ok(
  format(
    $$ select wordknit.submit_guess(%L::uuid,
                                     array['ALPHA','ANGEL','APPLE','ARROW']::text[],
                                     'wrong', null) $$,
    (select id from g)
  ),
  '42501',
  'not playing this game',
  'dee cannot call submit_guess on a game she didn''t play (via require_game_player)'
);

select throws_ok(
  format(
    $$ select wordknit.create_game(%L::uuid, pg_temp.wordknit_setup(%L::uuid), array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club), (select id from puzzle)
  ),
  '42501',
  'not a member of this club',
  'dee cannot call create_game on a club she is outside'
);

-- ============================================================
-- Direct INSERT to wordknit tables is blocked at the grant layer
-- ============================================================
-- No INSERT/UPDATE/DELETE grants for authenticated — writes go
-- through the security-definer RPCs only.

select throws_ok(
  $$ insert into wordknit.guesses (game_id, user_id, tiles, result)
     values ((select id from g),
             'dee44444-4444-4444-4444-444444444444',
             array['X','Y','Z','W'],
             'wrong') $$,
  '42501',
  'permission denied for table guesses',
  'direct INSERT into wordknit.guesses is blocked (no grant on authenticated)'
);

-- ============================================================
select * from finish();
rollback;
