-- cs-unmet

-- ============================================================
-- Test: crosswords' page blobs — game_data, summary_data, and shell_data beside them
-- ============================================================
-- `crosswords._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move (supabase/sql/crosswords.sql → The page
-- blobs). This file pins what the page gets:
--
--   1. A fresh game: the template with no solution, the first revision, coop's
--      blank grid on the team (no grid on a player), compete's blank grid on
--      each player (no team), both summaries
--   2. Coop moves, one at a time: a fill in pen, a fill in pencil (lowercase),
--      each writer's digit, the revision each answer names, the edge marks, a
--      check, a reveal, a clear
--   3. Compete: each racer's own grid, no writers; the blob carries every
--      racer's (the hook withholds, not the builder)
--   4. The ending: the solution arrives, shell_data rewritten
--   5. A Restart blanks the grid; the revision keeps rising
--   6. `_rebuild_data_cols_for_all` rewrites every crosswords game without
--      re-dating it
--
-- The puzzle is setup.psql's 2×2, answers C A / T S. A free-for-all game seats
-- its players by username, so ada is writer 1 and bea writer 2.
-- ============================================================

begin;
set search_path = crosswords, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(30);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Crosswords pages', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (crosswords.create_game(
  (select handle from club),
  '{"source": "upload", "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode,
  jsonb_build_object('meta', pg_temp.xw_meta_2x2(), 'solution', pg_temp.xw_sol_2x2())
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;

reset role;
grant select on g to authenticated;

-- Shorthands: each game's id and blobs, one player inside the game_data, a
-- blank packed board, and the common part of a summary as written.
create function pg_temp.coop() returns uuid language sql as
  $$ select id from g where mode = 'coop' $$;
create function pg_temp.compete() returns uuid language sql as
  $$ select id from g where mode = 'compete' $$;
create function pg_temp.game_data(game uuid) returns jsonb language sql as
  $$ select game_data from common.games where id = game $$;
create function pg_temp.summary_data(game uuid) returns jsonb language sql as
  $$ select summary_data from common.games where id = game $$;
create function pg_temp.common_summary(game uuid) returns jsonb language sql as
  $$ select common._make_json_summary_data(game, (select status_changed_at from common.games where id = game)) $$;
create function pg_temp.shell_data(game uuid) returns jsonb language sql as
  $$ select shell_data from common.games where id = game $$;
create function pg_temp.player(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p
      where p ->> 'id' = uid::text $$;
create function pg_temp.coop_board() returns jsonb language sql as
  $$ select pg_temp.game_data(pg_temp.coop()) -> 'team' -> 'board' $$;
create function pg_temp.blank(writers jsonb) returns jsonb language sql as
  $$ select jsonb_build_object(
       'fills', '["", "", "", ""]'::jsonb,
       'wrong', '[]'::jsonb, 'revealed', '[]'::jsonb,
       'breaksRight', '[]'::jsonb, 'hyphensRight', '[]'::jsonb,
       'breaksBottom', '[]'::jsonb, 'hyphensBottom', '[]'::jsonb,
       'writers', writers) $$;

-- ─── (1) A fresh game ───
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'puzzle',
  pg_temp.xw_meta_2x2() || '{"solution": null}'::jsonb,
  'the puzzle is the template as the parsers wrote it, with no solution mid-game'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'revision',
  '1'::jsonb,
  'create_game''s rebuild wrote the first revision'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'team',
  jsonb_build_object('board', pg_temp.blank('"0000"'::jsonb)),
  'coop: the team holds the one grid, blank, with nobody as any cell''s writer'
);
select is(
  pg_temp.player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111') -> 'board',
  'null'::jsonb,
  'coop: a player carries no grid of their own'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'team',
  'null'::jsonb,
  'compete: no team'
);
select is(
  pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') -> 'board',
  pg_temp.blank('null'::jsonb),
  'compete: each racer carries their own blank grid, with no writers'
);
select is(
  pg_temp.summary_data(pg_temp.coop()),
  pg_temp.common_summary(pg_temp.coop()) || '{"nCells": 4, "team": {"nFilledCells": 0}}'::jsonb,
  'the fresh coop summary: the common part, four cells to fill, none filled'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete()) || '{"nCells": 4, "team": null}'::jsonb,
  'the fresh compete summary has no team count'
);

-- ─── (2) Coop moves ───
-- ada writes C in pen at (0,0); bea writes A in pencil at (1,1).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select (crosswords.set_cell(pg_temp.coop(), 0, 0, 'c', false) -> 'data' ->> 'revision')::bigint as rev_ada \gset
reset role;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select (crosswords.set_cell(pg_temp.coop(), 1, 1, 'a', true) -> 'data' ->> 'revision')::bigint as rev_bea \gset
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  array[:rev_ada, :rev_bea]::bigint[],
  array[2, 3]::bigint[],
  'each set_cell answers the revision its own rebuild wrote, one after the other'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'revision',
  to_jsonb(:rev_bea::bigint),
  'the blob carries the latest write''s revision'
);
select is(
  pg_temp.coop_board() -> 'fills',
  '["C", "", "", "a"]'::jsonb,
  'fills are flat, row by row: a letter in pen uppercase, a letter in pencil lowercase'
);
select is(
  pg_temp.coop_board() -> 'writers',
  '"1002"'::jsonb,
  'writers: one digit per cell — ada (1) wrote cell 0, bea (2) cell 3'
);
select is(
  (pg_temp.summary_data(pg_temp.coop()) -> 'team'),
  '{"nFilledCells": 2}'::jsonb,
  'the summary counts the filled cells'
);

-- ada marks a word break on (0,1)'s right edge and a hyphen on (1,0)'s bottom.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.set_mark(pg_temp.coop(), 0, 1, 'right', 'break');
select crosswords.set_mark(pg_temp.coop(), 1, 0, 'bottom', 'hyphen');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select jsonb_build_array(b -> 'breaksRight', b -> 'hyphensRight', b -> 'breaksBottom', b -> 'hyphensBottom')
     from (select pg_temp.coop_board() b) x),
  '[[1], [], [], [2]]'::jsonb,
  'each edge mark is a flat cell index in the list for its side and kind'
);

-- ada writes a wrong X at (0,1) and checks it; checks the right C at (0,0) too.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.set_cell(pg_temp.coop(), 0, 1, 'x', false);
select crosswords.check_cells(pg_temp.coop(), '[{"row": 0, "col": 0}, {"row": 0, "col": 1}]'::jsonb);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  pg_temp.coop_board() -> 'wrong',
  '[1]'::jsonb,
  'a check flags the wrong cell by its index, and not the right one'
);

-- bea reveals (1,0).
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select crosswords.reveal_cells(pg_temp.coop(), '[{"row": 1, "col": 0}]'::jsonb);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select jsonb_build_array(b -> 'fills', b -> 'revealed', b -> 'writers', b -> 'hyphensBottom')
     from (select pg_temp.coop_board() b) x),
  '[["C", "X", "T", "a"], [2], "1122", [2]]'::jsonb,
  'a reveal writes the answer, flags the cell revealed, names the revealer its writer, keeps its mark'
);

-- ada clears (0,1).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.set_cell(pg_temp.coop(), 0, 1, null, false);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select jsonb_build_array(b -> 'fills', b -> 'wrong', b -> 'writers', b -> 'breaksRight')
     from (select pg_temp.coop_board() b) x),
  '[["C", "", "T", "a"], [], "1022", [1]]'::jsonb,
  'a clear empties the cell, drops its wrong flag and its writer, and keeps its mark'
);

-- ─── (3) Compete ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.set_cell(pg_temp.compete(), 0, 0, 'c', false);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') -> 'board' -> 'fills',
  '["C", "", "", ""]'::jsonb,
  'compete: a racer''s fill lands on their own grid'
);
select is(
  pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') -> 'board' -> 'writers',
  'null'::jsonb,
  'compete: a racer''s grid carries no writers'
);
select is(
  pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') -> 'board',
  pg_temp.blank('null'::jsonb),
  'compete: the rival''s grid is untouched, and in the blob (the hook withholds it)'
);

-- ─── (4) The ending: the team completes the coop grid ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.set_cell(pg_temp.coop(), 0, 1, 'a', false);
select crosswords.set_cell(pg_temp.coop(), 1, 1, 's', false);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select ended_at is not null from common.games where id = pg_temp.coop()),
  true,
  'precondition: the last fill completed the grid'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'puzzle' -> 'solution',
  pg_temp.xw_sol_2x2(),
  'the solution arrives once the game has ended'
);
select is(
  (pg_temp.shell_data(pg_temp.coop()) ->> 'ended')::boolean,
  true,
  'the builder rewrites shell_data beside the game_data'
);
select is(
  (select jsonb_agg(p -> 'solved' order by p ->> 'id')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'players') p),
  '[true, true]'::jsonb,
  'a coop solve stamps every teammate'
);

-- ─── (5) A Restart ───
select (pg_temp.game_data(pg_temp.coop()) ->> 'revision')::bigint as rev_before \gset
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.replay_board(pg_temp.coop());
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  pg_temp.coop_board(),
  pg_temp.blank('"0000"'::jsonb),
  'a Restart blanks the grid: every fill, flag, mark and writer'
);
select is(
  (pg_temp.game_data(pg_temp.coop()) ->> 'revision')::bigint,
  (:rev_before + 1)::bigint,
  'the revision keeps rising through a Restart, never reset'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'puzzle' -> 'solution',
  'null'::jsonb,
  'the solution is covered again'
);

-- ─── (6) _rebuild_data_cols_for_all ───
update common.games set game_data = null, summary_data = null, shell_data = null, status_changed_at = '2026-01-01'
 where id in (select id from g);
select is(crosswords._rebuild_data_cols_for_all() >= 2, true,
  '_rebuild_data_cols_for_all rewrites every crosswords game');
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and game_data is not null and summary_data is not null and shell_data is not null),
  2,
  'every blob is back'
);
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and status_changed_at = '2026-01-01'),
  2,
  'a rebuild leaves status_changed_at alone'
);

select * from finish();
rollback;
