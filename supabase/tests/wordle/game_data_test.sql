-- cs-unmet

-- ============================================================
-- Test: wordle's page blobs — static_game_data, game_data, summary_data, and shell_data beside them
-- ============================================================
-- `wordle._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move, and `_write_static_game_data` what nothing
-- after create changes (supabase/sql/wordle.sql → The page blobs). This file
-- pins what the page gets:
--
--   1. A fresh coop game's static_game_data and game_data, as a whole: the
--      common parts, the target withheld, no log, and every player fresh with
--      an empty board
--   2. Mid-game coop: the log, each player's own count, and the team's facts
--      sent once in `team` — the summed count and the one board
--   3. Mid-game compete: each racer's own count and own board; the log carries
--      every racer's rows (the hook withholds, not the builder)
--   4. The endings: the target arrives, the winner is named, the summary_data
--      line, and shell_data is rewritten beside them
--   5. `tieBrokenByClock`: for a tie, for two solvers on different counts, and
--      for a conceder on the winner's count
--   6. A Restart empties it all again
--   7. `_rebuild_data_cols_for_all` rewrites every wordle game, its static blob
--      included, without re-dating it
--
-- The target is random, so each game's answer is read back as the superuser
-- and a legal wrong guess picked beside it, as statuses tests did.
-- ============================================================

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(41);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordle pages', array['ada', 'bea', 'cade']) as handle;

create temp table g on commit drop as
select mode, (wordle.create_game(
  (select handle from club),
  pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;

-- Each game's answer, and a legal wrong guess: whichever of two common words
-- isn't it.
reset role;
create temp table w on commit drop as
select g.mode, wg.target::text as target,
       case when wg.target::text = 'crane' then 'slate' else 'crane' end as wrong
  from g join wordle.games wg on wg.game_id = g.id;
grant select on w, g to authenticated;

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
-- The common part of a game's summary_data, as written: wordle's keys sit beside it.
create function pg_temp.common_summary(game uuid) returns jsonb language sql as
  $$ select common._make_json_summary_data(game, (select status_changed_at from common.games where id = game)) $$;
create function pg_temp.shell_data(game uuid) returns jsonb language sql as
  $$ select shell_data from common.games where id = game $$;
create function pg_temp.player(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p
      where p ->> 'id' = uid::text $$;
-- Every player's tieBrokenByClock, in user-id order.
create function pg_temp.ties(game uuid) returns jsonb language sql as
  $$ select jsonb_agg(p -> 'tieBrokenByClock' order by p ->> 'id')
       from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p $$;

-- A player who has not moved, in a free-for-all game with a budget of 5: the
-- common fields, and wordle's on top. `board` is the racer's own in compete,
-- null in coop.
create function pg_temp.fresh_player(uid uuid, name text, board jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'id',               uid,
    'username',         name,
    'color',            (select color from common.profiles where user_id = uid),
    'ai',               false,
    'seat',             null,
    'ending',           null,
    'outcome',          null,
    'finalRanking',     null,
    'solvedAt',         null,
    'conceded',         false,
    'solved',           false,
    'stillPlaying',     true,
    'onTurn',           true,
    'waitingForTurn',   false,
    'maxGuesses',       5,
    'nGuessesUsed',      0,
    'tieBrokenByClock', null,
    'board',            board)
$$;
-- A board nobody has guessed on.
create function pg_temp.fresh_board() returns jsonb language sql as
  $$ select jsonb_build_object('rows', '[]'::jsonb) $$;
-- A coop team that has not moved: the count, the budget and the one board.
create function pg_temp.fresh_team() returns jsonb language sql as
  $$ select jsonb_build_object('nGuessesUsed', 0, 'maxGuesses', 5, 'board', pg_temp.fresh_board()) $$;

-- ─── (1) A fresh coop game, as a whole ───
select is(
  pg_temp.static_game_data(pg_temp.coop()),
  jsonb_build_object(
    'id',       pg_temp.coop(),
    'gametype', 'wordle_coop',
    'brand',    'WordNerd',
    'club',     jsonb_build_object('handle', (select handle from club)),
    'mode',     'coop',
    'coop',     true,
    'compete',  false,
    'setup',    pg_temp.wordle_setup(5)),
  'the whole static_game_data of a fresh coop game: the common part alone'
);
select is(
  pg_temp.game_data(pg_temp.coop()),
  jsonb_build_object(
    'title',    'New game',
    'turns',    null,
    'ending',   null,
    'ended',    false,
    'outcome',  null,
    'puzzle',   jsonb_build_object('target', null),
    'team',     pg_temp.fresh_team(),
    'events',   '[]'::jsonb,
    'players',  jsonb_build_array(
      pg_temp.fresh_player('ada11111-1111-1111-1111-111111111111', 'ada', null),
      pg_temp.fresh_player('bea22222-2222-2222-2222-222222222222', 'bea', null))),
  'the whole game_data of a fresh coop game: the common part, the target withheld, a team with nothing used and an empty board, no log, fresh players carrying no board'
);
select is(
  pg_temp.summary_data(pg_temp.coop()),
  pg_temp.common_summary(pg_temp.coop())
    || '{"team": {"nGuessesUsed": 0}, "maxGuesses": 5, "answerBand": 0, "nWinnerGuesses": null}'::jsonb,
  'the fresh coop game''s summary: the common part, then a team with nothing used, the setup''s answer band, no winner''s count'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete())
    || '{"team": null, "maxGuesses": 5, "answerBand": 0, "nWinnerGuesses": null}'::jsonb,
  'the fresh compete game''s summary has no team, so no progress'
);

-- ─── (2) Mid-game coop: ada guesses wrong ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess(pg_temp.coop(), (select wrong from w where mode = 'coop'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_agg(e - 'id' - 'at' - 'colors') from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e),
  jsonb_build_array(jsonb_build_object(
    'userId',  'ada11111-1111-1111-1111-111111111111',
    'word',    (select wrong from w where mode = 'coop'),
    'correct', false)),
  'the log carries each row''s player, word and verdict'
);
select is(
  (select jsonb_typeof(e -> 'id') || '/' || jsonb_typeof(e -> 'at') || '/' || length(e ->> 'colors')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e limit 1),
  'number/string/5',
  '… each with its row id, its time and its five colors'
);
select is(
  (select jsonb_agg(p -> 'nGuessesUsed' order by p ->> 'id') from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'players') p),
  '[1, 0]'::jsonb,
  'coop: each player''s own count — ada guessed, bea did not'
);
select is(
  (pg_temp.game_data(pg_temp.coop()) -> 'team') - 'board',
  '{"nGuessesUsed": 1, "maxGuesses": 5}'::jsonb,
  'coop: the team''s count, summed over the rows, with the budget, in game_data.team'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'team' -> 'board' -> 'rows',
  jsonb_build_array(jsonb_build_object(
    'word',   (select wrong from w where mode = 'coop'),
    'colors', (select e ->> 'colors' from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e))),
  'coop: the team''s one board shows every player''s guesses'
);
select is(
  (select jsonb_agg(p -> 'board') from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'players') p),
  '[null, null]'::jsonb,
  '… and is sent once: no coop player carries a board'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'puzzle' -> 'target',
  'null'::jsonb,
  'the target is still withheld mid-game'
);
select is(
  pg_temp.summary_data(pg_temp.coop()),
  pg_temp.common_summary(pg_temp.coop())
    || '{"team": {"nGuessesUsed": 1}, "maxGuesses": 5, "answerBand": 0, "nWinnerGuesses": null}'::jsonb,
  'coop: the summary has the team''s used count'
);

-- ─── (3) Mid-game compete: ada guesses wrong ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess(pg_temp.compete(), (select wrong from w where mode = 'compete'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_agg(p -> 'nGuessesUsed' order by p ->> 'id') from jsonb_array_elements(pg_temp.game_data(pg_temp.compete()) -> 'players') p),
  '[1, 0]'::jsonb,
  'compete: each racer''s count is their own'
);
select is(
  jsonb_array_length(pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') -> 'board' -> 'rows'),
  1,
  'compete: a racer''s board shows their own guesses alone'
);
select is(
  pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') -> 'board' -> 'rows',
  '[]'::jsonb,
  '… and the rival''s board is still empty'
);
select is(
  (select jsonb_agg(e ->> 'userId') from jsonb_array_elements(pg_temp.game_data(pg_temp.compete()) -> 'events') e),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
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
    || '{"team": null, "maxGuesses": 5, "answerBand": 0, "nWinnerGuesses": null}'::jsonb,
  'compete: the summary still carries no progress, and no ending yet'
);

-- ─── (4) The endings ───
-- Coop is stopped; in compete ada solves on her second guess and bea concedes.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.stop_game(pg_temp.coop());
select wordle.submit_guess(pg_temp.compete(), (select target from w where mode = 'compete'));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.concede(pg_temp.compete());
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.game_data(pg_temp.coop()) -> 'puzzle' ->> 'target',
  (select target from w where mode = 'coop'),
  'the target arrives once the game has ended'
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
    'reason', 'conceded',
    'detail', 'conceded',
    'by',     'bea22222-2222-2222-2222-222222222222'),
  'the won race: the last racer''s concession ended it'
);
select is(
  (pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') ->> 'solved')::boolean
    and pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') ->> 'outcome' = 'won'
    and (pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') ->> 'nGuessesUsed')::int = 2,
  true,
  'the winner solved and won, on two guesses'
);
select is(
  (pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') ->> 'conceded')::boolean
    and pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') ->> 'outcome' = 'lost',
  true,
  'the conceder conceded and lost'
);
select is(
  pg_temp.ties(pg_temp.compete()),
  '[false, false]'::jsonb,
  'compete: a winner nobody matched, and a conceder, were not placed by the clock'
);
select is(
  pg_temp.ties(pg_temp.coop()),
  '[null, null]'::jsonb,
  'coop: tieBrokenByClock is null, there being no winner to tie'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete())
    || '{"team": null, "maxGuesses": 5, "answerBand": 0, "nWinnerGuesses": 2}'::jsonb,
  'compete: the summary names the winner''s count'
);
select is(
  pg_temp.winner_ids(pg_temp.summary_data(pg_temp.compete())),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  '… the winner being the player its common part ranks first'
);
select is(
  pg_temp.winner_ids(pg_temp.summary_data(pg_temp.coop())),
  '[]'::jsonb,
  'coop: the stopped game''s summary ranks nobody first'
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

-- ─── (5) tieBrokenByClock ───
-- A tie: ada and bea both solve in one guess, bea later; cade in two.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table tie on commit drop as
select (wordle.create_game(
  (select handle from club),
  pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete'
)->'data'->>'id')::uuid as id;
reset role;
create temp table tie_w on commit drop as
select wg.target::text as target,
       case when wg.target::text = 'crane' then 'slate' else 'crane' end as wrong
  from tie join wordle.games wg on wg.game_id = tie.id;
grant select on tie, tie_w to authenticated;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess((select id from tie), (select target from tie_w));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.submit_guess((select id from tie), (select target from tie_w));
reset role;
-- One transaction has one now(), so the later solve is set by hand.
update common.game_players set solved_at = now() + interval '1 minute'
 where game_id = (select id from tie) and user_id = 'bea22222-2222-2222-2222-222222222222';
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select wordle.submit_guess((select id from tie), (select wrong from tie_w));
select wordle.submit_guess((select id from tie), (select target from tie_w));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.ties((select id from tie)),
  '[true, true, false]'::jsonb,
  'compete tie: the winner and the solver on her count were placed by the clock; the solver on more guesses was not'
);

-- No tie: ada solves in one guess and cade in two; bea concedes on ada's
-- count without solving.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table no_tie on commit drop as
select (wordle.create_game(
  (select handle from club),
  pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete'
)->'data'->>'id')::uuid as id;
reset role;
create temp table no_tie_w on commit drop as
select wg.target::text as target,
       case when wg.target::text = 'crane' then 'slate' else 'crane' end as wrong
  from no_tie join wordle.games wg on wg.game_id = no_tie.id;
grant select on no_tie, no_tie_w to authenticated;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess((select id from no_tie), (select target from no_tie_w));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.submit_guess((select id from no_tie), (select wrong from no_tie_w));
select wordle.concede((select id from no_tie));
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select wordle.submit_guess((select id from no_tie), (select wrong from no_tie_w));
select wordle.submit_guess((select id from no_tie), (select target from no_tie_w));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.ties((select id from no_tie)),
  '[false, false, false]'::jsonb,
  'compete, no tie: solvers on different counts, and a conceder on the winner''s count, were not placed by the clock'
);

-- ─── (6) A Restart empties it all again ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.replay_board(pg_temp.compete());
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.game_data(pg_temp.compete()) -> 'players',
  jsonb_build_array(
    pg_temp.fresh_player('ada11111-1111-1111-1111-111111111111', 'ada', pg_temp.fresh_board()),
    pg_temp.fresh_player('bea22222-2222-2222-2222-222222222222', 'bea', pg_temp.fresh_board())),
  'after a Restart every racer is fresh again, empty board and all'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'events',
  '[]'::jsonb,
  '… the log is empty'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'puzzle' -> 'target',
  'null'::jsonb,
  '… and the target is withheld again'
);
select is(
  pg_temp.summary_data(pg_temp.compete()) -> 'nWinnerGuesses',
  'null'::jsonb,
  '… with no winner''s count on the summary'
);
select is(
  (pg_temp.shell_data(pg_temp.compete()) ->> 'restartCount')::int,
  1,
  '… and the restart counted on shell_data'
);

-- ─── (7) _rebuild_data_cols_for_all ───
update common.games
   set static_game_data = null, game_data = null, summary_data = null, shell_data = null,
       status_changed_at = '2026-01-01'
 where id in (select id from g);
select is(wordle._rebuild_data_cols_for_all() >= 2, true, '_rebuild_data_cols_for_all rewrites every wordle game');
select is(
  (select count(*)::int from common.games
    where id in (select id from g)
      and static_game_data is not null and game_data is not null
      and summary_data is not null and shell_data is not null),
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
  pg_temp.game_data(pg_temp.coop()) -> 'puzzle' ->> 'target',
  (select target from w where mode = 'coop'),
  '… the rebuilt stopped game still carries its target'
);

select * from finish();
rollback;
