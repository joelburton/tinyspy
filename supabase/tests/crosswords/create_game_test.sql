begin;
set search_path = crosswords, common, public, extensions;
select plan(18);

\ir ../_shared/setup.psql
\ir setup.psql

-- Puzzles are inserted as the superuser (authenticated has no INSERT grant
-- on crosswords.puzzles — the library is CLI/edge-fn seeded). Capture ids
-- as psql vars so they survive the role switches below.
select pg_temp.xw_insert_puzzle('h-2x2', pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_id \gset
select pg_temp.xw_insert_puzzle('h-given', pg_temp.xw_meta_given(), pg_temp.xw_sol_given()) as pzg_id \gset

-- A three-member club (ada, bea, cade), created as ada.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select common.create_club('XW Club', array['ada', 'bea', 'cade']) as club_handle \gset

-- ── Coop happy path ──────────────────────────────────────────────────
select id as gc_id
  from crosswords.create_game(
    :'club_handle', pg_temp.xw_setup(:'pz_id'),
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop') \gset
reset role;

select ok(
  exists(select 1 from crosswords.games where id = :'gc_id'),
  'coop create_game returns a game id');

select is(
  (select mode from crosswords.games where id = :'gc_id'),
  'coop', 'coop game row has mode = coop');

select is(
  (select play_state from common.games where id = :'gc_id'),
  'playing', 'common.games header is playing');

select is(
  (select count(*)::int from crosswords.cells where game_id = :'gc_id'),
  4, 'coop pre-inserts 4 cells (2x2 all-open, one shared grid)');

select ok(
  (select bool_and(owner_id is null) from crosswords.cells where game_id = :'gc_id'),
  'coop cells all have null owner (shared grid)');

select is(
  (select meta -> 'title' from crosswords.games where id = :'gc_id'),
  '"Toy"'::jsonb, 'meta is copied from the puzzle');

-- ── Compete: one grid per player ─────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select id as gp_id
  from crosswords.create_game(
    :'club_handle', pg_temp.xw_setup(:'pz_id'),
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    'compete') \gset
reset role;

select is(
  (select count(*)::int from crosswords.cells where game_id = :'gp_id'),
  8, 'compete pre-inserts one grid per player (2 x 4 = 8 cells)');

select is(
  (select count(*)::int from crosswords.cells
    where game_id = :'gp_id'
      and owner_id = 'ada11111-1111-1111-1111-111111111111'),
  4, 'each compete player gets their own 4-cell grid');

-- ── Given cells are excluded from the cells table ────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select id as gg_id
  from crosswords.create_game(
    :'club_handle', pg_temp.xw_setup(:'pzg_id'),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop') \gset
reset role;

select is(
  (select count(*)::int from crosswords.cells where game_id = :'gg_id'),
  3, 'given cell (0,0) is excluded — 3 fillable cells, not 4');

-- ── Inline board path (the NYT edge-function path — puzzle data passed
--    straight in, NOT via a crosswords.puzzles row) ────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select id as gb_id from crosswords.create_game(
  :'club_handle', '{"timer":{"kind":"none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop',
  jsonb_build_object('meta', pg_temp.xw_meta_2x2(), 'solution', pg_temp.xw_sol_2x2())) \gset
reset role;

select ok(
  exists(select 1 from crosswords.games where id = :'gb_id'),
  'inline board create_game creates a self-contained game');
select is(
  (select puzzle_id from crosswords.games where id = :'gb_id'),
  null, 'inline board game has a null puzzle_id (not from the library)');
select is(
  (select count(*)::int from crosswords.cells where game_id = :'gb_id'),
  4, 'inline board pre-inserts the fillable cells');

-- ── Guards ───────────────────────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select throws_ok(
  format('select crosswords.create_game(%L, %s, array[%L]::uuid[], %L)',
         :'club_handle', quote_literal(pg_temp.xw_setup(:'pz_id')),
         'ada11111-1111-1111-1111-111111111111', 'compete'),
  'P0001', null, 'compete with 1 player is rejected');

select throws_ok(
  format('select crosswords.create_game(%L, %L::jsonb, array[%L]::uuid[], %L)',
         :'club_handle', '{"timer":{"kind":"none"}}',
         'ada11111-1111-1111-1111-111111111111', 'coop'),
  'P0001', null, 'missing puzzle_id is rejected');

reset role;

-- Non-member cannot create in this club.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format('select crosswords.create_game(%L, %s, array[%L]::uuid[], %L)',
         :'club_handle', quote_literal(pg_temp.xw_setup(:'pz_id')),
         'dee44444-4444-4444-4444-444444444444', 'coop'),
  '42501', null, 'non-member cannot create a game in the club');
reset role;

-- ── Solution shielding ───────────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select ok(
  (select solution from crosswords.games_state where id = :'gc_id') is null,
  'mid-game: games_state.solution is NULL (hidden until terminal)');

select throws_ok(
  format('select solution from crosswords.games where id = %L', :'gc_id'),
  '42501', null, 'authenticated cannot select crosswords.games.solution');

select throws_ok(
  format('select solution from crosswords.puzzles where id = %L', :'pz_id'),
  '42501', null, 'authenticated cannot select crosswords.puzzles.solution');

reset role;

select * from finish();
rollback;
