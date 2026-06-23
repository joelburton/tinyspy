-- ============================================================
-- Test: waffle — the hidden answer key (`solution`)
-- ============================================================
-- waffle's core hidden-info invariant: a player must not be able to read
-- the solution before the game ends, or solving would be trivial.
-- compete_test covers the per-player BOARD hiding; this file covers the
-- SOLUTION, which is the same answer for everyone:
--
--   1. `waffle.games.solution` is column-grant-excluded — not selectable
--      by an authenticated player even though they can see the row.
--   2. `games_state.solution` is NULL mid-game (the SECURITY DEFINER
--      `_solution_for` gates on is_terminal).
--   3. ...and is revealed once the game is terminal.
--
-- A coop game is used so a single solve ends it. The mirror of wordle's
-- target test and monkeygram's `pool` column-exclusion test.

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(3);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Waffle secret', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board());   -- solution 'abcdef.g.hijklmn.o.pqrstu', 1 swap away

-- (1) The raw column is not selectable by an authenticated player.
select throws_ok(
  format($$ select solution from waffle.games where id = %L $$, (select id from g)),
  '42501', null,
  'waffle.games.solution is column-excluded from authenticated'
);

-- (2) Mid-game, games_state hides it.
select ok(
  (select solution from waffle.games_state where id = (select id from g)) is null,
  'mid-game: games_state.solution is NULL'
);

-- ada solves (coop → the solve ends the game).
select waffle.submit_swap((select id from g), 0, 1);

-- (3) Post-terminal, the answer key is revealed.
select is(
  (select solution from waffle.games_state where id = (select id from g))::text,
  'abcdef.g.hijklmn.o.pqrstu',
  'post-terminal: games_state.solution is revealed'
);

select * from finish();
rollback;
