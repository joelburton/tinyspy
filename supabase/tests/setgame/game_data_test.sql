-- cs-unmet

-- ============================================================
-- Test: setgame's page blobs — static_game_data, game_data and summary_data
-- ============================================================
-- `setgame._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move, and `_write_static_game_data` what nothing
-- after create changes (supabase/sql/setgame.sql → The page blobs). This file
-- pins what the page gets:
--
--   1. A fresh game: the table as tiles in slot order, the deck's count and
--      never the deck; coop's team at nothing and no team in compete; each
--      player fresh; a fresh summary; the static blob the common part alone
--   2. Mid-game coop: a claim and a hint in the log, each with its tiles and
--      the table after; each player's own counts and the team's sum
--   3. Mid-game compete: every racer's rows and counts are in the blob — a
--      claim was made in front of everyone
--   4. The endings: a race's winners and the sets they share; a coop clear
--      stamps every teammate, and says whether it was a perfect clear
--   5. A Restart empties it all again
--   6. `_rebuild_data_cols_for_all` rewrites every setgame game, its static
--      blob included, without re-dating it
--
-- A board is a shuffle, so every assertion is against the tables the blob
-- is built from, never a fixed deal.
-- ============================================================

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(24);

-- A board as the blob writes it: each tile `{id}`, in slot order.
create function pg_temp.sg_tiles_json(p smallint[]) returns jsonb
language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t::text) order by o), '[]'::jsonb)
    from unnest(p) with ordinality as x(t, o);
$$;

-- One player's setgame keys, as "nSetsFound/nHintsUsed".
create function pg_temp.sg_counts(gid uuid, uid uuid) returns text
language sql as $$
  select (p->>'nSetsFound') || '/' || (p->>'nHintsUsed')
    from common.games, jsonb_array_elements(game_data->'players') p
   where id = gid and (p->>'id')::uuid = uid;
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Set blobs', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select mode, (setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) mode;
grant select on g to authenticated;

reset role;
create temp table opening on commit drop as
select mode, pg_temp.sg_board(id) as board from g;

-- ─── (1) A fresh game ───
select is(
  (select game_data->'board'->'tiles' from common.games where id = (select id from g where mode = 'coop')),
  pg_temp.sg_tiles_json((select board from opening where mode = 'coop')),
  'the table is its tiles in slot order, each {id} — its four digits as text');
select is(
  (select (game_data->>'nTilesInDeck')::int from common.games where id = (select id from g where mode = 'coop')),
  81 - cardinality((select board from opening where mode = 'coop')),
  'nTilesInDeck is every tile not yet on the table');
select ok(
  (select not (game_data ? 'deck') and not (game_data ? 'puzzle')
     from common.games where id = (select id from g where mode = 'coop')),
  'the deck itself is not in the blob — nothing shows its order');
select is(
  (select static_game_data from common.games where id = (select id from g where mode = 'coop')),
  common._make_json_static_game_data((select id from g where mode = 'coop')),
  'static_game_data is the common part alone: setgame adds nothing to it');
select is(
  (select game_data->'team' from common.games where id = (select id from g where mode = 'coop')),
  '{"nSetsFound": 0, "nHintsUsed": 0}'::jsonb,
  'coop''s team starts at nothing');
select is(
  (select game_data->'team' from common.games where id = (select id from g where mode = 'compete')),
  'null'::jsonb,
  'a race has no team');
select is(
  array[pg_temp.sg_counts((select id from g where mode = 'coop'), 'ada11111-1111-1111-1111-111111111111'),
        pg_temp.sg_counts((select id from g where mode = 'coop'), 'bea22222-2222-2222-2222-222222222222')],
  array['0/0', '0/0'],
  'each player starts with no sets and no hints');
select is(
  (select summary_data - 'id' - 'gametype' - 'title' - 'statusChangedAt' - 'ended' - 'outcome' - 'ending'
                       - 'players'
     from common.games where id = (select id from g where mode = 'coop')),
  jsonb_build_object(
    'team', '{"nSetsFound": 0, "nHintsUsed": 0}'::jsonb,
    'nTableSetsFound', 0,
    'nTilesInDeck', 81 - cardinality((select board from opening where mode = 'coop')),
    'perfectClear', null, 'nWinnerSets', null),
  'a fresh summary: the team, the deck''s count, and no ending''s keys');

-- ─── (2) Mid-game coop: ada claims a set; bea asks a hint ───
create temp table coop_claim on commit drop as
select pg_temp.sg_live((select id from g where mode = 'coop')) as tiles;
grant select on coop_claim to authenticated;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select setgame.submit_set((select id from g where mode = 'coop'), (select tiles from coop_claim));
reset role;
create temp table coop_hint on commit drop as
select array[(pg_temp.sg_live((select id from g where mode = 'coop')))[1]]::smallint[] as tiles;
grant select on coop_hint to authenticated;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select setgame.record_hint((select id from g where mode = 'coop'), (select tiles from coop_hint));
reset role;

select is(
  (select jsonb_agg(e - 'id' - 'at' order by e->'id')
     from common.games, jsonb_array_elements(game_data->'events') e
    where common.games.id = (select id from g where mode = 'coop')),
  jsonb_build_array(
    jsonb_build_object(
      'userId', 'ada11111-1111-1111-1111-111111111111', 'kind', 'claim',
      'tiles', pg_temp.sg_tiles_json((select tiles from coop_claim)),
      'boardAfter', pg_temp.sg_tiles_json(pg_temp.sg_board((select id from g where mode = 'coop'))),
      'tookTurn', true),
    jsonb_build_object(
      'userId', 'bea22222-2222-2222-2222-222222222222', 'kind', 'hint',
      'tiles', pg_temp.sg_tiles_json((select tiles from coop_hint)),
      'boardAfter', pg_temp.sg_tiles_json(pg_temp.sg_board((select id from g where mode = 'coop'))),
      'tookTurn', false)),
  'the log: a claim''s three tiles and a hint''s one, each with the table after');
select is(
  (select game_data->'board'->'tiles' from common.games where id = (select id from g where mode = 'coop')),
  pg_temp.sg_tiles_json(pg_temp.sg_board((select id from g where mode = 'coop'))),
  'the table follows the claim');
select is(
  array[pg_temp.sg_counts((select id from g where mode = 'coop'), 'ada11111-1111-1111-1111-111111111111'),
        pg_temp.sg_counts((select id from g where mode = 'coop'), 'bea22222-2222-2222-2222-222222222222')],
  array['1/0', '0/1'],
  'each player''s counts are their own');
select is(
  (select game_data->'team' from common.games where id = (select id from g where mode = 'coop')),
  '{"nSetsFound": 1, "nHintsUsed": 1}'::jsonb,
  'the team''s are the players'' summed');

-- ─── (3) Mid-game compete: ada claims; bea's blob shows it ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select setgame.submit_set((select id from g where mode = 'compete'),
                          pg_temp.sg_live((select id from g where mode = 'compete')));
reset role;
select is(
  (select jsonb_array_length(game_data->'events') from common.games where id = (select id from g where mode = 'compete')),
  1, 'a racer''s claim is in the log every player reads');
select is(
  pg_temp.sg_counts((select id from g where mode = 'compete'), 'ada11111-1111-1111-1111-111111111111'),
  '1/0', 'and her count, which the opponent strip shows');

-- ─── (4) The endings ───
-- The race: ada takes every set.
select pg_temp.sg_play_out((select id from g where mode = 'compete'),
                           array['ada11111-1111-1111-1111-111111111111'::uuid]);
select is(
  (select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g where mode = 'compete')),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  'a race ranks its winners first');
select is(
  (select (summary_data->>'nWinnerSets')::int from common.games where id = (select id from g where mode = 'compete')),
  (select n_sets_found from setgame.players
    where game_id = (select id from g where mode = 'compete')
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'and the sets they won on');
select is(
  (select (summary_data->>'nTableSetsFound')::int from common.games where id = (select id from g where mode = 'compete')),
  (select sum(n_sets_found)::int from setgame.players where game_id = (select id from g where mode = 'compete')),
  'a race''s summary still counts the sets the table took');
select is(
  (select summary_data->'perfectClear' from common.games where id = (select id from g where mode = 'compete')),
  'null'::jsonb,
  'a race has no perfect clear');

-- The coop table cleared: every teammate stamped, and the clear judged.
select pg_temp.sg_play_out((select id from g where mode = 'coop'),
                           array['ada11111-1111-1111-1111-111111111111'::uuid,
                                 'bea22222-2222-2222-2222-222222222222'::uuid]);
select is(
  (select array_agg(p->>'outcome' order by p->>'id')
     from common.games, jsonb_array_elements(game_data->'players') p
    where common.games.id = (select id from g where mode = 'coop')),
  case when cardinality(pg_temp.sg_board((select id from g where mode = 'coop'))) = 0
       then array['won', 'won'] else array['neutral', 'neutral'] end,
  'a coop clear stamps every teammate alike: won on a perfect clear, else neutral');
select is(
  (select (summary_data->>'perfectClear')::boolean from common.games where id = (select id from g where mode = 'coop')),
  cardinality(pg_temp.sg_board((select id from g where mode = 'coop'))) = 0,
  'and is a perfect clear only when the table ended empty');
select is(
  (select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g where mode = 'coop')),
  case when cardinality(pg_temp.sg_board((select id from g where mode = 'coop'))) = 0
       then '["ada11111-1111-1111-1111-111111111111", "bea22222-2222-2222-2222-222222222222"]'::jsonb
       else '[]'::jsonb end,
  'a perfect clear ranks the whole team first; tiles left over rank nobody');

-- ─── (5) A Restart empties it all again ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select setgame.replay_board((select id from g where mode = 'coop'));
reset role;
select is(
  (select jsonb_build_object('tiles', game_data->'board'->'tiles', 'events', game_data->'events',
                             'team', game_data->'team')
     from common.games where id = (select id from g where mode = 'coop')),
  jsonb_build_object('tiles', pg_temp.sg_tiles_json((select board from opening where mode = 'coop')),
                     'events', '[]'::jsonb,
                     'team', '{"nSetsFound": 0, "nHintsUsed": 0}'::jsonb),
  'a Restart: the opening table back, the log empty, the team at nothing');

-- ─── (6) _rebuild_data_cols_for_all ───
create temp table dated on commit drop as
select status_changed_at from common.games where id = (select id from g where mode = 'coop');
update common.games set game_data = '{}'::jsonb, static_game_data = null
 where id = (select id from g where mode = 'coop');
select is(setgame._rebuild_data_cols_for_all() >= 2, true,
  '_rebuild_data_cols_for_all rewrites every setgame game');
select is(
  (select jsonb_build_object('rebuilt', game_data ? 'board', 'static', static_game_data ? 'setup',
                             'dated', status_changed_at)
     from common.games where id = (select id from g where mode = 'coop')),
  jsonb_build_object('rebuilt', true, 'static', true, 'dated', (select status_changed_at from dated)),
  'both blobs are back, and the game is not re-dated');

select * from finish();
rollback;
