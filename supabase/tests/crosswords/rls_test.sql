-- cs-unmet

begin;
set search_path = crosswords, common, public, extensions;
select plan(4);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.xw_insert_puzzle('h-2x2', pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_id \gset

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.create_club('XW Club', array['ada', 'bea', 'cade']) as club_handle \gset

select (crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as gc_id \gset
reset role;

-- ── crosswords.grids: no client read at all ──────────────────────────
-- The page reads the grids through the blobs on common.games, and a racer's
-- view of a rival's grid mid-race is the seat rule's, in makeGameData. So the
-- table has no grant, and even a player of the game cannot select it.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format('select cells from crosswords.grids where game_id = %L', :'gc_id'),
  '42501', null, 'grids: even a player of the game cannot read the table');
reset role;

-- ── crosswords.games row-RLS (the other half of the shielding story) ─
-- A club member sees the game row; a non-member sees none. (The solution
-- COLUMN grant is pinned in create_game_test; this is the ROW policy.)
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from crosswords.games where game_id = :'gc_id'),
  1, 'games: a club member sees the game row');
reset role;
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from crosswords.games where game_id = :'gc_id'),
  0, 'games: a non-member sees no game row');
reset role;

-- ── crosswords.puzzles row-RLS: any authenticated user may list ──────
-- The setup-form picker needs to read the (non-solution) puzzle_content of every
-- library puzzle, regardless of club — so even a non-member of this club
-- sees the puzzle row (the solution column stays shielded, tested elsewhere).
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from crosswords.puzzles where id = :'pz_id'),
  1, 'puzzles: any authenticated user can list a library puzzle');
reset role;

select * from finish();
rollback;
