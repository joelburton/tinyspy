-- cs-unmet

-- ============================================================
-- Test: crosswords.replay_board (restart this board from scratch)
-- ============================================================
-- The "Restart" game-menu item. Wipes everything the players did on the SAME
-- game row — fills, pencil, revealed + wrong flags, cryptic edge marks — while
-- the frozen template (and its givens) stays. It works mid-game or after the
-- game has ended (a finished puzzle can be run back, and the ending is
-- cleared), and it clears EVERY owner's grid, because a restart is a
-- whole-table thing rather than a per-player one.
--
-- What this canNOT see: the client-side half of a restart — a revealed
-- solution cached in component state, an ending pushed into stored feedback.
-- `e2e/restart-resets.e2e.ts` covers that half.

begin;
set search_path = crosswords, common, public, extensions;
select plan(9);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- Puzzles are inserted as superuser (authenticated has no INSERT grant on
-- crosswords.puzzles) BEFORE any as_user() role switch.
select pg_temp.xw_insert_puzzle('h-2x2', pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_id \gset

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.create_club('XW Replay', array['ada', 'bea', 'cade']) as club_handle \gset
reset role;

-- ── replay_board (restart: restore the grid to initial) ──────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select (crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as gcl_id \gset
-- Dirty the shared grid: a fill, a pencil, a revealed cell, a wrong flag, a mark.
select crosswords.set_cell(:'gcl_id', 0, 0, 'c', false);
select crosswords.set_cell(:'gcl_id', 0, 1, 'z', true);
select crosswords.reveal_cells(:'gcl_id', '[{"row":1,"col":0}]'::jsonb);
select crosswords.check_cells(:'gcl_id', '[{"row":0,"col":1}]'::jsonb);
select crosswords.set_mark(:'gcl_id', 0, 0, 'right', 'break');
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
  (select ended_at from common.games where id = :'gcl_id'),
  null, 'replay_board leaves the game being played');

-- After the end: a Stop, then a restart clears the ending.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.stop_game(:'gcl_id');
select crosswords.replay_board(:'gcl_id');
reset role;
select is(
  (select (ended_at is null)::text || '/' || coalesce(game_ended_reason, 'none') || '/' || restart_count
     from common.games where id = :'gcl_id'),
  'true/none/2', 'replay_board after the end clears the ending (restart_count counts both restarts)');

-- Non-player cannot restart.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  crosswords.replay_board(:'gcl_id'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'replay_board: a non-player is rejected');
reset role;

-- Compete: a restart re-opens the race for EVERYONE, not just the caller's
-- own grid.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select (crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as gpcl_id \gset
select crosswords.set_cell(:'gpcl_id', 0, 0, 'c', false);
reset role;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select crosswords.set_cell(:'gpcl_id', 0, 0, 'c', false);
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
