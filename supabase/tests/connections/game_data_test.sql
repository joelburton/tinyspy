-- cs-unmet

-- ============================================================
-- Test: connections' page blobs — static_game_data, game_data, summary_data, and shell_data beside them
-- ============================================================
-- `connections._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move, and `_write_static_game_data` what nothing
-- after create changes (supabase/sql/connections.sql → The page blobs). This
-- file pins what the page gets:
--
--   1. A fresh coop game's static_game_data and game_data, as a whole: the
--      common parts, the puzzle as create_game froze it in the static blob,
--      no log, and every player fresh with every tile loose
--   2. Mid-game coop: the log, each player's own counts, the team's facts
--      sent once — the counts summed, the one board with the band and the tiles left
--   3. Mid-game compete: each racer's own counts and own board; the log
--      carries every racer's rows (the hook withholds, not the builder)
--   4. The endings: the winner is named, the summary_data line, and
--      shell_data is rewritten beside them
--   5. A Restart empties it all again
--   6. `_rebuild_data_cols_for_all` rewrites every connections game, its
--      static blob included, without re-dating it
--
-- The fixture puzzle (setup.psql) has four categories: the A, B, C and D
-- words, ranks 0–3. Its shuffle is random, so the tile order is read off the
-- game's row.
-- ============================================================

begin;
set search_path = connections, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(36);

create temp table puzzle on commit drop as select pg_temp.connections_puzzle() as id;
grant select on puzzle to authenticated;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Connections pages', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;
reset role;
select set_config('request.jwt.claims', '', true);
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
-- The common part of a game's summary_data, as written: connections' keys sit beside it.
create function pg_temp.common_summary(game uuid) returns jsonb language sql as
  $$ select common._make_json_summary_data(game, (select status_changed_at from common.games where id = game)) $$;
create function pg_temp.shell_data(game uuid) returns jsonb language sql as
  $$ select shell_data from common.games where id = game $$;
create function pg_temp.player(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p
      where p ->> 'id' = uid::text $$;
-- Words as the page's tiles: `{id, word}`, the id the word, in the same order.
create function pg_temp.tiles(words jsonb) returns jsonb language sql as
  $$ select coalesce(jsonb_agg(jsonb_build_object('id', w, 'word', w) order by ord), '[]'::jsonb)
       from jsonb_array_elements_text(words) with ordinality as x(w, ord) $$;
-- The puzzle as create_game froze it onto the game's row, its words as tiles.
create function pg_temp.puzzle_of(game uuid) returns jsonb language sql as
  $$ select jsonb_build_object(
       'date',  '1900-01-01',
       'cats',  (select jsonb_agg(c || jsonb_build_object('tiles', pg_temp.tiles(c -> 'tiles')) order by ord)
                   from jsonb_array_elements(board -> 'categories') with ordinality as x(c, ord)),
       'tiles', pg_temp.tiles(board -> 'tileOrder'))
       from connections.games where game_id = game $$;
-- The fixture's category of this rank, as the row stores it (its tiles words).
create function pg_temp.stored_cat(game uuid, rank int) returns jsonb language sql as
  $$ select c from jsonb_array_elements((select board -> 'categories' from connections.games where game_id = game)) c
      where (c ->> 'rank')::int = rank $$;
-- The same category as the puzzle carries it, its tiles as tiles.
create function pg_temp.cat(game uuid, rank int) returns jsonb language sql as
  $$ select pg_temp.stored_cat(game, rank)
         || jsonb_build_object('tiles', pg_temp.tiles(pg_temp.stored_cat(game, rank) -> 'tiles')) $$;
-- The game's tiles, in order, with one category's taken out.
create function pg_temp.tiles_without(game uuid, rank int) returns jsonb language sql as
  $$ select coalesce(jsonb_agg(jsonb_build_object('id', t.tile, 'word', t.tile) order by t.ord), '[]'::jsonb)
       from connections.games g,
            jsonb_array_elements_text(g.board -> 'tileOrder') with ordinality as t(tile, ord)
      where g.game_id = game
        and not (pg_temp.stored_cat(game, rank) -> 'tiles') ? t.tile $$;

-- A board nobody has matched on: every tile still loose.
create function pg_temp.fresh_board(game uuid) returns jsonb language sql as $$
  select jsonb_build_object(
    'matchedCats', '[]'::jsonb,
    'tilesLeft',   pg_temp.tiles((select board -> 'tileOrder' from connections.games where game_id = game)))
$$;

-- A coop team that has not moved: the counts, the budget and the one board.
create function pg_temp.fresh_team(game uuid) returns jsonb language sql as $$
  select jsonb_build_object(
    'nMatchedCats', 0,
    'nMistakes',    0,
    'maxMistakes',  4,
    'board',        pg_temp.fresh_board(game))
$$;

-- A player who has not moved, in a free-for-all game: the common fields, and
-- connections' on top. A racer's board has every tile still loose; a coop
-- player carries none (`board` null), the one board being the team's.
create function pg_temp.fresh_player(game uuid, uid uuid, name text) returns jsonb language sql as $$
  select jsonb_build_object(
    'id',             uid,
    'username',       name,
    'color',          (select color from common.profiles where user_id = uid),
    'ai',             false,
    'seat',           null,
    'ending',         null,
    'outcome',        null,
    'finalRanking',   null,
    'solvedAt',       null,
    'conceded',       false,
    'solved',         false,
    'stillPlaying',   true,
    'onTurn',         true,
    'waitingForTurn', false,
    'nMatchedCats',   0,
    'nMistakes',      0,
    'maxMistakes',    4,
    'board',          case when (select mode from common.games where id = game) = 'compete'
                        then pg_temp.fresh_board(game) end)
$$;

-- ─── (1) A fresh coop game, as a whole ───
select is(
  pg_temp.static_game_data(pg_temp.coop()),
  jsonb_build_object(
    'id',       pg_temp.coop(),
    'gametype', 'connections_coop',
    'brand',    'WordKnit',
    'club',     jsonb_build_object('handle', (select handle from club)),
    'mode',     'coop',
    'coop',     true,
    'compete',  false,
    'setup',    pg_temp.connections_setup((select id from puzzle)),
    'puzzle',   pg_temp.puzzle_of(pg_temp.coop())),
  'the whole static_game_data of a fresh coop game: the common part, and the frozen puzzle'
);
select is(
  pg_temp.game_data(pg_temp.coop()),
  jsonb_build_object(
    'title',    '1900-01-01: ALPHA-ANGEL',
    'turns',    null,
    'ending',   null,
    'ended',    false,
    'outcome',  null,
    'team',     pg_temp.fresh_team(pg_temp.coop()),
    'events',   '[]'::jsonb,
    'players',  jsonb_build_array(
      pg_temp.fresh_player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111', 'ada'),
      pg_temp.fresh_player(pg_temp.coop(), 'bea22222-2222-2222-2222-222222222222', 'bea'))),
  'the whole game_data of a fresh coop game: the common part, a team with nothing counted and every tile loose, no log, fresh players carrying no board'
);
select is(
  jsonb_array_length(pg_temp.static_game_data(pg_temp.coop()) -> 'puzzle' -> 'tiles'),
  16,
  'the puzzle carries all sixteen tiles in this game''s shuffle'
);
select is(
  pg_temp.summary_data(pg_temp.coop()),
  pg_temp.common_summary(pg_temp.coop())
    || '{"team": {"nMatchedCats": 0, "nMistakes": 0}, "maxMistakes": 4}'::jsonb,
  'the fresh coop game''s summary: the common part, then a team with nothing counted and the budget'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete())
    || '{"team": null, "maxMistakes": 4}'::jsonb,
  'the fresh compete game''s summary has no team, so no progress'
);

-- ─── (2) Mid-game coop: ada matches the A words, bea is one away ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.submit_guess(pg_temp.coop(), array['ALPHA','ANGEL','APPLE','ARROW'], 'correct', 0);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select connections.submit_guess(pg_temp.coop(), array['BANANA','BIRCH','BREAD','CLOUD'], 'oneAway');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_agg(e - 'id' - 'at') from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e),
  jsonb_build_array(
    jsonb_build_object(
      'userId',         'ada11111-1111-1111-1111-111111111111',
      'tiles',          '["ALPHA", "ANGEL", "APPLE", "ARROW"]'::jsonb,
      'result',         'correct',
      'matchedCatRank', 0),
    jsonb_build_object(
      'userId',         'bea22222-2222-2222-2222-222222222222',
      'tiles',          '["BANANA", "BIRCH", "BREAD", "CLOUD"]'::jsonb,
      'result',         'oneAway',
      'matchedCatRank', null)),
  'the log carries each row''s player, tiles, wire word and matched rank, in the order of play'
);
select is(
  (select jsonb_typeof(e -> 'id') || '/' || jsonb_typeof(e -> 'at')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e limit 1),
  'number/string',
  '… each with its row id and its time'
);
select is(
  (select jsonb_agg(jsonb_build_array(p -> 'nMatchedCats', p -> 'nMistakes') order by p ->> 'id')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'players') p),
  '[[1, 0], [0, 1]]'::jsonb,
  'coop: each player''s own counts — ada matched, bea missed'
);
select is(
  (pg_temp.game_data(pg_temp.coop()) -> 'team') - 'board',
  '{"nMatchedCats": 1, "nMistakes": 1, "maxMistakes": 4}'::jsonb,
  'coop: the team''s counts, summed over the rows, with the budget, in game_data.team'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'team' -> 'board' -> 'matchedCats',
  jsonb_build_array(
    pg_temp.cat(pg_temp.coop(), 0)
      || jsonb_build_object('matchedAt', (select e -> 'at' from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e limit 1))),
  'coop: the team''s one board shows its band — the category, with when it was matched'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'team' -> 'board' -> 'tilesLeft',
  pg_temp.tiles_without(pg_temp.coop(), 0),
  '… and the twelve tiles left, in the puzzle''s order'
);
select is(
  (select jsonb_agg(p -> 'board') from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'players') p),
  '[null, null]'::jsonb,
  '… and is sent once: no coop player carries a board'
);
select is(
  pg_temp.summary_data(pg_temp.coop()),
  pg_temp.common_summary(pg_temp.coop())
    || '{"team": {"nMatchedCats": 1, "nMistakes": 1}, "maxMistakes": 4}'::jsonb,
  'coop: the summary has the team''s counts'
);

-- ─── (3) Mid-game compete: ada matches the A words, bea is one away ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.submit_guess(pg_temp.compete(), array['ALPHA','ANGEL','APPLE','ARROW'], 'correct', 0);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select connections.submit_guess(pg_temp.compete(), array['BANANA','BIRCH','BREAD','CLOUD'], 'oneAway');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_agg(jsonb_build_array(p -> 'nMatchedCats', p -> 'nMistakes') order by p ->> 'id')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.compete()) -> 'players') p),
  '[[1, 0], [0, 1]]'::jsonb,
  'compete: each racer''s counts are their own'
);
select is(
  (select jsonb_agg(c -> 'rank') from jsonb_array_elements(
     pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') -> 'board' -> 'matchedCats') c),
  '[0]'::jsonb,
  'compete: a racer''s board shows their own band'
);
select is(
  pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') -> 'board',
  jsonb_build_object(
    'matchedCats', '[]'::jsonb,
    'tilesLeft',   pg_temp.tiles((select board -> 'tileOrder' from connections.games where game_id = pg_temp.compete()))),
  '… and the rival''s board still has every tile loose'
);
select is(
  (select jsonb_agg(e ->> 'userId') from jsonb_array_elements(pg_temp.game_data(pg_temp.compete()) -> 'events') e),
  '["ada11111-1111-1111-1111-111111111111", "bea22222-2222-2222-2222-222222222222"]'::jsonb,
  'compete: the log carries every racer''s rows — what a racer may see is the hook''s rule'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'team',
  'null'::jsonb,
  'compete: no team in game_data — every count is a player''s own'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete())
    || '{"team": null, "maxMistakes": 4}'::jsonb,
  'compete: the summary still carries no progress, and no ending yet'
);

-- ─── (4) The endings ───
-- Coop is stopped; in compete ada matches the other three and wins the race.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.stop_game(pg_temp.coop());
select connections.submit_guess(pg_temp.compete(), array['BANANA','BIRCH','BREAD','BRICK'], 'correct', 1);
select connections.submit_guess(pg_temp.compete(), array['CASTLE','CIRCLE','CLOUD','CROWN'], 'correct', 2);
select connections.submit_guess(pg_temp.compete(), array['DAGGER','DELTA','DIAMOND','DRAGON'], 'correct', 3);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (pg_temp.game_data(pg_temp.coop()) ->> 'ended')::boolean
    and pg_temp.game_data(pg_temp.coop()) -> 'ending' ->> 'reason' = 'stopped'
    and pg_temp.game_data(pg_temp.coop()) ->> 'outcome' = 'neutral',
  true,
  'the stopped coop game: ended, its ending and outcome on the game_data'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'ending',
  jsonb_build_object(
    'reason', 'reached_goal',
    'detail', 'solved',
    'by',     'ada11111-1111-1111-1111-111111111111',
    'winner', 'ada11111-1111-1111-1111-111111111111'),
  'the won race: the fourth match ended it, and the finder is the winner'
);
select is(
  (pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') ->> 'solved')::boolean
    and pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') ->> 'outcome' = 'won'
    and (pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') ->> 'nMatchedCats')::int = 4,
  true,
  'the winner solved and won, with all four matched'
);
select is(
  pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') -> 'board' -> 'tilesLeft',
  '[]'::jsonb,
  '… and has no tile left loose'
);
select is(
  pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') ->> 'outcome',
  'lost',
  'the beaten racer lost'
);
select is(
  pg_temp.summary_data(pg_temp.compete()) -> 'ending' ->> 'winner',
  'ada11111-1111-1111-1111-111111111111',
  'compete: the summary''s ending names the winner'
);
select is(
  pg_temp.summary_data(pg_temp.coop()) -> 'ending' -> 'winner',
  'null'::jsonb,
  'coop: the stopped game''s summary names no winner'
);
select is(
  (pg_temp.shell_data(pg_temp.coop()) ->> 'ended')::boolean,
  true,
  'the builder rewrites shell_data beside the game_data: the stopped game''s shell_data says ended'
);
select is(
  (select jsonb_agg(p -> 'stillPlaying') from jsonb_array_elements(pg_temp.shell_data(pg_temp.compete()) -> 'players') p),
  '[false, false]'::jsonb,
  '… and the won race''s shell_data has nobody still playing'
);

-- ─── (5) A Restart empties it all again ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.replay_board(pg_temp.compete());
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.game_data(pg_temp.compete()) -> 'players',
  jsonb_build_array(
    pg_temp.fresh_player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111', 'ada'),
    pg_temp.fresh_player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222', 'bea')),
  'after a Restart every player is fresh again, every tile loose'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'events',
  '[]'::jsonb,
  '… the log is empty'
);
select is(
  pg_temp.static_game_data(pg_temp.compete()) -> 'puzzle',
  pg_temp.puzzle_of(pg_temp.compete()),
  '… and the puzzle is the same sixteen tiles in the same shuffle'
);
select is(
  (pg_temp.shell_data(pg_temp.compete()) ->> 'restartCount')::int,
  1,
  '… with the restart counted on shell_data'
);

-- ─── (6) _rebuild_data_cols_for_all ───
update common.games
   set static_game_data = null, game_data = null, summary_data = null, shell_data = null,
       status_changed_at = '2026-01-01'
 where id in (select id from g);
select is(connections._rebuild_data_cols_for_all() >= 2, true, '_rebuild_data_cols_for_all rewrites every connections game');
select is(
  (select count(*)::int from common.games
    where id in (select id from g)
      and static_game_data is not null and game_data is not null
      and summary_data is not null and shell_data is not null),
  2,
  '… every blob is back'
);
select is(
  pg_temp.static_game_data(pg_temp.coop()) -> 'puzzle',
  pg_temp.puzzle_of(pg_temp.coop()),
  '… the static blob from the game''s own row'
);
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and status_changed_at = '2026-01-01'),
  2,
  '… and no game is re-dated'
);

select * from finish();
rollback;
