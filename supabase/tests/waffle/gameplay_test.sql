-- ============================================================
-- Test: waffle.submit_swap (coop) — validation, lock-step, win, lose
-- ============================================================

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(16);

-- ── Game 1: validation + lock-step + win ────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club1 on commit drop as
select common.create_club('Waffle g1', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select * from waffle.create_game(
  (select handle from club1), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);

-- Validation (as ada, a player). These raise before any mutation.
select throws_ok(
  format($$ select waffle.submit_swap(%L::uuid, 6, 0) $$, (select id from g1)),
  'P0001', NULL, 'cannot swap a hole cell');
select throws_ok(
  format($$ select waffle.submit_swap(%L::uuid, 0, 0) $$, (select id from g1)),
  'P0001', NULL, 'cannot swap a cell with itself');
select throws_ok(
  format($$ select waffle.submit_swap(%L::uuid, 0, 25) $$, (select id from g1)),
  'P0001', NULL, 'positions must be in 0..24');

-- A non-player cannot swap (dee is not in this club).
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select waffle.submit_swap(%L::uuid, 0, 1) $$, (select id from g1)),
  '42501', NULL, 'a non-player cannot swap');

-- Lock-step: ada makes a NON-solving swap (cells 2,3). Every player's
-- board moves together.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select waffle.submit_swap((select id from g1), 2, 3);

reset role;
select is(
  (select count(distinct board) from waffle.players where game_id = (select id from g1)),
  1::bigint,
  'a coop swap updates every player in lock-step (boards stay identical)');
select is(
  (select max(swaps_used) from waffle.players where game_id = (select id from g1)),
  1,
  'swaps_used incremented for all players');
select is(
  (select play_state from common.games where id = (select id from g1)),
  'playing',
  'game still in progress after a non-solving swap');
select ok(
  (select solution from waffle.games_state where id = (select id from g1)) is null,
  'solution stays hidden (NULL) while playing');

-- Either player can swap (coop): bea undoes 2,3, then solves with 0,1.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select waffle.submit_swap((select id from g1), 2, 3);    -- undo
create temp table win on commit drop as
select waffle.submit_swap((select id from g1), 0, 1) as res;   -- solve

select is((select (res->>'solved')::boolean from win), true,
  'the solving swap reports solved');
select is((select (res->>'terminal')::boolean from win), true,
  'the solving swap reports terminal');

reset role;
select is(
  (select play_state from common.games where id = (select id from g1)),
  'won',
  'coop solve → play_state won');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g1) and (result->>'won')::boolean),
  2::bigint,
  'both players recorded as won');
select is(
  (select solution from waffle.games_state where id = (select id from g1))::text,
  'abcdef.g.hijklmn.o.pqrstu',
  'solution revealed once the game is terminal');

-- ── Game 2: lose on a tight budget ──────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club2 on commit drop as
select common.create_club('Waffle g2', array['ada', 'bea']) as handle;
create temp table g2 on commit drop as
select * from waffle.create_game(
  (select handle from club2), pg_temp.waffle_setup(0),   -- max_swaps = par(1)+0 = 1
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);

-- One non-solving swap exhausts the 1-swap budget.
create temp table lose on commit drop as
select waffle.submit_swap((select id from g2), 2, 3) as res;

select is((select (res->>'terminal')::boolean from lose), true,
  'exhausting the budget → terminal');
select is((select (res->>'solved')::boolean from lose), false,
  'not solved');

reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'lost',
  'running out of swaps without solving → play_state lost');

select * from finish();
rollback;
