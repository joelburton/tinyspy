-- cs-unmet

-- ============================================================
-- Test: wordleone's page blobs — static_game_data, game_data, summary_data, and shell_data beside them
-- ============================================================
-- `wordleone._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move, and `_write_static_game_data` what nothing
-- after create changes (supabase/sql/wordleone.sql → The page blobs). This
-- file pins what the page gets:
--
--   1. A fresh game's blobs, whole: the starter in the static blob, the target
--      withheld, no log, and every board the starter alone
--   2. Mid-game coop: a miss in the log with no colors, each player's own
--      count, the team's facts sent once, and the board still the starter
--   3. Mid-game compete: each racer's own count and board
--   4. The endings: the target arrives, the solve's green row on the board,
--      the winner named on the summary, shell_data rewritten beside them
--   5. `tieBrokenByClock`: a tie, and solvers on different counts
--   6. A Restart empties it all again
--   7. `_rebuild_data_cols_for_all` rewrites every game without re-dating it
-- ============================================================

begin;
set search_path = wordleone, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(25);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordleone pages', array['ada', 'bea', 'cade']) as handle;

create temp table g on commit drop as
select mode, (wordleone.create_game(
  (select handle from club),
  pg_temp.wordleone_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode, pg_temp.wordleone_puzzle()
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;

reset role;
grant select on g to authenticated;

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
create function pg_temp.common_summary(game uuid) returns jsonb language sql as
  $$ select common._make_json_summary_data(game, (select status_changed_at from common.games where id = game)) $$;
create function pg_temp.shell_data(game uuid) returns jsonb language sql as
  $$ select shell_data from common.games where id = game $$;
create function pg_temp.player(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p
      where p ->> 'id' = uid::text $$;
create function pg_temp.ties(game uuid) returns jsonb language sql as
  $$ select jsonb_agg(p -> 'tieBrokenByClock' order by p ->> 'id')
       from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p $$;

-- The board before any solve: the starter alone.
create function pg_temp.starter_board() returns jsonb language sql as
  $$ select '{"rows": [{"word": "sieve", "colors": "yxyyg"}]}'::jsonb $$;
-- … and after: the starter, then the answer all green.
create function pg_temp.solved_board() returns jsonb language sql as
  $$ select '{"rows": [{"word": "sieve", "colors": "yxyyg"}, {"word": "verse", "colors": "ggggg"}]}'::jsonb $$;
-- A player who has not moved, in a free-for-all game. `board` is the racer's
-- own in compete, null in coop.
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
    'nMisses',          0,
    'tieBrokenByClock', null,
    'board',            board)
$$;

-- ─── (1) A fresh game, whole ───
select is(
  pg_temp.static_game_data(pg_temp.coop()),
  jsonb_build_object(
    'id',       pg_temp.coop(),
    'gametype', 'wordleone_coop',
    'brand',    'WordNerdier',
    'club',     jsonb_build_object('handle', (select handle from club)),
    'mode',     'coop',
    'coop',     true,
    'compete',  false,
    'setup',    pg_temp.wordleone_setup(),
    'puzzle',   '{"starter": "sieve", "colors": "yxyyg"}'::jsonb),
  'the whole static_game_data of a fresh coop game: the common part, and the starter with its colors'
);
select is(
  pg_temp.game_data(pg_temp.coop()),
  jsonb_build_object(
    'title',    'New game',
    'turns',    null,
    'ending',   null,
    'ended',    false,
    'outcome',  null,
    'puzzle',   jsonb_build_object('target', null, 'targetBand', null),
    'team',     jsonb_build_object('nMisses', 0, 'board', pg_temp.starter_board()),
    'events',   '[]'::jsonb,
    'players',  jsonb_build_array(
      pg_temp.fresh_player('ada11111-1111-1111-1111-111111111111', 'ada', null),
      pg_temp.fresh_player('bea22222-2222-2222-2222-222222222222', 'bea', null))),
  'the whole game_data of a fresh coop game: the target withheld, a team with no misses and the starter on its board, no log, players carrying no board'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'players',
  jsonb_build_array(
    pg_temp.fresh_player('ada11111-1111-1111-1111-111111111111', 'ada', pg_temp.starter_board()),
    pg_temp.fresh_player('bea22222-2222-2222-2222-222222222222', 'bea', pg_temp.starter_board())),
  'a fresh compete game: every racer carries their own board, the starter alone'
);
select is(
  pg_temp.summary_data(pg_temp.coop()),
  pg_temp.common_summary(pg_temp.coop())
    || '{"team": {"nMisses": 0}, "legalBand": 2, "difficulty": "medium", "nWinnerMisses": null, "nMissesById": null}'::jsonb,
  'the fresh coop summary: the common part, a team with no misses, the band and the difficulty'
);

-- ─── (2) Mid-game coop: ada misses ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordleone.submit_guess(pg_temp.coop(), 'crane');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_agg(e - 'id' - 'at') from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e),
  '[{"userId": "ada11111-1111-1111-1111-111111111111", "word": "crane", "colors": null, "verdict": "miss", "correct": false}]'::jsonb,
  'the log carries the miss, with its verdict and no colors'
);
select is(
  (select jsonb_agg(p -> 'nMisses' order by p ->> 'id') from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'players') p),
  '[1, 0]'::jsonb,
  'coop: each player''s own count'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'team',
  jsonb_build_object('nMisses', 1, 'board', pg_temp.starter_board()),
  'coop: the team''s count, summed; its board is still the starter — a miss is the log''s, not a row'
);
select is(
  pg_temp.summary_data(pg_temp.coop()) -> 'team',
  '{"nMisses": 1}'::jsonb,
  'coop: the summary has the team''s count'
);

-- ─── (3) Mid-game compete: ada misses ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordleone.submit_guess(pg_temp.compete(), 'crane');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_agg(p -> 'nMisses' order by p ->> 'id') from jsonb_array_elements(pg_temp.game_data(pg_temp.compete()) -> 'players') p),
  '[1, 0]'::jsonb,
  'compete: each racer''s count is their own'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'team',
  'null'::jsonb,
  'compete: no team'
);
select is(
  pg_temp.summary_data(pg_temp.compete()) - 'statusChangedAt',
  (pg_temp.common_summary(pg_temp.compete()) - 'statusChangedAt')
    || '{"team": null, "legalBand": 2, "difficulty": "medium", "nWinnerMisses": null}'::jsonb
    || jsonb_build_object('nMissesById', jsonb_build_object(
         'ada11111-1111-1111-1111-111111111111', 1, 'bea22222-2222-2222-2222-222222222222', 0)),
  'compete: the summary has no team, each racer''s misses, and no winner yet'
);

-- ─── (4) The endings ───
-- Coop: bea solves. Compete: ada solves, bea concedes.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordleone.submit_guess(pg_temp.coop(), 'verse');
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordleone.submit_guess(pg_temp.compete(), 'verse');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordleone.concede(pg_temp.compete());
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.game_data(pg_temp.coop()) -> 'puzzle',
  jsonb_build_object('target', 'verse',
                     'targetBand', (select band from common.words where word = 'verse')),
  'the target and its band in the word list arrive once the game has ended'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'team',
  jsonb_build_object('nMisses', 1, 'board', pg_temp.solved_board()),
  'coop: the solve puts the answer, all green, on the board''s second row'
);
select is(
  pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') -> 'board',
  pg_temp.solved_board(),
  'compete: the solver''s own board gains the green row'
);
select is(
  pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') -> 'board',
  pg_temp.starter_board(),
  '… and the conceder''s does not'
);
select is(
  (pg_temp.summary_data(pg_temp.compete()) ->> 'nWinnerMisses')::int,
  1,
  'compete: the summary names the winner''s misses'
);
select is(
  pg_temp.winner_ids(pg_temp.summary_data(pg_temp.compete())),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  '… the winner being the player its common part ranks first'
);
select is(
  (pg_temp.shell_data(pg_temp.coop()) ->> 'ended')::boolean,
  true,
  'the builder rewrites shell_data beside the game_data'
);

-- ─── (5) tieBrokenByClock ───
-- A tie: ada and bea both solve with no misses, bea later; cade with one.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table tie on commit drop as
select (wordleone.create_game(
  (select handle from club), pg_temp.wordleone_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete', pg_temp.wordleone_puzzle()
)->'data'->>'id')::uuid as id;
select wordleone.submit_guess((select id from tie), 'verse');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordleone.submit_guess((select id from tie), 'verse');
reset role;
-- One transaction has one now(), so the later solve is set by hand.
update common.game_players set solved_at = now() + interval '1 minute'
 where game_id = (select id from tie) and user_id = 'bea22222-2222-2222-2222-222222222222';
grant select on tie to authenticated;
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select wordleone.submit_guess((select id from tie), 'crane');
select wordleone.submit_guess((select id from tie), 'verse');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  pg_temp.ties((select id from tie)),
  '[true, true, false]'::jsonb,
  'compete tie: the winner and the solver on her count were placed by the clock; the solver with more misses was not'
);
select is(
  pg_temp.ties(pg_temp.compete()),
  '[false, false]'::jsonb,
  'compete, no tie: a winner nobody matched, and a conceder, were not placed by the clock'
);
select is(
  pg_temp.ties(pg_temp.coop()),
  '[null, null]'::jsonb,
  'coop: tieBrokenByClock is null'
);

-- ─── (6) A Restart empties it all again ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordleone.replay_board(pg_temp.compete());
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'players',
  jsonb_build_array(
    pg_temp.fresh_player('ada11111-1111-1111-1111-111111111111', 'ada', pg_temp.starter_board()),
    pg_temp.fresh_player('bea22222-2222-2222-2222-222222222222', 'bea', pg_temp.starter_board())),
  'after a Restart every racer is fresh again, the starter alone on their board'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'events',
  '[]'::jsonb,
  '… and the log is empty'
);

-- ─── (7) _rebuild_data_cols_for_all ───
update common.games
   set static_game_data = null, game_data = null, summary_data = null, shell_data = null,
       status_changed_at = '2026-01-01'
 where id in (select id from g);
select is(wordleone._rebuild_data_cols_for_all() >= 2, true, '_rebuild_data_cols_for_all rewrites every wordleone game');
select is(
  (select count(*)::int from common.games
    where id in (select id from g)
      and static_game_data ? 'puzzle' and game_data is not null
      and summary_data is not null and shell_data is not null
      and status_changed_at = '2026-01-01'),
  2,
  '… every blob is back, the static puzzle included, and no game is re-dated'
);

select * from finish();
rollback;
