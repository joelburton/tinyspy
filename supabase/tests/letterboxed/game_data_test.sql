-- cs-unmet

-- ============================================================
-- Test: letterboxed's page blobs — static_game_data, game_data, summary_data, and shell_data beside them
-- ============================================================
-- `letterboxed._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move, and `_write_static_game_data` what nothing
-- after create changes (supabase/sql/letterboxed.sql → The page blobs). This
-- file pins what the page gets:
--
--   1. A fresh game: the box as tiles by letter, the word list and the few a
--      hint may not offer, par, in static_game_data; no solution in
--      game_data's puzzle; coop's team at nothing with an empty chain and no
--      team in compete; each player fresh, a racer with their chain and its
--      two counts and a coop player with neither; both fresh summaries
--   2. Mid-game coop: a word, a hint and a spoiler in the log; the team's
--      facts, sent once — the one chain, the hints and spoilers summed; hints
--      and spoilers counted per player
--   3. Mid-game compete: each racer's own counts and own chain; the log
--      carries every racer's rows (the hook withholds, not the builder)
--   4. The endings: an undo in the log, the solution arrives, the solve
--      stamps the team, the winner's numbers on the summary — a solve's and
--      a timeout's — and shell_data rewritten
--   5. A Restart empties it all again
--   6. `_rebuild_data_cols_for_all` rewrites every letterboxed game, its static
--      blob included, without re-dating it
--
-- The board is setup.psql's: 'abcdefghijkl', a cap of five words. Its words
-- are synthetic, so only `qat`, among the filler, is in the dictionary.
-- ============================================================

begin;
set search_path = letterboxed, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(28);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('SnakeBox pages', array['ada', 'bea']) as handle;

-- Three games: one per mode, and a second race that the timer ends.
create temp table g on commit drop as
select name, (letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode,
  pg_temp.lb_board()
)->'data'->>'id')::uuid as id
  from (values ('coop', 'coop'), ('compete', 'compete'), ('timed', 'compete')) as v(name, mode);

reset role;
grant select on g to authenticated;

-- Shorthands: each game's id and blobs, one player inside the game_data, and
-- every player's two chain counts.
create function pg_temp.game(game_name text) returns uuid language sql as
  $$ select id from g where name = game_name $$;
create function pg_temp.game_data(game uuid) returns jsonb language sql as
  $$ select game_data from common.games where id = game $$;
create function pg_temp.static_game_data(game uuid) returns jsonb language sql as
  $$ select static_game_data from common.games where id = game $$;
create function pg_temp.summary_data(game uuid) returns jsonb language sql as
  $$ select summary_data from common.games where id = game $$;
-- The common part of a game's summary_data, as written: letterboxed's keys sit beside it.
create function pg_temp.common_summary(game uuid) returns jsonb language sql as
  $$ select common._make_json_summary_data(game, (select status_changed_at from common.games where id = game)) $$;
create function pg_temp.shell_data(game uuid) returns jsonb language sql as
  $$ select shell_data from common.games where id = game $$;
create function pg_temp.player(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p
      where p ->> 'id' = uid::text $$;
-- A player's letterboxed keys alone: the common player taken off.
create function pg_temp.own_keys(player jsonb) returns jsonb language sql as
  $$ select player - 'id' - 'username' - 'color' - 'ai' - 'seat' - 'ending' - 'outcome'
                   - 'finalRanking' - 'solvedAt' - 'conceded' - 'solved' - 'stillPlaying'
                   - 'onTurn' - 'waitingForTurn' $$;
-- Every player's [nWordsUsed, nCoveredLetters], in user-id order.
create function pg_temp.counts(game uuid) returns jsonb language sql as
  $$ select jsonb_agg(jsonb_build_array(p -> 'nWordsUsed', p -> 'nCoveredLetters') order by p ->> 'id')
       from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p $$;

-- ─── (1) A fresh game ───
select is(
  (select jsonb_build_object(
     'nTiles', jsonb_array_length(sgd -> 'puzzle' -> 'tiles'),
     'first',  sgd -> 'puzzle' -> 'tiles' -> 0,
     'fourth', sgd -> 'puzzle' -> 'tiles' -> 3,
     'last',   sgd -> 'puzzle' -> 'tiles' -> 11,
     'par',    sgd -> 'puzzle' -> 'nParWords')
     from (select pg_temp.static_game_data(pg_temp.game('coop')) sgd) x),
  '{"nTiles": 12, "first": {"id": "a", "letter": "a", "side": 0},
    "fourth": {"id": "d", "letter": "d", "side": 1}, "last": {"id": "l", "letter": "l", "side": 3},
    "par": 2}'::jsonb,
  'the static puzzle: the box as twelve tiles in side order, each its letter; par'
);
select is(
  pg_temp.game_data(pg_temp.game('coop')) -> 'puzzle',
  '{"solution": null}'::jsonb,
  'game_data''s puzzle: the solution alone, withheld mid-game'
);
select is(
  (select jsonb_build_object(
     'nWords',        jsonb_array_length(p -> 'words'),
     'nUncleanWords', jsonb_array_length(p -> 'uncleanWords'),
     'adgUnclean',    p -> 'uncleanWords' ? 'adg',
     'qatUnclean',    p -> 'uncleanWords' ? 'qat')
     from (select pg_temp.static_game_data(pg_temp.game('coop')) -> 'puzzle' p) x),
  '{"nWords": 207, "nUncleanWords": 206, "adgUnclean": true, "qatUnclean": false}'::jsonb,
  'the words: every word the board accepts, and beside them the ones a hint may not offer — all but qat, the one the dictionary holds clean'
);
select is(
  pg_temp.game_data(pg_temp.game('coop')) -> 'team',
  '{"nWordsUsed": 0, "nCoveredLetters": 0, "board": {"words": []},
    "nHintsUsed": 0, "nSpoilersUsed": 0, "maxWords": 5}'::jsonb,
  'coop: a team with an empty chain, nothing taken, the cap'
);
select is(
  pg_temp.game_data(pg_temp.game('compete')) -> 'team',
  'null'::jsonb,
  'compete: no team'
);
select is(
  pg_temp.game_data(pg_temp.game('coop')) -> 'events',
  '[]'::jsonb,
  'no log yet'
);
select is(
  pg_temp.own_keys(pg_temp.player(pg_temp.game('coop'), 'ada11111-1111-1111-1111-111111111111')),
  '{"maxWords": 5, "nHintsUsed": 0, "nSpoilersUsed": 0,
    "nWordsUsed": null, "nCoveredLetters": null, "board": null}'::jsonb,
  'coop: a player with the cap, nothing taken — and no chain, which is the team''s'
);
select is(
  pg_temp.own_keys(pg_temp.player(pg_temp.game('compete'), 'ada11111-1111-1111-1111-111111111111')),
  '{"maxWords": 5, "nHintsUsed": 0, "nSpoilersUsed": 0, "board": {"words": []},
    "nWordsUsed": 0, "nCoveredLetters": 0}'::jsonb,
  'compete: a racer carries their own chain''s two counts'
);
select is(
  pg_temp.summary_data(pg_temp.game('coop')),
  pg_temp.common_summary(pg_temp.game('coop'))
    || '{"team": {"nWordsUsed": 0, "nCoveredLetters": 0}, "maxWords": 5, "band": 5,
         "nBestCoveredLetters": null, "nWinnerWords": null, "nWinnerCoveredLetters": null}'::jsonb,
  'coop: a fresh summary'
);
select is(
  pg_temp.summary_data(pg_temp.game('compete')),
  pg_temp.common_summary(pg_temp.game('compete'))
    || '{"team": null, "maxWords": 5, "band": 5,
         "nBestCoveredLetters": 0, "nWinnerWords": null, "nWinnerCoveredLetters": null}'::jsonb,
  'compete: a fresh summary'
);

-- ─── (2) Mid-game coop: ada plays ADG, bea takes a hint, ada a spoiler ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select letterboxed.submit_word(pg_temp.game('coop'), 'adg');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.log_hint_or_spoiler(pg_temp.game('coop'), 'gjb', 'hint');
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select letterboxed.log_hint_or_spoiler(pg_temp.game('coop'), 'gjb', 'spoiler');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_agg(e - 'id' - 'at' order by (e ->> 'id')::bigint)
     from jsonb_array_elements(pg_temp.game_data(pg_temp.game('coop')) -> 'events') e),
  '[{"userId": "ada11111-1111-1111-1111-111111111111", "kind": "word", "word": "adg",
     "nCoveredLetters": 3, "tookTurn": true},
    {"userId": "bea22222-2222-2222-2222-222222222222", "kind": "hint", "word": "gjb",
     "nCoveredLetters": 3, "tookTurn": false},
    {"userId": "ada11111-1111-1111-1111-111111111111", "kind": "spoiler", "word": "gjb",
     "nCoveredLetters": 3, "tookTurn": false}]'::jsonb,
  'coop: the log — the word, then the hint and the spoiler, which take no turn'
);
select is(
  pg_temp.game_data(pg_temp.game('coop')) -> 'team',
  '{"nWordsUsed": 1, "nCoveredLetters": 3, "board": {"words": ["adg"]},
    "nHintsUsed": 1, "nSpoilersUsed": 1, "maxWords": 5}'::jsonb,
  'coop: the team''s chain, and the hints and spoilers summed'
);
select is(
  jsonb_build_array(
    pg_temp.player(pg_temp.game('coop'), 'ada11111-1111-1111-1111-111111111111') -> 'board',
    pg_temp.player(pg_temp.game('coop'), 'bea22222-2222-2222-2222-222222222222') -> 'board'),
  '[null, null]'::jsonb,
  'coop: the one chain is sent once — no coop player carries it'
);
select is(
  (select jsonb_agg(jsonb_build_array(p -> 'nHintsUsed', p -> 'nSpoilersUsed') order by p ->> 'id')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.game('coop')) -> 'players') p),
  '[[0, 1], [1, 0]]'::jsonb,
  'each player''s hints and spoilers are their own, counted apart'
);

-- ─── (3) Mid-game compete: ada plays ADG ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select letterboxed.submit_word(pg_temp.game('compete'), 'adg');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.counts(pg_temp.game('compete')),
  '[[1, 3], [0, 0]]'::jsonb,
  'compete: each racer''s counts are their own chain''s'
);
select is(
  jsonb_build_array(
    pg_temp.player(pg_temp.game('compete'), 'ada11111-1111-1111-1111-111111111111') -> 'board',
    pg_temp.player(pg_temp.game('compete'), 'bea22222-2222-2222-2222-222222222222') -> 'board'),
  '[{"words": ["adg"]}, {"words": []}]'::jsonb,
  'compete: a racer''s chain moves alone'
);
select is(
  (select jsonb_agg(e ->> 'userId') from jsonb_array_elements(pg_temp.game_data(pg_temp.game('compete')) -> 'events') e),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  'compete: the log carries every racer''s rows — what a racer may see is the hook''s rule'
);
select is(
  pg_temp.summary_data(pg_temp.game('compete')) -> 'nBestCoveredLetters',
  '3'::jsonb,
  'compete: the summary carries the best chain so far'
);

-- ─── (4) The endings ───
-- Coop: ada takes ADG back, then plays the seeded pair. Compete: the same, and
-- the solve ends the race. Timed: ada plays ADG and the timer runs out.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select letterboxed.undo_word(pg_temp.game('coop'));
select letterboxed.submit_word(pg_temp.game('coop'), 'adgjbehk');
select letterboxed.submit_word(pg_temp.game('coop'), 'kcfil');
select letterboxed.undo_word(pg_temp.game('compete'));
select letterboxed.submit_word(pg_temp.game('compete'), 'adgjbehk');
select letterboxed.submit_word(pg_temp.game('compete'), 'kcfil');
select letterboxed.submit_word(pg_temp.game('timed'), 'adg');
select letterboxed.submit_timeout(pg_temp.game('timed'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select e - 'id' - 'at'
     from jsonb_array_elements(pg_temp.game_data(pg_temp.game('coop')) -> 'events') e
    where e ->> 'kind' = 'undo'),
  '{"userId": "ada11111-1111-1111-1111-111111111111", "kind": "undo", "word": "adg",
    "nCoveredLetters": 0, "tookTurn": true}'::jsonb,
  'an undo is logged with the word taken back and what the chain covers after it'
);
select is(
  pg_temp.game_data(pg_temp.game('coop')) -> 'puzzle' -> 'solution',
  '["adgjbehk", "kcfil"]'::jsonb,
  'the solution arrives once the game has ended'
);
select is(
  (select jsonb_agg(jsonb_build_array(p -> 'solved', p -> 'outcome') order by p ->> 'id')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.game('coop')) -> 'players') p)
    || jsonb_build_array(pg_temp.game_data(pg_temp.game('coop')) -> 'team' -> 'nCoveredLetters'),
  '[[true, "won"], [true, "won"], 12]'::jsonb,
  'coop solved: the solve stamps every teammate, and the team''s chain covers the twelve'
);
select is(
  pg_temp.summary_data(pg_temp.game('compete')),
  pg_temp.common_summary(pg_temp.game('compete'))
    || '{"team": null, "maxWords": 5, "band": 5,
         "nBestCoveredLetters": 12, "nWinnerWords": 2, "nWinnerCoveredLetters": 12}'::jsonb,
  'compete solved: the summary names the winner''s chain'
);
select is(
  jsonb_build_array(
    pg_temp.game_data(pg_temp.game('timed')) -> 'ending' -> 'winner',
    pg_temp.summary_data(pg_temp.game('timed')) -> 'nWinnerWords',
    pg_temp.summary_data(pg_temp.game('timed')) -> 'nWinnerCoveredLetters'),
  '["ada11111-1111-1111-1111-111111111111", null, 3]'::jsonb,
  'a timeout: the winner''s letters, and no word count, since nobody solved'
);
select is(
  (pg_temp.shell_data(pg_temp.game('coop')) ->> 'ended')::boolean,
  true,
  'the builder rewrites shell_data beside the game_data'
);

-- ─── (5) A Restart empties it all again ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select letterboxed.replay_board(pg_temp.game('coop'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  jsonb_build_object(
    'team',     pg_temp.game_data(pg_temp.game('coop')) -> 'team',
    'events',   pg_temp.game_data(pg_temp.game('coop')) -> 'events',
    'solution', pg_temp.game_data(pg_temp.game('coop')) -> 'puzzle' -> 'solution',
    'ada',      pg_temp.own_keys(pg_temp.player(pg_temp.game('coop'), 'ada11111-1111-1111-1111-111111111111'))),
  '{"team": {"nWordsUsed": 0, "nCoveredLetters": 0, "board": {"words": []},
             "nHintsUsed": 0, "nSpoilersUsed": 0, "maxWords": 5},
    "events": [], "solution": null,
    "ada": {"maxWords": 5, "nHintsUsed": 0, "nSpoilersUsed": 0,
            "nWordsUsed": null, "nCoveredLetters": null, "board": null}}'::jsonb,
  'after a Restart: an empty chain, no log, nothing taken, no solution'
);

-- ─── (6) _rebuild_data_cols_for_all ───
update common.games
   set static_game_data = null, game_data = null, summary_data = null, shell_data = null,
       status_changed_at = '2026-01-01'
 where id in (select id from g);
select is(letterboxed._rebuild_data_cols_for_all() >= 3, true, '_rebuild_data_cols_for_all rewrites every letterboxed game');
select is(
  (select count(*)::int from common.games
    where id in (select id from g)
      and static_game_data is not null and game_data is not null
      and summary_data is not null and shell_data is not null),
  3,
  '… every blob is back'
);
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and status_changed_at = '2026-01-01'),
  3,
  '… and no game is re-dated'
);

select * from finish();
rollback;
