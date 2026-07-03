-- ============================================================
-- Test: waffle — solution visibility (`solution`)
-- ============================================================
-- The answer key's visibility rule, per mode:
--
--   1. `waffle.games.solution` is column-grant-excluded — never selectable
--      directly by an authenticated player (the SECURITY DEFINER helper behind
--      `games_state` is the only path), in EITHER mode.
--   2. COOP exposes it during play: it's a collaborative solve and the
--      turn-history viewer recomputes past boards' colors on the FE (which needs
--      the answer). Per the trust model we don't gate this against friends.
--   3. COMPETE hides it mid-game (players race on independent boards; no swap log,
--      so no history feature needs it there) and reveals it once terminal.
--
-- The mirror of wordle's target test, updated when coop turn-history landed.

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(4);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Waffle secret', array['ada', 'bea']) as handle;

-- A coop game and a compete game on the same deterministic board.
create temp table gc on commit drop as
select * from waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board());   -- solution 'abcdef.g.hijklmn.o.pqrstu', 1 swap away
create temp table gp on commit drop as
select * from waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.waffle_board());

-- (1) The raw column is not selectable by an authenticated player (either mode).
select throws_ok(
  format($$ select solution from waffle.games where id = %L $$, (select id from gc)),
  '42501', null,
  'waffle.games.solution is column-excluded from authenticated'
);

-- (2) COOP mid-game: games_state exposes the solution (turn-history needs it).
select is(
  (select solution from waffle.games_state where id = (select id from gc))::text,
  'abcdef.g.hijklmn.o.pqrstu',
  'mid-game coop: games_state.solution is exposed'
);

-- (3) COMPETE mid-game: still hidden.
select ok(
  (select solution from waffle.games_state where id = (select id from gp)) is null,
  'mid-game compete: games_state.solution is NULL'
);

-- ada solves the coop game (coop → the solve ends it); the compete game stays open.
select waffle.submit_swap((select id from gc), 0, 1);

-- (4) Post-terminal coop, the answer key is (still) revealed.
select is(
  (select solution from waffle.games_state where id = (select id from gc))::text,
  'abcdef.g.hijklmn.o.pqrstu',
  'post-terminal coop: games_state.solution is revealed'
);

select * from finish();
rollback;
