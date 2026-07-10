begin;
set search_path = crosswords, common, public, extensions;
select plan(28);

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

-- The game's human title is the PUZZLE's title (like crossplay names a game after
-- the loaded puzzle), not a generic "New crossword".
select is(
  (select title from common.games where id = :'gc_id'),
  'Toy', 'common.games title is the puzzle title');

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
select is(
  (select fill from crosswords.cells where game_id = :'gb_id' and owner_id is null and row = 0 and col = 0),
  null, 'a blank template seeds cells with NULL fill');

-- Partially-solved upload (finding 1.3): a non-given cell carrying a saved
-- `fill` in the template imports WITH that progress restored (crossplay's
-- ipuz `saved` round-trip). Set (0,1)'s fill to 'a' on the 2x2 meta.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select id as gsav_id from crosswords.create_game(
  :'club_handle', '{"timer":{"kind":"none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop',
  jsonb_build_object(
    'meta', jsonb_set(pg_temp.xw_meta_2x2(), '{cells,0,1,fill}', '"a"'),
    'solution', pg_temp.xw_sol_2x2())) \gset
reset role;
select is(
  (select fill from crosswords.cells where game_id = :'gsav_id' and owner_id is null and row = 0 and col = 1),
  'A', 'a partial upload restores the saved fill (uppercased) on import');
select is(
  (select fill from crosswords.cells where game_id = :'gsav_id' and owner_id is null and row = 0 and col = 0),
  null, 'cells without a saved fill still import blank');

-- ── Template cryptic marks seed into the live cells ──────────────────
-- The NYT overlay import applies author word-break bars onto meta.cells;
-- create_game must seed them into crosswords.cells (mark_right/mark_bottom)
-- so they render on the board + PDFs (which read marks from the live cells,
-- not the template). Drive an inline board whose (0,0) carries both marks.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select id as gmk_id from crosswords.create_game(
  :'club_handle', '{"timer":{"kind":"none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop',
  jsonb_build_object(
    'meta', jsonb_set(
              jsonb_set(pg_temp.xw_meta_2x2(), '{cells,0,0,markRight}', '"break"'),
              '{cells,0,0,markBottom}', '"hyphen"'),
    'solution', pg_temp.xw_sol_2x2())) \gset
reset role;
select is(
  (select mark_right from crosswords.cells
     where game_id = :'gmk_id' and owner_id is null and row = 0 and col = 0),
  'break', 'template markRight seeds cells.mark_right (overlay/author bars render)');
select is(
  (select mark_bottom from crosswords.cells
     where game_id = :'gmk_id' and owner_id is null and row = 0 and col = 0),
  'hyphen', 'template markBottom seeds cells.mark_bottom');
select is(
  (select mark_right from crosswords.cells
     where game_id = :'gmk_id' and owner_id is null and row = 1 and col = 1),
  null, 'a cell without a template mark seeds NULL mark_right');

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

-- ── Setup-strip backstop (finding 1.1) ───────────────────────────────
-- A `board` (+ `filename`) can linger in the setup blob after an upload →
-- tab-switch. create_game must strip both from what it persists (the
-- unshielded status jsonb + the club's saved default), or an uploaded
-- solution grid leaks + self-perpetuates. Drive a library create whose
-- setup carries a bogus board and assert neither destination keeps it.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select id as gl_id from crosswords.create_game(
  :'club_handle',
  pg_temp.xw_setup(:'pz_id')
    || jsonb_build_object(
         'board', jsonb_build_object('meta', '{}'::jsonb, 'solution', '["LEAK"]'::jsonb),
         'filename', 'secret.puz'),
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop') \gset
reset role;

select ok(
  not ((select setup from common.games where id = :'gl_id') ? 'board'),
  'create_game strips `board` from the persisted (unshielded) setup');
select ok(
  not ((select setup from common.games where id = :'gl_id') ? 'filename'),
  'create_game strips `filename` from the persisted setup');
select ok(
  not ((select default_setup from common.clubs_gametypes
         where club_handle = :'club_handle' and gametype = 'crosswords_coop') ? 'board'),
  'the club saved-default (default_setup) also carries no `board`');

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
