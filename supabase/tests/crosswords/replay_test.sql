-- ============================================================
-- Test: crosswords.replay_board (restart this board from scratch)
-- ============================================================
-- The "Restart" game-menu item. Wipes everything the players did on the SAME
-- game row — fills, pencil, revealed + wrong flags, cryptic edge marks — while
-- the frozen template (and its givens) stays. Replaced `clear_board` on
-- 2026-08-03: one name, one path, like every other game. Two differences from
-- what it replaced: it works at ANY play state (a finished puzzle can be run
-- back), and it clears EVERY owner's grid, because a restart is a whole-table
-- thing rather than a per-player one.
--
-- Split out of gameplay_test.sql so every game files its replay coverage the
-- same way (twelve already had a `replay_test.sql`; crosswords and strands were
-- the two that didn't).
--
-- What this canNOT see, and what does the seeing instead: both halves of the
-- 2026-08-05 Restart bug were CLIENT-side — a revealed solution cached in
-- component state, and a terminal verdict pushed into stored feedback — so this
-- file was green throughout. `e2e/restart-resets.e2e.ts` covers that half.

begin;
set search_path = crosswords, common, public, extensions;
select plan(8);

\ir ../_shared/setup.psql
\ir setup.psql

-- Puzzles are inserted as superuser (authenticated has no INSERT grant on
-- crosswords.puzzles) BEFORE any as_user() role switch.
select pg_temp.xw_insert_puzzle('h-2x2', pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_id \gset

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select common.create_club('XW Replay', array['ada', 'bea', 'cade']) as club_handle \gset
reset role;

-- ── replay_board (restart: restore the grid to initial) ──────────────
-- Replaced `clear_board` 2026-08-03 — one name, one path, like every other
-- game. Two differences from what it replaced: it works at ANY play state (a
-- finished puzzle can be run back), and it clears EVERY owner's grid, because a
-- restart is a whole-table thing.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select id as gcl_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop') \gset
-- Dirty the shared grid: a fill, a pencil, a revealed cell, a wrong flag, a mark.
select set_cell from crosswords.set_cell(:'gcl_id', 0, 0, 'c', false);
select set_cell from crosswords.set_cell(:'gcl_id', 0, 1, 'z', true);
select crosswords.reveal_cells(:'gcl_id', '[{"row":1,"col":0}]'::jsonb);
select crosswords.check_cells(:'gcl_id', '[{"row":0,"col":1}]'::jsonb);
select set_mark from crosswords.set_mark(:'gcl_id', 0, 0, 'right', 'break');
select crosswords.replay_board(:'gcl_id');
reset role;
select is(
  (select count(*)::int from crosswords.cells
     where game_id = :'gcl_id' and owner_id is null and fill is not null),
  0, 'replay_board blanks every fill on the shared grid');
select is(
  (select bool_or(revealed or wrong or pencil) from crosswords.cells
     where game_id = :'gcl_id' and owner_id is null),
  false, 'replay_board resets the revealed / wrong / pencil flags');
select is(
  (select mark_right from crosswords.cells
     where game_id = :'gcl_id' and owner_id is null and row = 0 and col = 0),
  null, 'replay_board drops cryptic edge marks');
select is(
  (select count(*)::int from crosswords.cells where game_id = :'gcl_id'),
  4, 'replay_board keeps the cell rows (givens live on the template, untouched)');
select is(
  (select play_state from common.games where id = :'gcl_id'),
  'playing', 'replay_board leaves the game playing');

-- Non-player cannot restart.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format('select crosswords.replay_board(%L)', :'gcl_id'),
  '42501', null, 'replay_board: a non-player is rejected');
reset role;

-- Compete: a restart re-opens the race for EVERYONE (the widening from
-- clear_board, which only ever touched the caller's own grid).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select id as gpcl_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete') \gset
select set_cell from crosswords.set_cell(:'gpcl_id', 0, 0, 'c', false);
reset role;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select set_cell from crosswords.set_cell(:'gpcl_id', 0, 0, 'c', false);
reset role;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.replay_board(:'gpcl_id');
reset role;
select is(
  (select count(*)::int from crosswords.cells
     where game_id = :'gpcl_id' and owner_id = 'ada11111-1111-1111-1111-111111111111'
       and fill is not null),
  0, 'replay_board (compete): the caller''s grid is blanked');
select is(
  (select count(*)::int from crosswords.cells
     where game_id = :'gpcl_id' and owner_id = 'bea22222-2222-2222-2222-222222222222'
       and fill is not null),
  0, 'replay_board (compete): the opponent''s grid is blanked too — a restart is for the table');


select * from finish();
rollback;
