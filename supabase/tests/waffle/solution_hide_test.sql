-- cs-unmet

-- ============================================================
-- Test: waffle — solution visibility (`solution`)
-- ============================================================
-- The answer key's visibility rule, the same in both modes:
--
--   1. `waffle.games.solution` is column-grant-excluded — never selectable
--      directly by an authenticated player; `game_data` (`_make_json_puzzle`)
--      is the only path, in EITHER mode.
--   2. `game_data` carries it only once the game has ended — in coop too:
--      each colored swap row is stored, so nothing on the page needs it
--      mid-game.
--
-- The mirror of wordle's target test.

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(4);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Waffle secret', array['ada', 'bea']) as handle;

-- A coop game and a compete game on the same deterministic board.
create temp table gc on commit drop as
select (waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board())->'data'->>'id')::uuid as id;   -- solution 'abcdef.g.hijklmn.o.pqrstu', 1 swap away
create temp table gp on commit drop as
select (waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.waffle_board())->'data'->>'id')::uuid as id;

-- (1) The raw column is not selectable by an authenticated player (either mode).
select throws_ok(
  format($$ select solution from waffle.games where game_id = %L $$, (select id from gc)),
  '42501', null,
  'waffle.games.solution is column-excluded from authenticated'
);

-- (2) COOP mid-game: no solution in game_data.
select is(
  (select game_data->'puzzle'->'solution' from common.games where id = (select id from gc)),
  'null'::jsonb,
  'mid-game coop: game_data carries no solution'
);

-- (3) COMPETE mid-game: no solution either.
select is(
  (select game_data->'puzzle'->'solution' from common.games where id = (select id from gp)),
  'null'::jsonb,
  'mid-game compete: game_data carries no solution'
);

-- ada solves the coop game (coop → the solve ends it); the compete game stays open.
select waffle.submit_swap((select id from gc), 0, 1);

-- (4) An ended coop game: the answer key arrives.
select is(
  (select game_data->'puzzle'->'solution'->0 from common.games where id = (select id from gc)),
  '{"id": "0", "letter": "a"}'::jsonb,
  'ended coop: game_data carries the solution'
);

select * from finish();
rollback;
