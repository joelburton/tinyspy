-- ============================================================
-- Test: waffle compete — independent boards, opponent hidden,
--        fewest-swaps winner
-- ============================================================
--
-- Compete: each player solves their own copy; the winner is whoever
-- solved in the FEWEST swaps (tie-break: earliest solved_at — not
-- exercised here since now() is constant within a test transaction).
-- The game ends only once EVERY player is done (solved or out of
-- swaps). An opponent's board is hidden until the game ends.

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(14);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Waffle vs', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),   -- max_swaps = par(1)+5 = 6
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);

-- ── ada solves in 1 swap ────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table a_solve on commit drop as
select waffle.submit_swap((select id from g), 0, 1) as res;

select is((select (res->>'solved')::boolean from a_solve), true,
  'ada solves on her first swap');
select is((select (res->>'terminal')::boolean from a_solve), false,
  'game is NOT terminal yet — bea is still playing');

reset role;
select is(
  (select swaps_used from waffle.players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1, 'ada used 1 swap');
select is(
  (select solved from waffle.players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  false, 'bea is not solved');
select is(
  (select swaps_used from waffle.players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  0, 'bea board untouched (independent boards in compete)');

-- ── Opponent visibility mid-game (as ada) ───────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select ok(
  (select board from waffle.players_state
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222') is null,
  'mid-game: an opponent''s board is hidden (NULL)');
select is(
  (select swaps_used from waffle.players_state
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  0, 'mid-game: an opponent''s swaps_used IS visible (the progress strip)');
select ok(
  (select board from waffle.players_state
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111') is not null,
  'a player always sees her own board');

-- A solved player is locked out of further swaps.
select throws_ok(
  format($$ select waffle.submit_swap(%L::uuid, 2, 3) $$, (select id from g)),
  'P0001', NULL, 'a solved player cannot swap again');

-- ── bea solves, but in 3 swaps (so ada wins on fewest) ──────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select waffle.submit_swap((select id from g), 2, 3);   -- 1, non-solving
select waffle.submit_swap((select id from g), 2, 3);   -- 2, undo
create temp table b_solve on commit drop as
select waffle.submit_swap((select id from g), 0, 1) as res;   -- 3, solve → all done

select is((select (res->>'terminal')::boolean from b_solve), true,
  'once every player is done → terminal');

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'won_compete',
  'a winner emerged → won_compete');
select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'ada won — fewest swaps (1 vs 3)');
select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  false, 'bea did not win');

-- ── Post-terminal: the opponent board is now revealed ───────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select board from waffle.players_state
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222')::text,
  'abcdef.g.hijklmn.o.pqrstu',
  'post-terminal: the opponent board is revealed');

select * from finish();
rollback;
