-- cs-unmet

-- ============================================================
-- Test: scrabble's page blobs — static_game_data, game_data and summary_data
-- ============================================================
-- `scrabble._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move, and `_write_static_game_data` what nothing
-- after create changes (supabase/sql/scrabble.sql → The page blobs). This file
-- pins what the page gets:
--
--   1. A fresh game: an empty board string, the bag counted and never
--      listed, coop's team with its rack and compete's players with theirs,
--      every score at nothing, a bot's level; a fresh summary; the static
--      blob the common part alone
--   2. Mid-game coop: a blank played as C lands as a capital in the board
--      string and the placement; the log row; each player's own score and
--      the team's sum
--   3. Mid-game compete: every rack is in the blob — the page's useGame is
--      what withholds a rival's
--   4. The endings: a race's winners and their score, with the leftovers and
--      the going-out bonus in the log; a coop Stop's team score
--   5. A Restart empties it all again
--   6. `_rebuild_data_cols_for_all` rewrites every scrabble game, its static
--      blob included, without re-dating it
--
-- The deal is random, so racks and bags are set by hand wherever a value
-- depends on them.
-- ============================================================

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(27);

-- One player's scrabble keys off game_data, as "score/nRackTiles/rack".
create function pg_temp.sc_player(gid uuid, uid uuid) returns text
language sql as $$
  select coalesce(p->>'score', '∅') || '/' || coalesce(p->>'nRackTiles', '∅')
         || '/' || coalesce((p->'rack')::text, '∅')
    from common.games, jsonb_array_elements(game_data->'players') p
   where id = gid and (p->>'id')::uuid = uid;
$$;

create function pg_temp.sc_letters(gid uuid) returns text
language sql as $$
  select game_data->'board'->>'letters' from common.games where id = gid;
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Rack blobs', array['ada', 'bea']) as handle;
-- Coop: ada and bea. Compete: ada against one bot, at its strongest.
create temp table g on commit drop as
select 'coop' as mode, (scrabble.create_game(
  (select handle from club), '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id
union all
select 'compete', (scrabble.create_game(
  (select handle from club),
  '{"dict_2": 6, "dict_3plus": 6, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'compete')->'data'->>'id')::uuid;
grant select on g to authenticated;
reset role;

create temp table bot on commit drop as
  select user_id as id from common.profiles where ai_member order by username limit 1;
grant select on bot to authenticated;

-- ─── (1) A fresh game ───
select is(pg_temp.sc_letters((select id from g where mode = 'coop')), repeat('.', 225),
  'the board is one string of 225 empty squares');
select is(
  (select (game_data->>'nBagTiles')::int || '/' || (game_data->>'version')
     from common.games where id = (select id from g where mode = 'coop')),
  '93/0', 'coop: the bag is counted after one rack of seven, and version starts at 0');
select ok(
  (select not (game_data ? 'bag') and not (game_data ? 'puzzle')
     from common.games where id = (select id from g where mode = 'coop')),
  'the bag''s order is not in the blob, and there is no puzzle');
select is(
  (select static_game_data from common.games where id = (select id from g where mode = 'coop')),
  common._make_json_static_game_data((select id from g where mode = 'coop')),
  'static_game_data is the common part alone: scrabble adds nothing to it');
select is(
  (select jsonb_build_object('score', game_data->'team'->'score',
                             'nRackTiles', game_data->'team'->'nRackTiles',
                             'rackLen', jsonb_array_length(game_data->'team'->'rack'))
     from common.games where id = (select id from g where mode = 'coop')),
  '{"score": 0, "nRackTiles": 7, "rackLen": 7}'::jsonb,
  'coop''s team holds the one rack of seven and a score of nothing');
select is(
  pg_temp.sc_player((select id from g where mode = 'coop'), 'ada11111-1111-1111-1111-111111111111'),
  '0/∅/null', 'a coop player has their own score and no rack of their own');
select is(
  (select game_data->'team' from common.games where id = (select id from g where mode = 'compete')),
  'null'::jsonb, 'a race has no team');
select is(
  (select (p->>'nRackTiles')::int || '/' || jsonb_array_length(p->'rack') || '/' || coalesce(p->>'aiLevel', '∅')
     from common.games, jsonb_array_elements(game_data->'players') p
    where id = (select id from g where mode = 'compete') and (p->>'id')::uuid = (select id from bot)),
  '7/7/best', 'a racer''s rack and its count are theirs, and a bot carries its level');
select is(
  (select p->>'aiLevel'
     from common.games, jsonb_array_elements(game_data->'players') p
    where id = (select id from g where mode = 'compete')
      and (p->>'id')::uuid = 'ada11111-1111-1111-1111-111111111111'),
  null, 'a person has no level');
select is(
  (select summary_data - 'id' - 'gametype' - 'title' - 'statusChangedAt' - 'ended' - 'outcome' - 'ending'
                       - 'players'
     from common.games where id = (select id from g where mode = 'coop')),
  '{"team": {"score": 0}, "nBagTiles": 93, "winnerScore": null}'::jsonb,
  'a fresh coop summary: the team''s score, the bag, no winning score');
select is(
  (select summary_data->'team' from common.games where id = (select id from g where mode = 'compete')),
  'null'::jsonb, 'a race''s summary has no team');

-- ─── (2) Mid-game coop: ada plays CAT, the C a blank, from a known rack ───
select pg_temp.sc_coop((select id from g where mode = 'coop'),
  array['?','a','t','s','e','r','d'], array['x','y','z']);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.play_word((select id from g where mode = 'coop'), 0,
  '[{"x":7,"y":7,"letter":"c","blank":true},
    {"x":8,"y":7,"letter":"a","blank":false},
    {"x":9,"y":7,"letter":"t","blank":false}]'::jsonb, array['cat'], 4);
reset role;

select is(
  substr(pg_temp.sc_letters((select id from g where mode = 'coop')), 113, 3),
  'Cat', 'the blank played as C is a capital in the board string; the real tiles are lowercase');
select is(
  (select jsonb_agg(e - 'id' - 'at' order by e->'id')
     from common.games, jsonb_array_elements(game_data->'events') e
    where common.games.id = (select id from g where mode = 'coop')),
  jsonb_build_array(jsonb_build_object(
    'userId', 'ada11111-1111-1111-1111-111111111111', 'kind', 'word',
    'placements', '["7,7:C", "8,7:a", "9,7:t"]'::jsonb,
    'words', '["cat"]'::jsonb, 'score', 4, 'nTiles', null, 'tookTurn', true)),
  'the log: the word''s placements under the same case rule, its words and score');
select is(
  array[pg_temp.sc_player((select id from g where mode = 'coop'), 'ada11111-1111-1111-1111-111111111111'),
        pg_temp.sc_player((select id from g where mode = 'coop'), 'bea22222-2222-2222-2222-222222222222')],
  array['4/∅/null', '0/∅/null'],
  'each coop player''s score is their own');
select is(
  (select jsonb_build_object('score', game_data->'team'->'score', 'rack', game_data->'team'->'rack')
     from common.games where id = (select id from g where mode = 'coop')),
  '{"score": 4, "rack": ["s", "e", "r", "d", "x", "y", "z"]}'::jsonb,
  'the team''s score is the players'' sum, and its rack has drawn from the bag');
select is(
  (select (game_data->>'nBagTiles')::int || '/' || (game_data->>'version')
     from common.games where id = (select id from g where mode = 'coop')),
  '0/1', 'the bag count and the version follow the move');

-- ─── (3) Mid-game compete: every rack is in the blob ───
select is(
  (select count(*)::int
     from common.games, jsonb_array_elements(game_data->'players') p
    where id = (select id from g where mode = 'compete') and jsonb_typeof(p->'rack') = 'array'),
  2, 'a rival''s rack is in the blob; the page''s useGame withholds it');

-- ─── (4) The endings ───
-- The race: ada goes out with the bag empty; the bot is left holding q and z.
select pg_temp.sc_turn((select id from g where mode = 'compete'), 'ada11111-1111-1111-1111-111111111111');
select pg_temp.sc_rack((select id from g where mode = 'compete'), 'ada11111-1111-1111-1111-111111111111', array['a','t']);
select pg_temp.sc_rack((select id from g where mode = 'compete'), (select id from bot), array['q','z']);
select pg_temp.sc_bag((select id from g where mode = 'compete'), '{}');
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.play_word((select id from g where mode = 'compete'), 0,
  '[{"x":7,"y":7,"letter":"a","blank":false},
    {"x":8,"y":7,"letter":"t","blank":false}]'::jsonb, array['at'], 2);
reset role;
select is(
  (select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g where mode = 'compete')),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  'a race ranks its winners first');
select is(
  (select (summary_data->>'winnerScore')::int from common.games where id = (select id from g where mode = 'compete')),
  22, 'and the score they won on: 2 played + 20 of the bot''s leftovers');
select is(
  (select jsonb_agg(jsonb_build_object('kind', e->'kind', 'score', e->'score', 'nTiles', e->'nTiles') order by e->'id')
     from common.games, jsonb_array_elements(game_data->'events') e
    where common.games.id = (select id from g where mode = 'compete') and not (e->>'tookTurn')::boolean),
  '[{"kind": "leftovers", "score": -20, "nTiles": 2}, {"kind": "went_out", "score": 20, "nTiles": null}]'::jsonb,
  'the log carries the leftovers and the going-out bonus, neither having taken a turn');
select is(
  array[pg_temp.sc_player((select id from g where mode = 'compete'), 'ada11111-1111-1111-1111-111111111111'),
        pg_temp.sc_player((select id from g where mode = 'compete'), (select id from bot))],
  array['22/0/[]', '-20/2/["q", "z"]'],
  'each racer''s final score, and every rack revealed');
select is(
  (select array_agg(p->>'outcome' order by p->>'seat')
     from common.games, jsonb_array_elements(game_data->'players') p
    where common.games.id = (select id from g where mode = 'compete')),
  array['won', 'lost'],
  'the winner won; the bot, who played no word, has no place: lost');

-- The coop table stops with tiles in hand: the team pays for them.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select scrabble.stop_game((select id from g where mode = 'coop'));
reset role;
select is(
  (select jsonb_build_object('team', summary_data->'team', 'outcome', summary_data->'outcome')
     from common.games where id = (select id from g where mode = 'coop')),
  '{"team": {"score": -23}, "outcome": "neutral"}'::jsonb,
  'a coop Stop: the team''s 4 less the rack''s 27 (s e r d x y z), and no verdict');

-- ─── (5) A Restart empties it all again ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.replay_board((select id from g where mode = 'coop'));
reset role;
select is(
  (select jsonb_build_object('letters', game_data->'board'->>'letters', 'events', game_data->'events',
                             'score', game_data->'team'->'score', 'nBagTiles', game_data->'nBagTiles')
     from common.games where id = (select id from g where mode = 'coop')),
  jsonb_build_object('letters', repeat('.', 225), 'events', '[]'::jsonb, 'score', 0, 'nBagTiles', 93),
  'a Restart: an empty board, the log empty, the team at nothing, a fresh bag');
select is(
  array[pg_temp.sc_player((select id from g where mode = 'coop'), 'ada11111-1111-1111-1111-111111111111'),
        pg_temp.sc_player((select id from g where mode = 'coop'), 'bea22222-2222-2222-2222-222222222222')],
  array['0/∅/null', '0/∅/null'],
  'and every player''s own score back at nothing');

-- ─── (6) _rebuild_data_cols_for_all ───
create temp table dated on commit drop as
select status_changed_at from common.games where id = (select id from g where mode = 'coop');
update common.games set game_data = '{}'::jsonb, static_game_data = null
 where id = (select id from g where mode = 'coop');
select is(scrabble._rebuild_data_cols_for_all() >= 2, true,
  '_rebuild_data_cols_for_all rewrites every scrabble game');
select is(
  (select jsonb_build_object('rebuilt', game_data ? 'board', 'static', static_game_data ? 'setup',
                             'dated', status_changed_at)
     from common.games where id = (select id from g where mode = 'coop')),
  jsonb_build_object('rebuilt', true, 'static', true, 'dated', (select status_changed_at from dated)),
  'both blobs are back, and the game is not re-dated');

select * from finish();
rollback;
