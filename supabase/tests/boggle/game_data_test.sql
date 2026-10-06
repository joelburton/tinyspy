-- cs-unmet

-- ============================================================
-- Test: boggle's page blobs — static_game_data, game_data, summary_data, and shell_data beside them
-- ============================================================
-- `boggle._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move, and `_write_static_game_data` what nothing
-- after create changes (supabase/sql/boggle.sql → The page blobs). This file
-- pins what the page gets:
--
--   1. A fresh game: the puzzle as create_game froze it, in the static blob —
--      its tiles in row order, a two-letter tile's letters and a blank's null,
--      both word lists flagged and totaled — and none in game_data; no team
--      progress, nothing found, every player
--      fresh; compete has no team, and its summary carries the target
--   2. Mid-game coop: the found words in the order found, each player's six
--      counts over their own finds, the team's over every row
--   3. Mid-game compete: each racer's own counts; the found words carry every
--      racer's rows (the page withholds, not the builder); no top score yet
--   4. The endings: the race's crosser wins and alone is stamped solved, and
--      the top score leaves a conceder's points out; a coop target stamps every
--      teammate; a Stop is neutral and the summary keeps the team's progress
--   5. A Restart empties it all again, the solve included
--   6. `_rebuild_data_cols_for_all` rewrites every boggle game, its static
--      blob included, without re-dating it
--
-- The fixture's required set (setup.psql) is 6 words worth 9 points; this
-- file's board adds a Qu tile, a blank and two bonus words. A 50% target is
-- 5 required points. `submit_word` trusts the points it is sent, as it trusts
-- the frontend's.
-- ============================================================

begin;
set search_path = boggle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(35);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('boggle pages', array['ada', 'bea']) as handle;

-- The fixture board, with a Qu tile at cell 2, a blank at cell 4 and two bonus
-- words worth 3 points between them.
create function pg_temp.board() returns jsonb language sql as
  $$ select pg_temp.boggle_board() || jsonb_build_object(
       'board',       'CA1R0EXOTMPLNGDB',
       'bonus_words', '[{"word": "scat", "points": 1}, {"word": "tacos", "points": 2}]'::jsonb) $$;

-- A coop game with no target, a race to 50%, and a coop game with a 50% target.
create temp table g on commit drop as
select name, (boggle.create_game(
  (select handle from club),
  pg_temp.boggle_setup() || case when name = 'coop' then '{}'::jsonb else '{"win_percent": 50}'::jsonb end,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  case when name = 'compete' then 'compete' else 'coop' end,
  pg_temp.board()
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete', 'coop_target']) as name;
reset role;
select set_config('request.jwt.claims', '', true);
grant select on g to authenticated;

-- Shorthands: each game's id and blobs, and one player inside the game_data.
create function pg_temp.game(which text) returns uuid language sql as
  $$ select id from g where name = which $$;
create function pg_temp.game_data(game uuid) returns jsonb language sql as
  $$ select game_data from common.games where id = game $$;
create function pg_temp.static_game_data(game uuid) returns jsonb language sql as
  $$ select static_game_data from common.games where id = game $$;
create function pg_temp.summary_data(game uuid) returns jsonb language sql as
  $$ select summary_data from common.games where id = game $$;
create function pg_temp.shell_data(game uuid) returns jsonb language sql as
  $$ select shell_data from common.games where id = game $$;
create function pg_temp.player(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p
      where p ->> 'id' = uid::text $$;
-- Six counts as one row: every find, then the required and bonus finds apart.
create function pg_temp.six(o jsonb) returns jsonb language sql as
  $$ select jsonb_build_array(o -> 'nFoundWords', o -> 'foundWordsScore',
                              o -> 'nFoundReqdWords', o -> 'foundReqdWordsScore',
                              o -> 'nFoundBonusWords', o -> 'foundBonusWordsScore') $$;
-- Each player's six counts, in id order.
create function pg_temp.counts(game uuid) returns jsonb language sql as
  $$ select jsonb_agg(pg_temp.six(p) order by p ->> 'id')
       from jsonb_array_elements(pg_temp.game_data(game) -> 'players') p $$;
-- Whether each player is stamped solved, in id order.
create function pg_temp.solved(game uuid) returns jsonb language sql as
  $$ select jsonb_agg(p -> 'solved' order by p ->> 'id')
       from jsonb_array_elements(pg_temp.game_data(game) -> 'players') p $$;
-- The keys boggle adds to the summary, without the common part.
create function pg_temp.summary_own(game uuid) returns jsonb language sql as
  $$ select pg_temp.summary_data(game)
            - (select array_agg(k) from jsonb_object_keys(common._make_json_summary_data(game, now())) k) $$;

create function pg_temp.zeros() returns jsonb language sql as
  $$ select '{"nFoundWords": 0, "foundWordsScore": 0, "nFoundReqdWords": 0, "foundReqdWordsScore": 0,
              "nFoundBonusWords": 0, "foundBonusWordsScore": 0}'::jsonb $$;

-- ─── (1) A fresh game ───
select is(
  pg_temp.static_game_data(pg_temp.game('coop')) -> 'puzzle' -> 'tiles',
  (select jsonb_agg(jsonb_build_object('id', (ord - 1)::text, 'letters', l) order by ord)
     from unnest(array['c', 'a', 'qu', 'r', null, 'e', 'x', 'o', 't', 'm', 'p', 'l', 'n', 'g', 'd', 'b'])
          with ordinality as x(l, ord)),
  'the tiles in row order, each id its cell''s index — a Qu tile''s letters are "qu", a blank''s null'
);
select is(
  (pg_temp.static_game_data(pg_temp.game('coop')) -> 'puzzle') - 'tiles' - 'words',
  '{"boardSideSize": 4, "minWordLength": 3, "nReqdWords": 6, "reqdWordsScore": 9,
    "nBonusWords": 2, "bonusWordsScore": 3}'::jsonb,
  'the puzzle''s size, minimum length, and each list''s count and score'
);
select is(
  (select jsonb_agg(w ->> 'word' || '/' || (w ->> 'points') || '/' || (w ->> 'bonus'))
     from jsonb_array_elements(pg_temp.static_game_data(pg_temp.game('coop')) -> 'puzzle' -> 'words') w),
  '["cat/1/false", "car/1/false", "arc/1/false", "cart/1/false", "scare/2/false", "traces/3/false",
    "scat/1/true", "tacos/2/true"]'::jsonb,
  'every legal word scored, the required ones first, each flagged with its list'
);
select is(pg_temp.game_data(pg_temp.game('coop')) -> 'team', pg_temp.zeros(), 'coop: the team has found nothing');
select is(pg_temp.game_data(pg_temp.game('coop')) -> 'foundWords', '[]'::jsonb, 'coop: nothing found yet');
select is(
  pg_temp.counts(pg_temp.game('coop')),
  jsonb_build_array(pg_temp.six(pg_temp.zeros()), pg_temp.six(pg_temp.zeros())),
  'coop: every player fresh'
);
select is(pg_temp.static_game_data(pg_temp.game('coop')) ->> 'gametype', 'boggle_coop', 'the common part is underneath, in the static blob');
select is(pg_temp.game_data(pg_temp.game('coop')) ? 'puzzle', false, 'game_data carries no puzzle: it is all static');
select is(
  pg_temp.summary_own(pg_temp.game('coop')),
  jsonb_build_object('team', pg_temp.zeros(), 'targetWinPercent', null, 'topScore', null),
  'coop: summary_data carries the team, no target and no top score beside the common part'
);
select is(pg_temp.game_data(pg_temp.game('compete')) -> 'team', 'null'::jsonb, 'compete: no team');
select is(
  pg_temp.summary_own(pg_temp.game('compete')),
  '{"team": null, "targetWinPercent": 50, "topScore": null}'::jsonb,
  'compete: the summary carries the target, and no team'
);

-- ─── (2) Mid-game coop: ada finds a required word, bea a bonus one ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select boggle.submit_word(pg_temp.game('coop'), 'cat', 1, false);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select boggle.submit_word(pg_temp.game('coop'), 'scat', 1, true);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_agg(e - 'at') from jsonb_array_elements(pg_temp.game_data(pg_temp.game('coop')) -> 'foundWords') e),
  jsonb_build_array(
    jsonb_build_object('userId', 'ada11111-1111-1111-1111-111111111111', 'word', 'cat', 'points', 1, 'bonus', false),
    jsonb_build_object('userId', 'bea22222-2222-2222-2222-222222222222', 'word', 'scat', 'points', 1, 'bonus', true)),
  'the found words carry each find''s player, word, points and list, in the order found'
);
select is(
  (select jsonb_typeof(e -> 'at') from jsonb_array_elements(pg_temp.game_data(pg_temp.game('coop')) -> 'foundWords') e limit 1),
  'string',
  '… each with its time'
);
select is(
  pg_temp.counts(pg_temp.game('coop')),
  '[[1, 1, 1, 1, 0, 0], [1, 1, 0, 0, 1, 1]]'::jsonb,
  'coop: each player''s six counts over their own finds'
);
select is(
  pg_temp.six(pg_temp.game_data(pg_temp.game('coop')) -> 'team'),
  '[2, 2, 1, 1, 1, 1]'::jsonb,
  'coop: the team''s six counts over every row'
);
select is(
  pg_temp.summary_data(pg_temp.game('coop')) -> 'team',
  pg_temp.game_data(pg_temp.game('coop')) -> 'team',
  '… the same group in the summary'
);

-- ─── (3) Mid-game compete: ada finds one required word; bea a required and two bonus ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select boggle.submit_word(pg_temp.game('compete'), 'cat', 1, false);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select boggle.submit_word(pg_temp.game('compete'), 'scare', 2, false);
select boggle.submit_word(pg_temp.game('compete'), 'scat', 1, true);
select boggle.submit_word(pg_temp.game('compete'), 'tacos', 2, true);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.counts(pg_temp.game('compete')),
  '[[1, 1, 1, 1, 0, 0], [3, 5, 1, 2, 2, 3]]'::jsonb,
  'compete: each racer''s own six counts'
);
select is(
  (select jsonb_agg(distinct e ->> 'userId') from jsonb_array_elements(pg_temp.game_data(pg_temp.game('compete')) -> 'foundWords') e),
  '["ada11111-1111-1111-1111-111111111111", "bea22222-2222-2222-2222-222222222222"]'::jsonb,
  'compete: the found words carry every racer''s rows — the builder withholds nothing'
);
select is(pg_temp.summary_data(pg_temp.game('compete')) -> 'topScore', 'null'::jsonb, 'compete: no top score while the race runs');

-- ─── (4) The endings ───
-- bea finds one more word and concedes with 6 points banked; ada then reaches
-- the target (1 + 3 + 1 = 5 required points) with 5 points in all.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select boggle.submit_word(pg_temp.game('compete'), 'cart', 1, false);
select boggle.concede(pg_temp.game('compete'));
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select boggle.submit_word(pg_temp.game('compete'), 'traces', 3, false);
select boggle.submit_word(pg_temp.game('compete'), 'arc', 1, false);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (pg_temp.game_data(pg_temp.game('compete')) -> 'ending') - 'detail',
  jsonb_build_object(
    'reason', 'reached_goal',
    'by',     'ada11111-1111-1111-1111-111111111111',
    'winner', 'ada11111-1111-1111-1111-111111111111'),
  'the won race: the word that reached the target ended it, and its finder is the winner'
);
select is(
  (pg_temp.player(pg_temp.game('compete'), 'ada11111-1111-1111-1111-111111111111') ->> 'outcome')
    || '/' || (pg_temp.player(pg_temp.game('compete'), 'bea22222-2222-2222-2222-222222222222') ->> 'outcome'),
  'won/lost',
  'the winner won, the conceder lost'
);
select is(pg_temp.solved(pg_temp.game('compete')), '[true, false]'::jsonb, 'compete: the crosser alone is stamped solved');
select is(
  pg_temp.summary_data(pg_temp.game('compete')) -> 'topScore',
  '5'::jsonb,
  'compete: the top score is the winner''s 5 — the conceder''s banked 6 does not count'
);
select is((pg_temp.shell_data(pg_temp.game('compete')) ->> 'ended')::boolean, true, '… and shell_data says the game has ended');

-- The coop target: the team's required points reach 5 between them.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select boggle.submit_word(pg_temp.game('coop_target'), 'traces', 3, false);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select boggle.submit_word(pg_temp.game('coop_target'), 'scare', 2, false);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select jsonb_agg(p ->> 'outcome' order by p ->> 'id') from jsonb_array_elements(pg_temp.game_data(pg_temp.game('coop_target')) -> 'players') p),
  '["won", "won"]'::jsonb,
  'coop: the team reaching its target wins together'
);
select is(pg_temp.solved(pg_temp.game('coop_target')), '[true, true]'::jsonb, '… and every teammate is stamped solved');

-- The coop game with no target is stopped.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select boggle.stop_game(pg_temp.game('coop'));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (pg_temp.game_data(pg_temp.game('coop')) -> 'ending' ->> 'reason') || '/' || (pg_temp.game_data(pg_temp.game('coop')) ->> 'outcome'),
  'stopped/neutral',
  'coop: a Stop ends the game with no result'
);
select is(
  pg_temp.six(pg_temp.summary_data(pg_temp.game('coop')) -> 'team'),
  '[2, 2, 1, 1, 1, 1]'::jsonb,
  '… and the summary keeps the team''s progress'
);

-- ─── (5) A Restart empties it all again ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select boggle.replay_board(pg_temp.game('compete'));
reset role;
select set_config('request.jwt.claims', '', true);
select is(pg_temp.game_data(pg_temp.game('compete')) -> 'foundWords', '[]'::jsonb, 'after a Restart nothing is found');
select is(
  pg_temp.counts(pg_temp.game('compete')),
  jsonb_build_array(pg_temp.six(pg_temp.zeros()), pg_temp.six(pg_temp.zeros())),
  '… every player fresh'
);
select is(pg_temp.solved(pg_temp.game('compete')), '[false, false]'::jsonb, '… nobody solved');
select is(pg_temp.game_data(pg_temp.game('compete')) -> 'ending', 'null'::jsonb, '… and the ending gone');

-- ─── (6) _rebuild_data_cols_for_all ───
update common.games
   set static_game_data = null, game_data = null, summary_data = null, shell_data = null,
       status_changed_at = '2026-01-01'
 where id in (select id from g);
select is(boggle._rebuild_data_cols_for_all() >= 3, true, '_rebuild_data_cols_for_all rewrites every boggle game');
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
