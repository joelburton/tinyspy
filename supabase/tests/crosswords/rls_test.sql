begin;
set search_path = crosswords, common, public, extensions;
select plan(9);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.xw_insert_puzzle('h-2x2', pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_id \gset

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select common.create_club('XW Club', array['ada', 'bea', 'cade']) as club_handle \gset

select id as gc_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop') \gset
select id as gp_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete') \gset
reset role;

-- ── Coop: the shared grid is visible to any club member ──────────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from crosswords.cells where game_id = :'gc_id'),
  4, 'coop: a club member sees the whole shared grid');
reset role;

-- ── Compete mid-game: you see only your own grid ─────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from crosswords.cells
     where game_id = :'gp_id' and owner_id = 'ada11111-1111-1111-1111-111111111111'),
  4, 'compete: you see your own 4 cells');
select is(
  (select count(*)::int from crosswords.cells
     where game_id = :'gp_id' and owner_id = 'bea22222-2222-2222-2222-222222222222'),
  0, 'compete mid-game: an opponent''s grid is hidden');
reset role;

-- Non-member sees nothing at all.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from crosswords.cells where game_id = :'gp_id'),
  0, 'non-member sees no cells');
reset role;

-- ── Compete terminal: opponents' grids open up ───────────────────────
-- ada solves her grid → the game becomes terminal.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select set_cell from crosswords.set_cell(:'gp_id', 0, 0, 'c', false);
select set_cell from crosswords.set_cell(:'gp_id', 0, 1, 'a', false);
select set_cell from crosswords.set_cell(:'gp_id', 1, 0, 't', false);
select set_cell from crosswords.set_cell(:'gp_id', 1, 1, 's', false);
reset role;

select is((select is_terminal from common.games where id = :'gp_id'), true,
  'compete solved → terminal');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from crosswords.cells
     where game_id = :'gp_id' and owner_id = 'ada11111-1111-1111-1111-111111111111'),
  4, 'compete terminal: an opponent''s grid becomes visible');
reset role;

-- ── crosswords.games row-RLS (the other half of the shielding story) ─
-- A club member sees the game row; a non-member sees none. (The solution
-- COLUMN grant is pinned in create_game_test; this is the ROW policy.)
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from crosswords.games where id = :'gc_id'),
  1, 'games: a club member sees the game row');
reset role;
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from crosswords.games where id = :'gc_id'),
  0, 'games: a non-member sees no game row');
reset role;

-- ── crosswords.puzzles row-RLS: any authenticated user may list ──────
-- The setup-form picker needs to read the (non-solution) meta of every
-- library puzzle, regardless of club — so even a non-member of this club
-- sees the puzzle row (the solution column stays shielded, tested elsewhere).
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from crosswords.puzzles where id = :'pz_id'),
  1, 'puzzles: any authenticated user can list a library puzzle');
reset role;

select * from finish();
rollback;
