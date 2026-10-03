-- cs-unmet

-- ============================================================
-- Test: wordwheel's page blobs — game_data, summary_data, and shell_data beside them
-- ============================================================
-- `wordwheel._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move (supabase/sql/wordwheel.sql → The page blobs).
-- This file pins what the page gets:
--
--   1. A fresh game: the puzzle as create_game froze it, its tiles the center
--      first, no team progress, no log, every player fresh; compete's target
--      and no team
--   2. Mid-game coop: the log in the order found, each player's own finds,
--      the team's summed with its rank
--   3. Mid-game compete: each racer's own finds and rank; the log carries
--      every racer's rows (the hook withholds, not the builder)
--   4. The endings: the race's winner, won; the stopped coop game's summary;
--      shell_data rewritten beside them
--   5. A Restart empties it all again
--   6. `_rebuild_data_cols_for_all` rewrites every wordwheel game without
--      re-dating it
--
-- The fixture board (setup.psql) has the outer letters abcdfghi around the
-- center e; the required set's count and score are read off the row.
-- `submit_word` trusts the points it is sent, as it trusts the frontend's.
-- ============================================================

begin;
set search_path = wordwheel, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(31);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('wordwheel pages', array['ada', 'bea']) as handle;

-- A coop game with no target, and a race to rank 1.
create temp table g on commit drop as
select mode, (wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup() || case when mode = 'compete' then '{"target_rank": 1}'::jsonb else '{}'::jsonb end,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode,
  pg_temp.wordwheel_board()
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
create function pg_temp.summary_data(game uuid) returns jsonb language sql as
  $$ select summary_data from common.games where id = game $$;
create function pg_temp.shell_data(game uuid) returns jsonb language sql as
  $$ select shell_data from common.games where id = game $$;
create function pg_temp.player(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p
      where p ->> 'id' = uid::text $$;
-- Each player's three counts, in id order.
create function pg_temp.counts(game uuid) returns jsonb language sql as
  $$ select jsonb_agg(jsonb_build_array(p -> 'nFoundWords', p -> 'foundWordsScore', p -> 'rankIdx') order by p ->> 'id')
       from jsonb_array_elements(pg_temp.game_data(game) -> 'players') p $$;
-- The required set's score, off the row.
create function pg_temp.total(game uuid) returns int language sql as
  $$ select required_words_score from wordwheel.games where game_id = game $$;

-- The board's tiles as the page draws them: the center first, then each
-- outer letter at its place.
create function pg_temp.expected_tiles() returns jsonb language sql as
  $$ select jsonb_build_array(jsonb_build_object('id', '0', 'letter', 'e', 'isCenter', true))
         || (select jsonb_agg(jsonb_build_object('id', ord::text, 'letter', l, 'isCenter', false) order by ord)
               from unnest(string_to_array('abcdfghi', null)) with ordinality as x(l, ord)) $$;
-- A stored word list, camel.
create function pg_temp.words(list jsonb) returns jsonb language sql as
  $$ select jsonb_agg(jsonb_build_object(
              'word', w ->> 'word', 'points', (w ->> 'points')::int, 'isPangram', (w ->> 'is_pangram')::boolean)
            order by ord)
       from jsonb_array_elements(list) with ordinality as x(w, ord) $$;
-- The puzzle as create_game froze it onto the row, with this target.
create function pg_temp.expected_puzzle(game uuid, target int) returns jsonb language sql as
  $$ select jsonb_build_object(
       'tiles',          pg_temp.expected_tiles(),
       'centerLetter',   'e',
       'outerLetters',   'abcdfghi',
       'reqdWords',      pg_temp.words(required_words),
       'bonusWords',     pg_temp.words(bonus_words),
       'nReqdWords',     required_words_count,
       'reqdWordsScore', required_words_score,
       'targetRankIdx',  target,
       'hasBonus',       true)
       from wordwheel.games where game_id = game $$;

-- ─── (1) A fresh game ───
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'puzzle',
  pg_temp.expected_puzzle(pg_temp.coop(), null),
  'coop: the puzzle as create_game froze it — the tiles center first, the two word lists, the totals, no target'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'team',
  '{"nFoundWords": 0, "foundWordsScore": 0, "rankIdx": 0}'::jsonb,
  'coop: the team has found nothing'
);
select is(pg_temp.game_data(pg_temp.coop()) -> 'events', '[]'::jsonb, 'coop: no log yet');
select is(pg_temp.counts(pg_temp.coop()), '[[0, 0, 0], [0, 0, 0]]'::jsonb, 'coop: every player fresh');
select is(pg_temp.game_data(pg_temp.coop()) ->> 'gametype', 'wordwheel_coop', 'the common part is underneath');
select is(
  pg_temp.summary_data(pg_temp.coop()) - (select array_agg(k) from jsonb_object_keys(common._make_json_summary_data(pg_temp.coop(), now())) k),
  jsonb_build_object(
    'team',           '{"nFoundWords": 0, "foundWordsScore": 0, "rankIdx": 0}'::jsonb,
    'nReqdWords',     (select required_words_count from wordwheel.games where game_id = pg_temp.coop()),
    'reqdWordsScore', pg_temp.total(pg_temp.coop()),
    'targetRankIdx',  null),
  'coop: summary_data carries the team, the totals and no target beside the common part'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'puzzle' -> 'targetRankIdx',
  '1'::jsonb,
  'compete: the puzzle carries the rank that wins'
);
select is(pg_temp.game_data(pg_temp.compete()) -> 'team', 'null'::jsonb, 'compete: no team');
select is(pg_temp.summary_data(pg_temp.compete()) -> 'team', 'null'::jsonb, '… and none in its summary');

-- ─── (2) Mid-game coop: ada finds a one-pointer, bea a five ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordwheel.submit_word(pg_temp.coop(), 'bead', 1, false, false);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordwheel.submit_word(pg_temp.coop(), 'faced', 5, false, false);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_agg(e - 'at') from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e),
  jsonb_build_array(
    jsonb_build_object('userId', 'ada11111-1111-1111-1111-111111111111', 'word', 'bead',
                       'points', 1, 'isPangram', false, 'isBonus', false),
    jsonb_build_object('userId', 'bea22222-2222-2222-2222-222222222222', 'word', 'faced',
                       'points', 5, 'isPangram', false, 'isBonus', false)),
  'the log carries each find''s player, word, points and flags, in the order found'
);
select is(
  (select jsonb_typeof(e -> 'at') from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e limit 1),
  'string',
  '… each with its time'
);
select is(
  pg_temp.counts(pg_temp.coop()),
  jsonb_build_array(
    jsonb_build_array(1, 1, common._rank_idx(1, pg_temp.total(pg_temp.coop()))),
    jsonb_build_array(1, 5, common._rank_idx(5, pg_temp.total(pg_temp.coop())))),
  'coop: each player''s own finds, points and rank'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'team',
  jsonb_build_object('nFoundWords', 2, 'foundWordsScore', 6,
                     'rankIdx', common._rank_idx(6, pg_temp.total(pg_temp.coop()))),
  'coop: the team''s finds summed, with the rank that score reaches'
);
select is(
  pg_temp.summary_data(pg_temp.coop()) -> 'team',
  pg_temp.game_data(pg_temp.coop()) -> 'team',
  '… the same group in the summary'
);

-- ─── (3) Mid-game compete: each racer finds one ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordwheel.submit_word(pg_temp.compete(), 'bead', 1, false, false);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordwheel.submit_word(pg_temp.compete(), 'face', 1, false, false);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.counts(pg_temp.compete()),
  jsonb_build_array(
    jsonb_build_array(1, 1, common._rank_idx(1, pg_temp.total(pg_temp.compete()))),
    jsonb_build_array(1, 1, common._rank_idx(1, pg_temp.total(pg_temp.compete())))),
  'compete: each racer''s own finds'
);
select is(
  (select jsonb_agg(e ->> 'userId' order by e ->> 'userId') from jsonb_array_elements(pg_temp.game_data(pg_temp.compete()) -> 'events') e),
  '["ada11111-1111-1111-1111-111111111111", "bea22222-2222-2222-2222-222222222222"]'::jsonb,
  'compete: the log carries every racer''s rows — the builder withholds nothing'
);
select is(pg_temp.game_data(pg_temp.compete()) -> 'ending', 'null'::jsonb, 'compete: still racing');

-- ─── (4) The endings ───
-- ada finds words until one crosses rank 1; the first that does ends the race.
do $$
declare w text;
begin
  perform pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
  foreach w in array array['faced', 'cage', 'fade', 'deaf', 'aged', 'babe', 'feed'] loop
    exit when (select ended_at from common.games where id = pg_temp.compete()) is not null;
    perform wordwheel.submit_word(pg_temp.compete(), w, case when w = 'faced' then 5 else 1 end, false, false);
  end loop;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (pg_temp.game_data(pg_temp.compete()) -> 'ending') - 'detail',
  jsonb_build_object(
    'reason', 'reached_goal',
    'by',     'ada11111-1111-1111-1111-111111111111',
    'winner', 'ada11111-1111-1111-1111-111111111111'),
  'the won race: the word that reached the target ended it, and its finder is the winner'
);
select is(
  (pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') ->> 'outcome')
    || '/' || (pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') ->> 'outcome'),
  'won/lost',
  'the winner won, the beaten racer lost'
);
select is(
  (pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') ->> 'rankIdx')::int >= 1,
  true,
  '… and the winner''s rank is at least the target'
);
select is(
  pg_temp.summary_data(pg_temp.compete()) -> 'ending' ->> 'winner',
  'ada11111-1111-1111-1111-111111111111',
  'compete: the summary''s ending names the winner'
);
select is((pg_temp.shell_data(pg_temp.compete()) ->> 'ended')::boolean, true, '… and shell_data says the game has ended');

-- The coop game is stopped.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordwheel.stop_game(pg_temp.coop());
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (pg_temp.game_data(pg_temp.coop()) -> 'ending' ->> 'reason') || '/' || (pg_temp.game_data(pg_temp.coop()) ->> 'outcome'),
  'stopped/neutral',
  'coop: a Stop ends the game with no result'
);
select is(pg_temp.summary_data(pg_temp.coop()) -> 'ending' -> 'winner', 'null'::jsonb, 'coop: the stopped game''s summary names no winner');
select is(
  pg_temp.summary_data(pg_temp.coop()) -> 'team',
  jsonb_build_object('nFoundWords', 2, 'foundWordsScore', 6,
                     'rankIdx', common._rank_idx(6, pg_temp.total(pg_temp.coop()))),
  '… and keeps the team''s progress'
);

-- ─── (5) A Restart empties it all again ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordwheel.replay_board(pg_temp.compete());
reset role;
select set_config('request.jwt.claims', '', true);
select is(pg_temp.game_data(pg_temp.compete()) -> 'events', '[]'::jsonb, 'after a Restart the log is empty');
select is(pg_temp.counts(pg_temp.compete()), '[[0, 0, 0], [0, 0, 0]]'::jsonb, '… every player fresh');
select is(pg_temp.game_data(pg_temp.compete()) -> 'ending', 'null'::jsonb, '… and the ending gone');

-- ─── (6) _rebuild_data_cols_for_all ───
update common.games set game_data = null, summary_data = null, shell_data = null, status_changed_at = '2026-01-01'
 where id in (select id from g);
select is(wordwheel._rebuild_data_cols_for_all() >= 2, true, '_rebuild_data_cols_for_all rewrites every wordwheel game');
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
