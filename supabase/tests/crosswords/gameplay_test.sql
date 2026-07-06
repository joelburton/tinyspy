begin;
set search_path = crosswords, common, public, extensions;
select plan(19);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.xw_insert_puzzle('h-2x2', pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_id \gset
select pg_temp.xw_insert_puzzle('h-given', pg_temp.xw_meta_given(), pg_temp.xw_sol_given()) as pzg_id \gset

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select common.create_club('XW Club', array['ada', 'bea', 'cade']) as club_handle \gset

-- Coop game (ada + bea share one grid), a compete game, and a given game.
select id as gc_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop') \gset
select id as gp_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete') \gset
select id as gg_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pzg_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop') \gset

-- ── set_cell ─────────────────────────────────────────────────────────
-- Lowercase input is uppercased; version starts at 0 and bumps to 1.
select version as sv1, solved as ss1
  from crosswords.set_cell(:'gc_id', 0, 0, 'c', false) \gset
select is(:'sv1'::bigint, 1::bigint, 'set_cell returns the bumped version (1)');
select is(:'ss1'::boolean, false, 'one filled cell is not solved');

reset role;
select is((select fill from crosswords.cells
             where game_id = :'gc_id' and owner_id is null and row = 0 and col = 0),
  'C', 'set_cell uppercases the fill');
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- A second write to the same cell bumps the version again.
select version as sv2 from crosswords.set_cell(:'gc_id', 0, 0, 'x', false) \gset
select is(:'sv2'::bigint, 2::bigint, 'second write to a cell bumps version to 2');

-- Pencil is stored when a letter is present.
select set_cell from crosswords.set_cell(:'gc_id', 0, 1, 'a', true);
reset role;
select is((select pencil from crosswords.cells
             where game_id = :'gc_id' and owner_id is null and row = 0 and col = 1),
  true, 'set_cell stores the pencil flag');
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- Given cells have no row and can't be written.
select throws_ok(
  format('select crosswords.set_cell(%L, 0, 0, %L, false)', :'gg_id', 'z'),
  'P0001', null, 'given cell is not editable');

-- Over-long fill is rejected.
select throws_ok(
  format('select crosswords.set_cell(%L, 1, 0, %L, false)', :'gc_id', 'ABCDEFGHI'),
  'P0001', null, 'fill over 8 characters is rejected');

reset role;
-- Non-player can't write.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format('select crosswords.set_cell(%L, 1, 0, %L, false)', :'gc_id', 'a'),
  '42501', null, 'non-player cannot set a cell');
reset role;

-- ── check_cells ──────────────────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- (0,0) currently holds 'X' (wrong; answer is C). Check flags it.
select crosswords.check_cells(:'gc_id', '[{"row":0,"col":0}]'::jsonb);
reset role;
select is((select wrong from crosswords.cells
             where game_id = :'gc_id' and owner_id is null and row = 0 and col = 0),
  true, 'check flags a wrong cell');

-- (0,1) holds pencil 'A' (right answer, but pencil) — check skips pencil.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.check_cells(:'gc_id', '[{"row":0,"col":1}]'::jsonb);
reset role;
select is((select wrong from crosswords.cells
             where game_id = :'gc_id' and owner_id is null and row = 0 and col = 1),
  false, 'check skips pencil cells (leaves wrong = false)');

-- Correcting the cell + re-checking clears wrong.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select set_cell from crosswords.set_cell(:'gc_id', 0, 0, 'c', false);
select crosswords.check_cells(:'gc_id', '[{"row":0,"col":0}]'::jsonb);
reset role;
select is((select wrong from crosswords.cells
             where game_id = :'gc_id' and owner_id is null and row = 0 and col = 0),
  false, 'check clears wrong once the cell is corrected');

-- ── reveal_cells ─────────────────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.reveal_cells(:'gc_id', '[{"row":1,"col":0}]'::jsonb);
reset role;
select is((select fill from crosswords.cells
             where game_id = :'gc_id' and owner_id is null and row = 1 and col = 0),
  'T', 'reveal writes the canonical answer (T)');
select is((select revealed from crosswords.cells
             where game_id = :'gc_id' and owner_id is null and row = 1 and col = 0),
  true, 'reveal marks the cell revealed');

-- Reveal is coop-only.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format('select crosswords.reveal_cells(%L, %L::jsonb)', :'gp_id', '[{"row":0,"col":0}]'),
  'P0001', null, 'reveal is rejected in compete');
reset role;

-- ── _matches (mirror ws.ts fillMatchesSolution) ──────────────────────
-- The first-letter shortcut is keyed on the candidate STRING's length
-- (a multi-char rebus answer), NOT on the number of candidates. So a
-- single-candidate rebus DOES accept its bare first letter — this pins
-- the divergence from the old (misread) count-keyed rule, which rejected
-- it. See _matches's docstring and ws.ts fillMatchesSolution.
select is(crosswords._matches('HEART', '["HEART"]'::jsonb), true,
  '_matches: exact rebus');
select is(crosswords._matches('H', '["HEART"]'::jsonb), true,
  '_matches: single-candidate rebus accepts the bare first letter (keyed on candidate length)');
select is(crosswords._matches('HE', '["HEART"]'::jsonb), false,
  '_matches: only the bare first letter or the full string — a longer prefix is not accepted');
select is(crosswords._matches('H', '["HEART","LUNGS"]'::jsonb), true,
  '_matches: Schrödinger cell with multi-char candidates accepts the bare first letter');
select is(crosswords._matches(null, '["A"]'::jsonb), false,
  '_matches: empty fill never matches');

select * from finish();
rollback;
