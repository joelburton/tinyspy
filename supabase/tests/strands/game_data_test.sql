-- cs-unmet

-- ============================================================
-- Test: strands' page blobs — static_game_data, game_data, summary_data, and shell_data beside them
-- ============================================================
-- `strands._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move, and `_write_static_game_data` what nothing
-- after create changes (supabase/sql/strands.sql → The page blobs). This file
-- pins what the page gets:
--
--   1. A fresh game: the board as 48 tiles row by row and the title in
--      static_game_data, no words in game_data's puzzle; coop's team at
--      nothing with an empty board and no team in compete; each player fresh,
--      a racer with an empty board, a coop player with none; both fresh
--      summaries
--   2. Mid-game coop: a find, three hint words, a spent hint and a miss in the
--      log, each path as tile ids in trace order; each player's own counts;
--      the team's facts sent once — the sum, the one hint bar, the one board
--      and its ring
--   3. Mid-game compete: each racer's own counts, bar and board; the log
--      carries every racer's rows (the hook withholds, not the builder)
--   4. The endings: the words arrive, spangram first; a coop solve stamps
--      every teammate; a race's winner and the hints she won on;
--      shell_data rewritten
--   5. A Restart empties it all again
--   6. `_rebuild_data_cols_for_all` rewrites every strands game, its static
--      blob included, without re-dating it
--
-- The board is setup.psql's: one puzzle word per row, row 4 the spangram, and
-- each of rows 0–3 starting with a four-letter hint word.
-- ============================================================

begin;
set search_path = strands, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(25);

select pg_temp.strands_hint_words();
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;
grant select on fix to authenticated;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('PaulPath pages', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;

reset role;
grant select on g to authenticated;

-- Shorthands: each game's id and blobs, and one player inside the game_data.
create function pg_temp.coop() returns uuid language sql as
  $$ select id from g where mode = 'coop' $$;
create function pg_temp.compete() returns uuid language sql as
  $$ select id from g where mode = 'compete' $$;
create function pg_temp.game_data(game uuid) returns jsonb language sql as
  $$ select game_data from common.games where id = game $$;
create function pg_temp.static_game_data(game uuid) returns jsonb language sql as
  $$ select static_game_data from common.games where id = game $$;
create function pg_temp.summary_data(game uuid) returns jsonb language sql as
  $$ select summary_data from common.games where id = game $$;
-- The common part of a game's summary_data, as written: strands' keys sit beside it.
create function pg_temp.common_summary(game uuid) returns jsonb language sql as
  $$ select common._make_json_summary_data(game, (select status_changed_at from common.games where id = game)) $$;
create function pg_temp.shell_data(game uuid) returns jsonb language sql as
  $$ select shell_data from common.games where id = game $$;
create function pg_temp.player(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p
      where p ->> 'id' = uid::text $$;
-- A player's strands keys alone, or the team's: the common player taken off,
-- and the board as its count of words (null where there is no board) and the
-- size of its ring (null when none shows).
create function pg_temp.own_keys(player jsonb) returns jsonb language sql as
  $$ select (player - 'id' - 'username' - 'color' - 'ai' - 'seat' - 'ending' - 'outcome'
                    - 'finalRanking' - 'solvedAt' - 'conceded' - 'solved' - 'stillPlaying'
                    - 'onTurn' - 'waitingForTurn' - 'board')
            || jsonb_build_object(
                 'nBoardPuzzleWords', jsonb_array_length(player -> 'board' -> 'foundPuzzleWords'),
                 'nHintTiles',  jsonb_array_length(nullif(player -> 'board' -> 'hintTileIds', 'null'::jsonb))) $$;

-- ─── (1) A fresh game ───
select is(
  (select jsonb_build_object(
     'nTiles', jsonb_array_length(sgd -> 'puzzle' -> 'tiles'),
     'first',  sgd -> 'puzzle' -> 'tiles' -> 0,
     'last',   sgd -> 'puzzle' -> 'tiles' -> 47,
     'title',  sgd -> 'puzzle' -> 'title',
     'keys',   (select jsonb_agg(k order by k) from jsonb_object_keys(sgd -> 'puzzle') k))
     from (select pg_temp.static_game_data(pg_temp.coop()) sgd) x),
  '{"nTiles": 48, "first": {"id": "0,0", "letter": "z", "row": 0, "col": 0},
    "last": {"id": "7,5", "letter": "r", "row": 7, "col": 5},
    "title": "Rows of nonsense", "keys": ["tiles", "title"]}'::jsonb,
  'the static puzzle: the board as 48 tiles row by row, the title'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'puzzle',
  '{"puzzleWords": null}'::jsonb,
  'game_data''s puzzle: the puzzle words alone, withheld mid-game'
);
select is(
  pg_temp.own_keys(pg_temp.game_data(pg_temp.coop()) -> 'team'),
  '{"nFoundPuzzleWords": 0, "nHintsUsed": 0, "hintPoints": 0, "nBoardPuzzleWords": 0, "nHintTiles": null}'::jsonb,
  'coop: a team with nothing found or cashed, an empty bar and an empty board'
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
  jsonb_build_array(
    pg_temp.own_keys(pg_temp.player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111')),
    pg_temp.own_keys(pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111'))),
  '[{"nFoundPuzzleWords": 0, "nHintsUsed": 0, "hintPoints": null, "nBoardPuzzleWords": null, "nHintTiles": null},
    {"nFoundPuzzleWords": 0, "nHintsUsed": 0, "hintPoints": 0, "nBoardPuzzleWords": 0, "nHintTiles": null}]'::jsonb,
  'a fresh player: nothing found; a bar and a board of their own only in compete'
);
select is(
  pg_temp.summary_data(pg_temp.coop()),
  pg_temp.common_summary(pg_temp.coop())
    || '{"team": {"nFoundPuzzleWords": 0, "nHintsUsed": 0, "hintPoints": 0}, "nWinnerHints": null, "nHintsUsedById": null}'::jsonb,
  'coop: a fresh summary'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete())
    || '{"team": null, "nWinnerHints": null,
         "nHintsUsedById": {"ada11111-1111-1111-1111-111111111111": 0, "bea22222-2222-2222-2222-222222222222": 0}}'::jsonb,
  'compete: a fresh summary, every racer''s hints at 0'
);

-- ─── (2) Mid-game coop: ada finds row 0; bea fills the bar with three hint
-- words and spends it; ada traces a miss ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select strands.submit_path(pg_temp.coop(), pg_temp.strands_row_path(0));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.submit_path(pg_temp.coop(), pg_temp.strands_prefix_path(r, 4))
  from generate_series(1, 3) r;
select strands.spend_hint(pg_temp.coop());
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select strands.submit_path(pg_temp.coop(), pg_temp.strands_prefix_path(5, 4));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_agg(e - 'id' - 'at' - 'userId' - 'tileIds' order by (e ->> 'id')::bigint)
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e),
  '[{"kind": "guess", "word": "zzqabc", "result": "theme", "tookTurn": true},
    {"kind": "guess", "word": "zzqb", "result": "hint_word", "tookTurn": true},
    {"kind": "guess", "word": "zzqc", "result": "hint_word", "tookTurn": true},
    {"kind": "guess", "word": "zzqd", "result": "hint_word", "tookTurn": true},
    {"kind": "hint", "word": null, "result": null, "tookTurn": false},
    {"kind": "guess", "word": "zzqf", "result": "invalid", "tookTurn": false}]'::jsonb,
  'coop: the log — a find, three hint words, the spent hint and a miss'
);
select is(
  (select jsonb_agg(e -> 'tileIds' order by (e ->> 'id')::bigint)
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e
    where e ->> 'kind' = 'guess' and e ->> 'result' in ('theme', 'invalid')),
  '[["0,0", "0,1", "0,2", "0,3", "0,4", "0,5"], ["5,0", "5,1", "5,2", "5,3"]]'::jsonb,
  'a guess''s path is tile ids, in trace order'
);
select is(
  pg_temp.own_keys(pg_temp.game_data(pg_temp.coop()) -> 'team'),
  '{"nFoundPuzzleWords": 1, "nHintsUsed": 1, "hintPoints": 0, "nBoardPuzzleWords": 1, "nHintTiles": 6}'::jsonb,
  'coop: the team''s words and hints, the one bar, emptied by the spend, and the one board with its ring'
);
select is(
  jsonb_build_array(
    pg_temp.own_keys(pg_temp.player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111')),
    pg_temp.own_keys(pg_temp.player(pg_temp.coop(), 'bea22222-2222-2222-2222-222222222222'))),
  '[{"nFoundPuzzleWords": 1, "nHintsUsed": 0, "hintPoints": null, "nBoardPuzzleWords": null, "nHintTiles": null},
    {"nFoundPuzzleWords": 0, "nHintsUsed": 1, "hintPoints": null, "nBoardPuzzleWords": null, "nHintTiles": null}]'::jsonb,
  'coop: each player''s own counts; the bar and the board are the team''s alone'
);
select is(
  (select jsonb_agg(p -> 'board')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'players') p),
  '[null, null]'::jsonb,
  'coop: the one board is sent once — no coop player carries it'
);

-- ─── (3) Mid-game compete: ada finds row 0 and a hint word ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select strands.submit_path(pg_temp.compete(), pg_temp.strands_row_path(0));
select strands.submit_path(pg_temp.compete(), pg_temp.strands_prefix_path(1, 4));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  jsonb_build_array(
    pg_temp.own_keys(pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111')),
    pg_temp.own_keys(pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222'))),
  '[{"nFoundPuzzleWords": 1, "nHintsUsed": 0, "hintPoints": 1, "nBoardPuzzleWords": 1, "nHintTiles": null},
    {"nFoundPuzzleWords": 0, "nHintsUsed": 0, "hintPoints": 0, "nBoardPuzzleWords": 0, "nHintTiles": null}]'::jsonb,
  'compete: each racer''s counts, bar and board are their own'
);
select is(
  (select jsonb_agg(distinct e ->> 'userId') from jsonb_array_elements(pg_temp.game_data(pg_temp.compete()) -> 'events') e),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  'compete: the log carries every racer''s rows — what a racer may see is the hook''s rule'
);

-- ─── (4) The endings ───
-- Coop: bea finds the other seven. Compete: ada finds the other seven, then
-- bea concedes and ada wins.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.submit_path(pg_temp.coop(), pg_temp.strands_row_path(r)) from generate_series(1, 7) r;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select strands.submit_path(pg_temp.compete(), pg_temp.strands_row_path(r)) from generate_series(1, 7) r;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.concede(pg_temp.compete());
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_build_object(
     'n',      jsonb_array_length(w),
     'first',  w -> 0,
     'second', (w -> 1) - 'tileIds')
     from (select pg_temp.game_data(pg_temp.coop()) -> 'puzzle' -> 'puzzleWords' w) x),
  '{"n": 8,
    "first": {"word": "zzqejk", "spangram": true,
              "tileIds": ["4,0", "4,1", "4,2", "4,3", "4,4", "4,5"]},
    "second": {"word": "zzqabc", "spangram": false}}'::jsonb,
  'the words arrive once the game has ended, spangram first'
);
select is(
  (select jsonb_agg(jsonb_build_array(p -> 'solved', p -> 'outcome') order by p ->> 'id')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'players') p)
    || jsonb_build_array(pg_temp.game_data(pg_temp.coop()) -> 'team' -> 'nFoundPuzzleWords'),
  '[[true, "won"], [true, "won"], 8]'::jsonb,
  'coop solved: the solve stamps every teammate, and the team found all eight'
);
select is(
  (select jsonb_agg(w -> 'spangram' order by o)
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'team'
                                 -> 'board' -> 'foundPuzzleWords') with ordinality x(w, o)),
  '[false, false, false, false, true, false, false, false]'::jsonb,
  'a board''s found words are in the order found, the spangram flagged'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'ending',
  jsonb_build_object(
    'reason', 'conceded',
    'detail', 'conceded',
    'by',     'bea22222-2222-2222-2222-222222222222'),
  'compete: the last concession ended it'
);
select is(
  pg_temp.winner_ids(pg_temp.game_data(pg_temp.compete())),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  '… and the solver won, ranked first'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete())
    || jsonb_build_object('team', null, 'nWinnerHints', 0,
         'nHintsUsedById', (select jsonb_object_agg(user_id::text, n_hints_used)
                              from strands.players where game_id = pg_temp.compete())),
  'compete won: the summary names the hints the race was won on, and each racer''s'
);
select is(
  (pg_temp.shell_data(pg_temp.coop()) ->> 'ended')::boolean,
  true,
  'the builder rewrites shell_data beside the game_data'
);

-- ─── (5) A Restart empties it all again ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select strands.replay_board(pg_temp.coop());
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  jsonb_build_object(
    'team',   pg_temp.own_keys(pg_temp.game_data(pg_temp.coop()) -> 'team'),
    'events', pg_temp.game_data(pg_temp.coop()) -> 'events',
    'puzzleWords', pg_temp.game_data(pg_temp.coop()) -> 'puzzle' -> 'puzzleWords',
    'ada',    pg_temp.own_keys(pg_temp.player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111'))),
  '{"team": {"nFoundPuzzleWords": 0, "nHintsUsed": 0, "hintPoints": 0, "nBoardPuzzleWords": 0, "nHintTiles": null},
    "events": [], "puzzleWords": null,
    "ada": {"nFoundPuzzleWords": 0, "nHintsUsed": 0, "hintPoints": null, "nBoardPuzzleWords": null, "nHintTiles": null}}'::jsonb,
  'after a Restart: an empty board, no log, nothing found or cashed, no puzzle words'
);

-- ─── (6) _rebuild_data_cols_for_all ───
update common.games
   set static_game_data = null, game_data = null, summary_data = null, shell_data = null,
       status_changed_at = '2026-01-01'
 where id in (select id from g);
select is(strands._rebuild_data_cols_for_all() >= 2, true, '_rebuild_data_cols_for_all rewrites every strands game');
select is(
  (select count(*)::int from common.games
    where id in (select id from g)
      and static_game_data is not null and game_data is not null
      and summary_data is not null and shell_data is not null
      and status_changed_at = '2026-01-01'),
  2,
  '… every blob is back, and no game is re-dated'
);

select * from finish();
rollback;
