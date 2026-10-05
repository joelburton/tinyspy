-- cs-unmet

-- ============================================================
-- Test: waffle's page blobs — game_data, summary_data, and shell_data beside them
-- ============================================================
-- `waffle._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move (supabase/sql/waffle.sql → The page blobs).
-- This file pins what the page gets:
--
--   1. A fresh game: the deal as tiles, par, no solution; a team with nothing
--      used in coop and none in compete; each player fresh with the dealt
--      board, colored; both fresh summaries
--   2. Mid-game coop: the log's swap as two tiles with the letters before it,
--      each player's own count, the team's sum, one board on every seat
--   3. Mid-game compete: each racer's own count and own board; the log carries
--      every racer's rows (the hook withholds, not the builder)
--   4. The endings: the solution arrives, the solve stamps the team, the
--      winner's count on the summary, shell_data rewritten
--   5. A Restart empties it all again
--   6. `_rebuild_data_cols_for_all` rewrites every waffle game without
--      re-dating it
--
-- The board is setup.psql's: one swap (cells 0 and 1) from solved, so the
-- dealt board's first two tiles are yellow and the rest green; par 1, budget 6.
-- ============================================================

begin;
set search_path = waffle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(27);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Waffle pages', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (waffle.create_game(
  (select handle from club),
  pg_temp.waffle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode,
  pg_temp.waffle_board()
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;

reset role;
grant select on g to authenticated;

-- Shorthands: each game's id and blobs, one player inside the game_data, and
-- one tile of a board.
create function pg_temp.coop() returns uuid language sql as
  $$ select id from g where mode = 'coop' $$;
create function pg_temp.compete() returns uuid language sql as
  $$ select id from g where mode = 'compete' $$;
create function pg_temp.game_data(game uuid) returns jsonb language sql as
  $$ select game_data from common.games where id = game $$;
create function pg_temp.summary_data(game uuid) returns jsonb language sql as
  $$ select summary_data from common.games where id = game $$;
-- The common part of a game's summary_data, as written: waffle's keys sit beside it.
create function pg_temp.common_summary(game uuid) returns jsonb language sql as
  $$ select common._make_json_summary_data(game, (select status_changed_at from common.games where id = game)) $$;
create function pg_temp.shell_data(game uuid) returns jsonb language sql as
  $$ select shell_data from common.games where id = game $$;
create function pg_temp.player(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p
      where p ->> 'id' = uid::text $$;
create function pg_temp.tile(tiles jsonb, cell text) returns jsonb language sql as
  $$ select t from jsonb_array_elements(tiles) t where t ->> 'id' = cell $$;
-- Every player's own count, in user-id order.
create function pg_temp.counts(game uuid) returns jsonb language sql as
  $$ select jsonb_agg(p -> 'nSwapsUsed' order by p ->> 'id')
       from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p $$;

-- ─── (1) A fresh game ───
select is(
  (select jsonb_build_object(
     'nDealt', jsonb_array_length(gd -> 'puzzle' -> 'dealtTiles'),
     'first',  gd -> 'puzzle' -> 'dealtTiles' -> 0,
     'second', gd -> 'puzzle' -> 'dealtTiles' -> 1,
     'par',    gd -> 'puzzle' -> 'parSwaps',
     'solution', gd -> 'puzzle' -> 'solution')
     from (select pg_temp.game_data(pg_temp.coop()) gd) x),
  '{"nDealt": 21, "first": {"id": "0", "letter": "b"}, "second": {"id": "1", "letter": "a"},
    "par": 1, "solution": null}'::jsonb,
  'the puzzle: the deal as 21 tiles by position, the holes left out; par; no solution mid-game'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'team',
  '{"nSwapsUsed": 0}'::jsonb,
  'coop: a team with nothing used'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'team',
  'null'::jsonb,
  'compete: no team'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'events',
  '[]'::jsonb,
  'no log yet'
);
select is(
  (select p - 'id' - 'username' - 'color' - 'ai' - 'seat' - 'ending' - 'outcome' - 'finalRanking'
            - 'solvedAt' - 'conceded' - 'solved' - 'stillPlaying' - 'onTurn' - 'waitingForTurn' - 'board'
     from (select pg_temp.player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111') p) x),
  '{"maxSwaps": 6, "nSwapsUsed": 0}'::jsonb,
  'a fresh player: the budget (par 1 + 5 extra) and nothing used'
);
select is(
  (select jsonb_build_array(
     jsonb_array_length(b -> 'tiles'),
     pg_temp.tile(b -> 'tiles', '0'),
     pg_temp.tile(b -> 'tiles', '1'),
     pg_temp.tile(b -> 'tiles', '2'))
     from (select pg_temp.player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111') -> 'board' b) x),
  '[21, {"id": "0", "letter": "b", "color": "y"}, {"id": "1", "letter": "a", "color": "y"},
    {"id": "2", "letter": "c", "color": "g"}]'::jsonb,
  'a player''s board is the dealt board as 21 colored tiles: the swapped pair yellow, the rest green'
);
select is(
  pg_temp.summary_data(pg_temp.coop()),
  pg_temp.common_summary(pg_temp.coop())
    || '{"team": {"nSwapsUsed": 0}, "maxSwaps": 6, "band": 2, "nWinnerSwaps": null}'::jsonb,
  'the fresh coop game''s summary: the common part, a team with nothing used, the budget, the band'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete())
    || '{"team": null, "maxSwaps": 6, "band": 2, "nWinnerSwaps": null}'::jsonb,
  'the fresh compete game''s summary has no team, so no progress'
);

-- ─── (2) Mid-game coop: ada swaps cells 2 and 3 ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select waffle.submit_swap(pg_temp.coop(), 2, 3);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select e - 'id' - 'at' - 'colors' from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e),
  '{"userId": "ada11111-1111-1111-1111-111111111111",
    "swaps": [{"id": "2", "letter": "c"}, {"id": "3", "letter": "d"}]}'::jsonb,
  'the log''s swap is two tiles, each with the letter it held before'
);
select is(
  (select length(e ->> 'colors') || '/' || jsonb_typeof(e -> 'id') || '/' || jsonb_typeof(e -> 'at')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e),
  '25/number/string',
  '… with the board''s 25 colors after it, its row id and its time'
);
select is(
  pg_temp.counts(pg_temp.coop()),
  '[1, 0]'::jsonb,
  'coop: each player''s own count — ada swapped, bea did not'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'team',
  '{"nSwapsUsed": 1}'::jsonb,
  'coop: the team''s count, summed over the rows'
);
select is(
  pg_temp.tile(pg_temp.player(pg_temp.coop(), 'bea22222-2222-2222-2222-222222222222') -> 'board' -> 'tiles', '2'),
  '{"id": "2", "letter": "d", "color": "y"}'::jsonb,
  'coop: every seat''s board shows the shared swap'
);
select is(
  pg_temp.player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111') -> 'board',
  pg_temp.player(pg_temp.coop(), 'bea22222-2222-2222-2222-222222222222') -> 'board',
  '… the same board on both seats'
);

-- ─── (3) Mid-game compete: ada swaps cells 2 and 3 ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select waffle.submit_swap(pg_temp.compete(), 2, 3);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.counts(pg_temp.compete()),
  '[1, 0]'::jsonb,
  'compete: each racer''s count is their own'
);
select is(
  jsonb_build_array(
    pg_temp.tile(pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') -> 'board' -> 'tiles', '2') -> 'letter',
    pg_temp.tile(pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') -> 'board' -> 'tiles', '2') -> 'letter'),
  '["d", "c"]'::jsonb,
  'compete: a racer''s board moves alone — ada''s swapped, bea''s still dealt'
);
select is(
  (select jsonb_agg(e ->> 'userId') from jsonb_array_elements(pg_temp.game_data(pg_temp.compete()) -> 'events') e),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  'compete: the log carries every racer''s rows — what a racer may see is the hook''s rule'
);

-- ─── (4) The endings ───
-- Coop: ada swaps 2 and 3 back, and bea's swap of 0 and 1 solves it.
-- Compete: ada swaps 2 and 3 back and solves; bea concedes, ending the race.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select waffle.submit_swap(pg_temp.coop(), 2, 3);
select waffle.submit_swap(pg_temp.compete(), 2, 3);
select waffle.submit_swap(pg_temp.compete(), 0, 1);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select waffle.submit_swap(pg_temp.coop(), 0, 1);
select waffle.concede(pg_temp.compete());
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_build_array(jsonb_array_length(s), s -> 0, s -> 1)
     from (select pg_temp.game_data(pg_temp.coop()) -> 'puzzle' -> 'solution' s) x),
  '[21, {"id": "0", "letter": "a"}, {"id": "1", "letter": "b"}]'::jsonb,
  'the solution arrives once the game has ended, as tiles'
);
select is(
  (select jsonb_agg(jsonb_build_array(p -> 'solved', p -> 'outcome') order by p ->> 'id')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'players') p),
  '[[true, "won"], [true, "won"]]'::jsonb,
  'coop solved: the solve stamps every teammate, and the team won'
);
select is(
  pg_temp.counts(pg_temp.coop()) || jsonb_build_array(pg_temp.game_data(pg_temp.coop()) -> 'team'),
  '[2, 1, {"nSwapsUsed": 3}]'::jsonb,
  'coop: each player''s own count, and the team''s sum'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'ending',
  jsonb_build_object(
    'reason', 'conceded',
    'detail', 'conceded',
    'by',     'bea22222-2222-2222-2222-222222222222',
    'winner', 'ada11111-1111-1111-1111-111111111111'),
  'compete: the last racer''s concession ended it, and the solver won'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete())
    || '{"team": null, "maxSwaps": 6, "band": 2, "nWinnerSwaps": 3}'::jsonb,
  'compete: the summary names the winner''s count'
);
select is(
  (pg_temp.shell_data(pg_temp.coop()) ->> 'ended')::boolean,
  true,
  'the builder rewrites shell_data beside the game_data'
);

-- ─── (5) A Restart empties it all again ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select waffle.replay_board(pg_temp.coop());
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  jsonb_build_object(
    'counts',   pg_temp.counts(pg_temp.coop()),
    'team',     pg_temp.game_data(pg_temp.coop()) -> 'team',
    'events',   pg_temp.game_data(pg_temp.coop()) -> 'events',
    'solution', pg_temp.game_data(pg_temp.coop()) -> 'puzzle' -> 'solution',
    'tile0',    pg_temp.tile(pg_temp.player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111') -> 'board' -> 'tiles', '0')),
  '{"counts": [0, 0], "team": {"nSwapsUsed": 0}, "events": [], "solution": null,
    "tile0": {"id": "0", "letter": "b", "color": "y"}}'::jsonb,
  'after a Restart: nothing used, no log, no solution, the dealt board again'
);

-- ─── (6) _rebuild_data_cols_for_all ───
update common.games set game_data = null, summary_data = null, shell_data = null, status_changed_at = '2026-01-01'
 where id in (select id from g);
select is(waffle._rebuild_data_cols_for_all() >= 2, true, '_rebuild_data_cols_for_all rewrites every waffle game');
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and game_data is not null and summary_data is not null and shell_data is not null),
  2,
  '… every blob is back'
);
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and status_changed_at = '2026-01-01'),
  2,
  '… and no game is re-dated'
);

select * from finish();
rollback;
