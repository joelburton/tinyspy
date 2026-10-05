-- cs-unmet

-- ============================================================
-- Test: wordiply's page blobs — game_data, summary_data, and shell_data beside them
-- ============================================================
-- `wordiply._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move (supabase/sql/wordiply.sql → The page
-- blobs). This file pins what the page gets:
--
--   1. A fresh coop game's game_data, as a whole: the common part, the puzzle
--      as built, a team with nothing used, no log, and every player fresh
--      with an empty board; both fresh summaries
--   2. Mid-game coop: the log carries a reject beside the accepted word, each
--      player's own count, the team's, one board on every seat, and no score
--      before the end
--   3. Mid-game compete: each racer's own count and own board; the log
--      carries every racer's rows (the hook withholds, not the builder)
--   4. The endings: the scores arrive, the team's and each player's own; the
--      winner's length score on the summary; shell_data rewritten beside them
--   5. A Restart empties it all again
--   6. `_rebuild_data_cols_for_all` rewrites every wordiply game without
--      re-dating it
--
-- The board is setup.psql's: base 'ar', max_word_len 7.
-- ============================================================

begin;
set search_path = wordiply, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(29);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordiply pages', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode,
  pg_temp.wordiply_board()
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
create function pg_temp.summary_data(game uuid) returns jsonb language sql as
  $$ select summary_data from common.games where id = game $$;
-- The common part of a game's summary_data, as written: wordiply's keys sit beside it.
create function pg_temp.common_summary(game uuid) returns jsonb language sql as
  $$ select common._make_json_summary_data(game, (select status_changed_at from common.games where id = game)) $$;
create function pg_temp.shell_data(game uuid) returns jsonb language sql as
  $$ select shell_data from common.games where id = game $$;
create function pg_temp.player(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p
      where p ->> 'id' = uid::text $$;
-- One track's four numbers, as "used/score/letters/longest", null as '-'.
create function pg_temp.track(t jsonb) returns text language sql as
  $$ select concat_ws('/', t ->> 'nGuessesUsed', coalesce(t ->> 'lengthScore', '-'),
                      coalesce(t ->> 'nLetters', '-'), coalesce(t ->> 'longestWordLen', '-')) $$;

-- A player who has not moved, in a free-for-all game: the common fields, and
-- wordiply's on top.
create function pg_temp.fresh_player(uid uuid, name text) returns jsonb language sql as $$
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
    'maxGuesses',     5,
    'nGuessesUsed',   0,
    'lengthScore',    null,
    'nLetters',       null,
    'longestWordLen', null,
    'board',          jsonb_build_object('words', '[]'::jsonb))
$$;

-- ─── (1) A fresh coop game, as a whole ───
select is(
  pg_temp.game_data(pg_temp.coop()),
  jsonb_build_object(
    'id',       pg_temp.coop(),
    'gametype', 'wordiply_coop',
    'brand',    'WordWire',
    'club',     jsonb_build_object('handle', (select handle from club)),
    'mode',     'coop',
    'coop',     true,
    'compete',  false,
    'oneBoard', true,
    'title',    'AR',
    'setup',    pg_temp.wordiply_setup(),
    'turns',    null,
    'ending',   null,
    'ended',    false,
    'outcome',  null,
    'puzzle',   jsonb_build_object(
                  'base',         'ar',
                  'maxWordLen',   7,
                  'longestWords', pg_temp.wordiply_board() -> 'longest_words',
                  'legalWords',   pg_temp.wordiply_board() -> 'legal_words'),
    'team',     '{"nGuessesUsed": 0, "lengthScore": null, "nLetters": null, "longestWordLen": null}'::jsonb,
    'events',   '[]'::jsonb,
    'players',  jsonb_build_array(
      pg_temp.fresh_player('ada11111-1111-1111-1111-111111111111', 'ada'),
      pg_temp.fresh_player('bea22222-2222-2222-2222-222222222222', 'bea'))),
  'the whole game_data of a fresh coop game: the common part, the puzzle as built, a team with nothing used, no log, fresh players with empty boards'
);
select is(
  pg_temp.summary_data(pg_temp.coop()),
  pg_temp.common_summary(pg_temp.coop())
    || '{"team": {"nGuessesUsed": 0, "lengthScore": null, "nLetters": null}, "maxGuesses": 5, "winnerLengthScore": null}'::jsonb,
  'the fresh coop game''s summary: the common part, then a team with nothing used, the budget, no winner''s score'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete())
    || '{"team": null, "maxGuesses": 5, "winnerLengthScore": null}'::jsonb,
  'the fresh compete game''s summary has no team, so no progress'
);

-- ─── (2) Mid-game coop: ada lands 'bar'; bea tries a word the list lacks ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordiply.submit_guess(pg_temp.coop(), 'bar');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess(pg_temp.coop(), 'carz', false);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_agg(e - 'id' - 'at' order by e -> 'id') from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e),
  jsonb_build_array(
    jsonb_build_object('userId', 'ada11111-1111-1111-1111-111111111111', 'word', 'bar',
                       'valid', true, 'reason', null, 'tookTurn', true),
    jsonb_build_object('userId', 'bea22222-2222-2222-2222-222222222222', 'word', 'carz',
                       'valid', false, 'reason', 'not_a_word', 'tookTurn', false)),
  'the log carries every submission, the reject beside the accepted word, each with its player, verdict and turn cost'
);
select is(
  (select jsonb_typeof(e -> 'id') || '/' || jsonb_typeof(e -> 'at')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e limit 1),
  'number/string',
  '… each with its row id and its time'
);
select is(
  (select jsonb_agg(pg_temp.track(p) order by p ->> 'id') from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'players') p),
  '["1/-/-/-", "0/-/-/-"]'::jsonb,
  'coop: each player''s own count — ada landed a word, bea''s reject spent nothing — and no score before the end'
);
select is(
  pg_temp.track(pg_temp.game_data(pg_temp.coop()) -> 'team'),
  '1/-/-/-',
  'coop: the team''s count in game_data.team, no score before the end'
);
select is(
  pg_temp.player(pg_temp.coop(), 'bea22222-2222-2222-2222-222222222222') -> 'board',
  '{"words": ["bar"]}'::jsonb,
  'coop: every seat''s board shows the team''s accepted words, and no reject'
);
select is(
  pg_temp.player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111') -> 'board',
  pg_temp.player(pg_temp.coop(), 'bea22222-2222-2222-2222-222222222222') -> 'board',
  '… the same board on both seats'
);
select is(
  pg_temp.summary_data(pg_temp.coop()) -> 'team',
  '{"nGuessesUsed": 1, "lengthScore": null, "nLetters": null}'::jsonb,
  'coop: the summary has the team''s used count'
);

-- ─── (3) Mid-game compete: ada lands 'cars' ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordiply.submit_guess(pg_temp.compete(), 'cars');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_agg(p -> 'nGuessesUsed' order by p ->> 'id') from jsonb_array_elements(pg_temp.game_data(pg_temp.compete()) -> 'players') p),
  '[1, 0]'::jsonb,
  'compete: each racer''s count is their own'
);
select is(
  pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111') -> 'board',
  '{"words": ["cars"]}'::jsonb,
  'compete: a racer''s board shows their own words'
);
select is(
  pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222') -> 'board',
  '{"words": []}'::jsonb,
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

-- ─── (4) The endings ───
-- Coop: ada spends the team's other four (bar 3 + hangars 7 + stars 5 + scar
-- 4 + arts 4 = 23 letters, longest 7 of 7). Compete: bea spends her five the
-- same way, then ada concedes, ending the race with bea ranked first.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordiply.submit_guess(pg_temp.coop(), w) from unnest(array['hangars', 'stars', 'scar', 'arts']) w;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess(pg_temp.compete(), w) from unnest(array['bar', 'hangars', 'stars', 'scar', 'arts']) w;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordiply.concede(pg_temp.compete());
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.track(pg_temp.game_data(pg_temp.coop()) -> 'team'),
  '5/100/23/7',
  'coop ended: the team''s scores arrive — five words, 100%, 23 letters, longest 7'
);
select is(
  (select jsonb_agg(pg_temp.track(p) order by p ->> 'id') from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'players') p),
  '["5/100/23/7", "0/0/0/0"]'::jsonb,
  'coop ended: each player''s own scores — ada landed every word, bea none'
);
select is(
  pg_temp.game_data(pg_temp.coop()) ->> 'outcome',
  'won',
  'coop ended: the five words spent is a win'
);
select is(
  pg_temp.summary_data(pg_temp.coop()) -> 'team',
  '{"nGuessesUsed": 5, "lengthScore": 100, "nLetters": 23}'::jsonb,
  'coop ended: the summary''s team carries the scores'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'ending',
  jsonb_build_object(
    'reason', 'conceded',
    'detail', 'conceded',
    'by',     'ada11111-1111-1111-1111-111111111111',
    'winner', 'bea22222-2222-2222-2222-222222222222'),
  'compete ended: the last racer''s concession ended it, and the one who scored is the winner'
);
select is(
  (select jsonb_agg(pg_temp.track(p) order by p ->> 'id') from jsonb_array_elements(pg_temp.game_data(pg_temp.compete()) -> 'players') p),
  '["1/57/4/4", "5/100/23/7"]'::jsonb,
  'compete ended: each racer''s own scores arrive, the conceder''s too'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete())
    || '{"team": null, "maxGuesses": 5, "winnerLengthScore": 100}'::jsonb,
  'compete ended: the summary names the winner''s length score'
);
select is(
  (pg_temp.shell_data(pg_temp.coop()) ->> 'ended')::boolean,
  true,
  'the builder rewrites shell_data beside the game_data: the ended game''s shell_data says ended'
);

-- ─── (5) A Restart empties it all again ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordiply.replay_board(pg_temp.coop());
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
  '… the log is empty, rejects and all'
);
select is(
  pg_temp.track(pg_temp.game_data(pg_temp.coop()) -> 'team'),
  '0/-/-/-',
  '… and the team has nothing used and no score'
);

-- ─── (6) _rebuild_data_cols_for_all ───
update common.games set game_data = null, summary_data = null, shell_data = null, status_changed_at = '2026-01-01'
 where id in (select id from g);
select is(wordiply._rebuild_data_cols_for_all() >= 2, true, '_rebuild_data_cols_for_all rewrites every wordiply game');
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
