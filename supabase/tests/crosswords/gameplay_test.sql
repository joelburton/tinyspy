begin;
set search_path = crosswords, common, public, extensions;
select plan(33);

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

-- A non-letter fill is rejected (mirror ws.ts `^[A-Z]{1,8}$`).
select throws_ok(
  format('select crosswords.set_cell(%L, 1, 0, %L, false)', :'gc_id', '1'),
  'P0001', null, 'non-letter fill is rejected');

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

-- A revealed cell stays editable and KEEPS its revealed flag (applyFill).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select set_cell from crosswords.set_cell(:'gc_id', 1, 0, 'z', false);
reset role;
select is((select fill from crosswords.cells
             where game_id = :'gc_id' and owner_id is null and row = 1 and col = 0),
  'Z', 'a revealed cell is still editable');
select is((select revealed from crosswords.cells
             where game_id = :'gc_id' and owner_id is null and row = 1 and col = 0),
  true, 'editing a revealed cell keeps the revealed flag');

-- Reveal clears an existing pencil flag on the target (a pencil-then-reveal).
-- (1,1)'s answer is S; grid stays unsolved since (1,0) now holds a wrong Z.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select set_cell from crosswords.set_cell(:'gc_id', 1, 1, 'z', true);
select crosswords.reveal_cells(:'gc_id', '[{"row":1,"col":1}]'::jsonb);
reset role;
select is((select pencil from crosswords.cells
             where game_id = :'gc_id' and owner_id is null and row = 1 and col = 1),
  false, 'reveal clears the pencil flag on the revealed cell');

-- Reveal is coop-only.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format('select crosswords.reveal_cells(%L, %L::jsonb)', :'gp_id', '[{"row":0,"col":0}]'),
  'P0001', null, 'reveal is rejected in compete');
reset role;

-- ── set_mark (cryptic edge marks) ────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- Set + cycle the RIGHT-edge mark on (0,0).
select set_mark from crosswords.set_mark(:'gc_id', 0, 0, 'right', 'break');
reset role;
select is((select mark_right from crosswords.cells
             where game_id = :'gc_id' and owner_id is null and row = 0 and col = 0),
  'break', 'set_mark sets the right-edge mark');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select set_mark from crosswords.set_mark(:'gc_id', 0, 0, 'right', 'hyphen');
-- Setting the BOTTOM edge must leave the right edge untouched.
select set_mark from crosswords.set_mark(:'gc_id', 0, 0, 'bottom', 'break');
reset role;
select is((select mark_right from crosswords.cells
             where game_id = :'gc_id' and owner_id is null and row = 0 and col = 0),
  'hyphen', 'set_mark cycles the right edge (break → hyphen)');
select is((select mark_bottom from crosswords.cells
             where game_id = :'gc_id' and owner_id is null and row = 0 and col = 0),
  'break', 'set_mark sets the bottom edge without disturbing the right edge');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select set_mark from crosswords.set_mark(:'gc_id', 0, 0, 'right', null);
reset role;
select is((select mark_right from crosswords.cells
             where game_id = :'gc_id' and owner_id is null and row = 0 and col = 0),
  null, 'set_mark with null clears the edge');

-- A given cell has no row → marks are rejected (plan option A).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format('select crosswords.set_mark(%L, 0, 0, %L, %L)', :'gg_id', 'right', 'break'),
  'P0001', null, 'set_mark on a given cell is rejected');
-- Invalid side is rejected.
select throws_ok(
  format('select crosswords.set_mark(%L, 0, 0, %L, %L)', :'gc_id', 'sideways', 'break'),
  'P0001', null, 'set_mark rejects an invalid side');
reset role;

-- ── reveal_solved_word (leak-safe answer read for Explain) ───────────
-- gc's across word (0,0),(0,1) is correctly filled (C, A) → the answer comes
-- back. The down word (0,0),(1,0) has a WRONG (1,0)='Z' (answer T) → solved
-- false, no answer (never leaks the letter the player hasn't solved).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select solved from crosswords.reveal_solved_word(:'gc_id', '[{"row":0,"col":0},{"row":0,"col":1}]'::jsonb)),
  true, 'reveal_solved_word: a correctly-filled word is solved');
select is(
  (select answer from crosswords.reveal_solved_word(:'gc_id', '[{"row":0,"col":0},{"row":0,"col":1}]'::jsonb)),
  'CA', 'reveal_solved_word: returns the answer for a solved word');
select is(
  (select solved from crosswords.reveal_solved_word(:'gc_id', '[{"row":0,"col":0},{"row":1,"col":0}]'::jsonb)),
  false, 'reveal_solved_word: a wrong cell → not solved');
select is(
  (select answer from crosswords.reveal_solved_word(:'gc_id', '[{"row":0,"col":0},{"row":1,"col":0}]'::jsonb)),
  null::text, 'reveal_solved_word: an unsolved word leaks no answer');
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
