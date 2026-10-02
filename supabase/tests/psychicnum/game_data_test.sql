-- cs-unmet

-- ============================================================
-- Test: psychicnum's page blobs — game_data, summary_data, and shell_data beside them
-- ============================================================
-- `psychicnum._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move (supabase/sql/psychicnum.sql → The page
-- blobs). This file pins what the page gets:
--
--   1. A fresh coop game's game_data, as a whole: the common part, the puzzle
--      with its secrets withheld, no log, and every player fresh with an
--      empty board
--   2. Mid-game coop: the log, the team's counts on every player, one board
--      on every seat
--   3. Mid-game compete: each racer's own counts and own board; the log
--      carries both players' rows (the hook withholds, not the builder)
--   4. The endings: the secrets arrive, the winner is named, the summary_data
--      line, and shell_data is rewritten beside them
--   5. A Restart empties it all again
--   6. `_rebuild_data_cols_for_all` rewrites every psychicnum game without re-dating it
--
-- The board words and the secrets are pinned with a postgres-role UPDATE
-- after create_game, as gameplay_test.sql does.
-- ============================================================

begin;
set search_path = psychicnum, common, public, extensions;

select plan(33);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Psychic pages', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 5, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;
reset role;
update psychicnum.games
   set words = array['zalpha','zbravo','zcharlie','zdelta','zecho','zfoxtrot','zgolf','zhotel'],
       secrets = array['zalpha','zbravo','zcharlie']
 where game_id in (select id from g);
-- The blobs were written at create, from the sampled board; rewrite them from
-- the pinned one.
select psychicnum._rebuild_data_cols(id, p_update_status_changed_at => false) from g;

-- Shorthands: each game's id and blobs, and one player inside the game_data.
create function pg_temp.coop() returns uuid language sql as
  $$ select id from g where mode = 'coop' $$;
create function pg_temp.compete() returns uuid language sql as
  $$ select id from g where mode = 'compete' $$;
create function pg_temp.game_data(game uuid) returns jsonb language sql as
  $$ select game_data from common.games where id = game $$;
create function pg_temp.summary_data(game uuid) returns jsonb language sql as
  $$ select summary_data from common.games where id = game $$;
-- The common part of a game's summary_data, as written: psychicnum's keys sit beside it.
create function pg_temp.common_summary(game uuid) returns jsonb language sql as
  $$ select common._make_json_summary_data(game, (select status_changed_at from common.games where id = game)) $$;
create function pg_temp.shell_data(game uuid) returns jsonb language sql as
  $$ select shell_data from common.games where id = game $$;
create function pg_temp.player(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p
      where p ->> 'id' = uid::text $$;

-- A player who has not moved, in a free-for-all game with a budget of 5 and
-- three secrets: the common fields, and psychicnum's on top.
create function pg_temp.fresh_player(uid uuid, name text) returns jsonb language sql as $$
  select jsonb_build_object(
    'id',                   uid,
    'username',             name,
    'color',                (select color from common.profiles where user_id = uid),
    'ai',                   false,
    'seat',                 null,
    'ending',               null,
    'outcome',              null,
    'finalRanking',         null,
    'solvedAt',             null,
    'conceded',             false,
    'solved',               false,
    'stillPlaying',         true,
    'onTurn',               true,
    'waitingForTurn',       false,
    'requiredSecretsCount', 3,
    'maxGuesses',           5,
    'foundSecretsCount',    0,
    'guessesUsed',          0,
    'board',                jsonb_build_object('tileResults', '{}'::jsonb, 'decidedBy', '{}'::jsonb))
$$;

-- ─── (1) A fresh coop game, as a whole ───
select is(
  pg_temp.game_data(pg_temp.coop()),
  jsonb_build_object(
    'id',       pg_temp.coop(),
    'gametype', 'psychicnum_coop',
    'brand',    'PsychicNum',
    'club',     jsonb_build_object('handle', (select handle from club)),
    'mode',     'coop',
    'coop',     true,
    'compete',  false,
    'oneBoard', true,
    'title',    (select title from common.games where id = pg_temp.coop()),
    'setup',    '{"max_guesses": 5, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
    'turns',    null,
    'ending',   null,
    'ended',    false,
    'outcome',  null,
    'puzzle',   jsonb_build_object(
      'words',   '["zalpha","zbravo","zcharlie","zdelta","zecho","zfoxtrot","zgolf","zhotel"]'::jsonb,
      'secrets', null),
    'events',   '[]'::jsonb,
    'players',  jsonb_build_array(
      pg_temp.fresh_player('ada11111-1111-1111-1111-111111111111', 'ada'),
      pg_temp.fresh_player('bea22222-2222-2222-2222-222222222222', 'bea'))),
  'the whole game_data of a fresh coop game: the common part, the puzzle with its secrets withheld, no log, fresh players with empty boards'
);
select is(
  pg_temp.summary_data(pg_temp.coop()),
  pg_temp.common_summary(pg_temp.coop())
    || '{"foundSecretsCount": 0, "requiredSecretsCount": 3, "guessesUsed": 0, "maxGuesses": 5}'::jsonb,
  'the fresh coop game''s summary: the common part, then nothing found and nothing used'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete())
    || '{"foundSecretsCount": null, "requiredSecretsCount": 3, "guessesUsed": null, "maxGuesses": 5}'::jsonb,
  'the fresh compete game''s summary carries no progress'
);

-- ─── (2) Mid-game coop: ada hits, bea misses ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess(pg_temp.coop(), 'zalpha');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess(pg_temp.coop(), 'zdelta');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_agg(e - 'id' - 'at') from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e),
  '[{"userId": "ada11111-1111-1111-1111-111111111111", "word": "zalpha", "correct": true, "kind": "guess"},
    {"userId": "bea22222-2222-2222-2222-222222222222", "word": "zdelta", "correct": false, "kind": "guess"}]'::jsonb,
  'the log carries each row''s player, word, verdict and kind, in the order of play'
);
select is(
  (select jsonb_typeof(e -> 'id') || '/' || jsonb_typeof(e -> 'at')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e limit 1),
  'number/string',
  '… each with its row id and its time'
);
select is(
  (select jsonb_agg(jsonb_build_array(p -> 'foundSecretsCount', p -> 'guessesUsed'))
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'players') p),
  '[[1, 2], [1, 2]]'::jsonb,
  'coop: the team''s finds and the team''s used count, on every player'
);
select is(
  pg_temp.player(pg_temp.coop(), 'bea22222-2222-2222-2222-222222222222') -> 'board',
  jsonb_build_object(
    'tileResults', '{"zalpha": true, "zdelta": false}'::jsonb,
    'decidedBy',   jsonb_build_object(
      'zalpha', 'ada11111-1111-1111-1111-111111111111',
      'zdelta', 'bea22222-2222-2222-2222-222222222222')),
  'coop: every seat''s board shows the team''s guesses and who made each'
);
select is(
  pg_temp.player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111') -> 'board',
  pg_temp.player(pg_temp.coop(), 'bea22222-2222-2222-2222-222222222222') -> 'board',
  '… the same board on both seats'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'puzzle' -> 'secrets',
  'null'::jsonb,
  'the secrets are still withheld mid-game'
);
select is(
  pg_temp.summary_data(pg_temp.coop()),
  pg_temp.common_summary(pg_temp.coop())
    || '{"foundSecretsCount": 1, "requiredSecretsCount": 3, "guessesUsed": 2, "maxGuesses": 5}'::jsonb,
  'coop: the summary has the team''s finds and the team''s used count'
);

-- ─── (3) Mid-game compete: ada misses, bea hits ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess(pg_temp.compete(), 'zdelta');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess(pg_temp.compete(), 'zalpha');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') - 'board'
    - 'id' - 'username' - 'color' - 'ai' - 'seat' - 'ending' - 'outcome' - 'finalRanking'
    - 'solvedAt' - 'conceded' - 'solved' - 'stillPlaying' - 'onTurn' - 'waitingForTurn',
  '{"requiredSecretsCount": 3, "maxGuesses": 5, "foundSecretsCount": 0, "guessesUsed": 1}'::jsonb,
  'compete: a racer''s counts are their own'
);
select is(
  pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') -> 'board',
  jsonb_build_object(
    'tileResults', '{"zdelta": false}'::jsonb,
    'decidedBy',   jsonb_build_object('zdelta', 'ada11111-1111-1111-1111-111111111111')),
  'compete: a racer''s board shows their own guesses alone'
);
select is(
  pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') -> 'board' -> 'tileResults',
  '{"zalpha": true}'::jsonb,
  '… and the rival''s shows the rival''s'
);
select is(
  jsonb_array_length(pg_temp.game_data(pg_temp.compete()) -> 'events'),
  2,
  'compete: the log carries both racers'' rows — what a racer may see is the hook''s rule'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete())
    || '{"foundSecretsCount": null, "requiredSecretsCount": 3, "guessesUsed": null, "maxGuesses": 5}'::jsonb,
  'compete: the summary still carries no progress, and no ending yet'
);

-- ─── (4) The endings ───
-- Coop is stopped; in compete ada concedes and bea finds the rest.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.stop_game(pg_temp.coop());
select psychicnum.concede(pg_temp.compete());
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess(pg_temp.compete(), 'zbravo');
select psychicnum.submit_guess(pg_temp.compete(), 'zcharlie');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.game_data(pg_temp.coop()) -> 'puzzle' -> 'secrets',
  '["zalpha", "zbravo", "zcharlie"]'::jsonb,
  'the secrets arrive once the game has ended'
);
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
    'by',     'bea22222-2222-2222-2222-222222222222',
    'winner', 'bea22222-2222-2222-2222-222222222222'),
  'the won race: the finder ended it and is the winner'
);
select is(
  pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') -> 'board' -> 'tileResults',
  '{"zalpha": true, "zbravo": true, "zcharlie": true}'::jsonb,
  'the winner''s board shows all three'
);
select is(
  (pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') ->> 'solved')::boolean
    and pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') ->> 'outcome' = 'won',
  true,
  '… and the winner solved and won'
);
select is(
  (pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') ->> 'conceded')::boolean
    and pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') ->> 'outcome' = 'lost',
  true,
  'the conceder conceded and lost'
);
select is(
  pg_temp.summary_data(pg_temp.compete()) -> 'ending' ->> 'winner',
  'bea22222-2222-2222-2222-222222222222',
  'compete: the summary''s ending names the winner'
);
select is(
  pg_temp.summary_data(pg_temp.coop()) -> 'ending' -> 'winner',
  'null'::jsonb,
  'coop: the summary''s ending names no winner'
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
select psychicnum.replay_board(pg_temp.coop());
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.game_data(pg_temp.coop()) -> 'players',
  jsonb_build_array(
    pg_temp.fresh_player('ada11111-1111-1111-1111-111111111111', 'ada'),
    pg_temp.fresh_player('bea22222-2222-2222-2222-222222222222', 'bea')),
  'after a Restart every player is fresh again, empty board and all'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'events',
  '[]'::jsonb,
  '… the log is empty'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'puzzle' -> 'secrets',
  'null'::jsonb,
  '… and the secrets are withheld again'
);
select is(
  (pg_temp.shell_data(pg_temp.coop()) ->> 'restartCount')::int,
  1,
  '… with the restart counted on shell_data'
);

-- ─── (6) _rebuild_data_cols_for_all ───
update common.games set game_data = null, summary_data = null, shell_data = null, status_changed_at = '2026-01-01'
 where id in (select id from g);
select is(psychicnum._rebuild_data_cols_for_all() >= 2, true, '_rebuild_data_cols_for_all rewrites every psychicnum game');
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
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'ending' ->> 'winner',
  'bea22222-2222-2222-2222-222222222222',
  '… the rebuilt race still names its winner'
);

select * from finish();
rollback;
