-- ============================================================
-- Test: get_clue_context (RPC used by suggest-clue Edge Function)
-- ============================================================
--
-- The RPC's job is to enforce "you are the current clue-giver in an
-- active game" so the Edge Function can stay thin. This file checks
-- the three rejection paths plus one happy path that returns a shape
-- with the expected keys.
--
-- See create_game_test.sql for the pgTAP primer.
-- ============================================================

begin;

set search_path = tinyspy, common, public, extensions;

select plan(6);

\ir ../_shared/setup.psql
\ir setup.psql

-- Set up an active game with ada as clue-giver (tinyspy_cfg()
-- defaults to ada as first clue-giver, so she's seated as A).
-- Dee isn't in the club, so she'll exercise the non-player
-- rejection path.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('test club', array['ada','bea']);
create temp table g on commit drop as
select * from tinyspy.create_game((select id from club), pg_temp.tinyspy_cfg());

-- ============================================================
-- (1) Non-player rejection
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  $$ select get_clue_context((select id from g)) $$,
  '42501',
  'not a player in this game',
  'get_clue_context rejects a non-player caller'
);

-- ============================================================
-- (2) Bea (the non-clue-giver) cannot ask
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  $$ select get_clue_context((select id from g)) $$,
  'P0001',
  'only the current clue-giver can request a suggestion',
  'get_clue_context rejects the non-clue-giver player'
);

-- ============================================================
-- (3) Non-active game is rejected
-- ============================================================
-- The old test used a 'lobby' state game; that state is gone with
-- clubs (create_game now goes directly to 'active'). To exercise
-- the "no suggestions outside active play" path, force a fresh
-- game's status to a terminal value via direct UPDATE (RLS-free
-- because tests run as postgres by default — reset role first).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table done_game on commit drop as
select * from tinyspy.create_game((select id from club), pg_temp.tinyspy_cfg());
reset role;
update tinyspy.games set status = 'won', current_clue_giver = null
  where id = (select id from done_game);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  $$ select get_clue_context((select id from done_game)) $$,
  'P0001',
  'no suggestions outside of active play',
  'get_clue_context rejects when game is terminal'
);

-- ============================================================
-- (4)–(6) Happy path: ada gets a context with the expected keys
-- and the greens array has exactly 9 entries (one per A-side green).
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

create temp table ctx on commit drop as
  select get_clue_context((select id from g)) as data;

select is(
  (select jsonb_typeof(data) from ctx),
  'object',
  'returns a jsonb object'
);

select is(
  (select jsonb_array_length(data->'greens') from ctx),
  9,
  'greens array has 9 entries (the A-side green count at start)'
);

select is(
  (select jsonb_array_length(data->'previous_clues') from ctx),
  0,
  'previous_clues array is empty before any clue submitted'
);

-- ============================================================
select * from finish();
rollback;
