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
select plan(11);

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
  pg_temp.xw_grid(:'gcl_id', null),
  '{}'::jsonb, 'replay_board blanks the shared grid: every fill, flag and mark');
select is(
  (select count(*)::int from crosswords.grids where game_id = :'gcl_id'),
  1, 'replay_board keeps the grid itself');
select is(
  (select game_data -> 'team' -> 'board' -> 'fills' from common.games where id = :'gcl_id'),
  '["", "", "", ""]'::jsonb, 'the page blob is rebuilt blank');
select is(
  (select puzzle_content -> 'cells' from crosswords.games where game_id = :'gcl_id'),
  pg_temp.xw_meta_2x2() -> 'cells', 'the template is untouched (givens live there)');
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
  pg_temp.xw_grid(:'gpcl_id', 'ada11111-1111-1111-1111-111111111111'),
  '{}'::jsonb, 'replay_board (compete): the caller''s grid is blanked');
select is(
  pg_temp.xw_grid(:'gpcl_id', 'bea22222-2222-2222-2222-222222222222'),
  '{}'::jsonb, 'replay_board (compete): the opponent''s grid is blanked too — a restart is for the table');

-- A template that starts the grid with something in it — an NYT overlay's
-- author bar on (0,0) and an upload's saved letter on (0,1) — starts again
-- with exactly that: the players' work goes, the template's comes back.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select (crosswords.create_game(
  :'club_handle', '{"timer":{"kind":"none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop',
  jsonb_build_object(
    'meta', jsonb_set(
              jsonb_set(pg_temp.xw_meta_2x2(), '{cells,0,0,markRight}', '"break"'),
              '{cells,0,1,fill}', '"a"'),
    'solution', pg_temp.xw_sol_2x2()))->'data'->>'id')::uuid as gst_id \gset
reset role;
select pg_temp.xw_grid(:'gst_id', null) as started \gset
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.set_mark(:'gst_id', 0, 0, 'right', null);
select crosswords.set_cell(:'gst_id', 0, 1, 'x', false);
select crosswords.set_cell(:'gst_id', 1, 1, 's', true);
select crosswords.replay_board(:'gst_id');
reset role;
select is(
  pg_temp.xw_grid(:'gst_id', null),
  :'started'::jsonb,
  'replay_board starts the grid exactly as the game started it: the author''s bar and the saved letter come back');
select is(
  :'started'::jsonb,
  '{"0,0": {"markRight": "break"}, "0,1": {"fill": "A"}}'::jsonb,
  'precondition: the game started with the bar and the saved letter');


select * from finish();
rollback;
