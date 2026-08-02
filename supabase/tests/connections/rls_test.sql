-- ============================================================
-- Test: connections RLS + access boundaries
-- ============================================================
--
-- A non-member (dee) must not be able to see anything about an
-- ada+bea club's connections game, and must not be able to call any
-- mutating RPC against it. Mirrors the structure of
-- ../codenamesduet/rls_test.sql and ../psychicnum/rls_test.sql.
--
-- Includes a positive baseline (ada CAN see the game) so the
-- negative assertions are meaningful (otherwise "0 rows" could
-- just mean nothing exists).
--
-- See ../codenamesduet/create_game_test.sql for the pgTAP primer.

begin;

set search_path = connections, common, public, extensions;

select plan(11);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up a club + a game in progress (from the fixture puzzle)
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;
create temp table puzzle on commit drop as
select pg_temp.connections_puzzle() as id;
create temp table g on commit drop as
select * from connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid], 'coop'
);

-- A wrong guess so there's a row in connections.guesses for dee
-- not to see.
select connections.submit_guess(
  (select id from g),
  array['ALPHA','BANANA','CASTLE','DAGGER']::text[],
  'wrong', null
);

-- ============================================================
-- Positive baseline: ada sees her own game + its guesses
-- ============================================================

select is(
  (select count(*) from connections.games where id = (select id from g)),
  1::bigint,
  'sanity: ada (a member) sees her connections game'
);

select is(
  (select count(*) from connections.guesses where game_id = (select id from g)),
  1::bigint,
  'sanity: ada sees the guess she just made'
);

-- ============================================================
-- Dee (outsider) sees zero rows from every connections table
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

select is(
  (select count(*) from connections.games where id = (select id from g)),
  0::bigint,
  'dee cannot SELECT a connections game for a club she is outside'
);

select is(
  (select count(*) from connections.guesses where game_id = (select id from g)),
  0::bigint,
  'dee cannot SELECT connections guesses for a club she is outside'
);

-- ============================================================
-- Dee's mutating RPCs throw
-- ============================================================

select throws_ok(
  format(
    $$ select connections.submit_guess(%L::uuid,
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
    $$ select connections.create_game(%L, pg_temp.connections_setup(%L::uuid), array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid], 'coop') $$,
    (select handle from club), (select id from puzzle)
  ),
  '42501',
  'not a member of this club',
  'dee cannot call create_game on a club she is outside'
);

-- ============================================================
-- Direct INSERT to connections tables is blocked at the grant layer
-- ============================================================
-- No INSERT/UPDATE/DELETE grants for authenticated — writes go
-- through the security-definer RPCs only.

select throws_ok(
  $$ insert into connections.guesses (game_id, user_id, tiles, result)
     values ((select id from g),
             'dee44444-4444-4444-4444-444444444444',
             array['X','Y','Z','W'],
             'wrong') $$,
  '42501',
  'permission denied for table guesses',
  'direct INSERT into connections.guesses is blocked (no grant on authenticated)'
);

-- ============================================================
-- COMPETE: opponents' guesses are private DURING PLAY, and open
-- at terminal (2026-08-02)
-- ============================================================
-- The privacy is a GAME RULE, not etiquette: a peer's oneAway guess plus the
-- public board would hand you the answer while you can still use it. Once the
-- game is over there's nothing left to protect, and comparing lines afterwards
-- is most of the fun — which is what the turn log's "whose guesses?" picker
-- shows. Same shape wordle already uses.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cg on commit drop as
select * from connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete'
);

-- One guess each, so there IS an opponent row to hide (or not).
select connections.submit_guess(
  (select id from cg), array['ALPHA','BANANA','CASTLE','DAGGER']::text[], 'wrong', null);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select connections.submit_guess(
  (select id from cg), array['ALPHA','ANGEL','APPLE','ARROW']::text[], 'wrong', null);

-- Mid-game: ada sees only her own.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from connections.guesses where game_id = (select id from cg)),
  1::bigint,
  'compete mid-game: a player sees only their OWN guesses'
);

-- End it. (end_game is the neutral mutual stop; the rule keys on is_terminal,
-- not on how the game ended.)
select connections.end_game((select id from cg));

select is(
  (select count(*) from connections.guesses where game_id = (select id from cg)),
  2::bigint,
  'compete AT TERMINAL: everyone''s guesses open up'
);

-- …and the opponent's row is the one that appeared, not a duplicate of mine.
select is(
  (select count(distinct user_id) from connections.guesses where game_id = (select id from cg)),
  2::bigint,
  'compete at terminal: both players'' rows are visible'
);

-- The club boundary still holds — terminal opens the game to its PLAYERS'
-- club, not to the world.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*) from connections.guesses where game_id = (select id from cg)),
  0::bigint,
  'compete at terminal: a non-member still sees nothing'
);

-- ============================================================
select * from finish();
rollback;
