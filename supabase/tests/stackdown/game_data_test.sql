-- cs-unmet

-- ============================================================
-- Test: stackdown's page blobs — game_data, summary_data, and shell_data beside them
-- ============================================================
-- `stackdown._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move (supabase/sql/stackdown.sql → The page
-- blobs). This file pins what the page gets:
--
--   1. A fresh game: the stack as 30 tiles by tile number, the six words to
--      clear, no solution; coop's team at nothing and no team in compete; each
--      player fresh, with the whole stack as their board; both fresh summaries
--   2. Mid-game coop: a word, a refused word, a hint and a spoiler in the log —
--      the hint's text under `clue`, a word's tiles as ids in pick order; the
--      shared stack on every seat; each player's own counts and the team's sum
--   3. Mid-game compete: each racer's own counts and own stack; the log
--      carries every racer's rows (the hook withholds, not the builder)
--   4. The endings: the solution arrives, a coop clear stamps every teammate,
--      a race's winner, shell_data rewritten
--   5. A Restart empties it all again
--   6. `_rebuild_data_cols_for_all` rewrites every stackdown game without
--      re-dating it
--
-- The board is setup.psql's: EAGLE, TABLE, PLANS, APPLE, JUICE, LEMON, cleared
-- in that order by `pg_temp.sd_seq(1..6)`.
-- ============================================================

begin;
set search_path = stackdown, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(24);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('StackDown pages', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (stackdown.create_game(
  (select handle from club),
  '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;

reset role;
grant select on g to authenticated;

-- Shorthands: each game's id and blobs, one player inside the game_data, and
-- the ids of a seat's stack.
create function pg_temp.coop() returns uuid language sql as
  $$ select id from g where mode = 'coop' $$;
create function pg_temp.compete() returns uuid language sql as
  $$ select id from g where mode = 'compete' $$;
create function pg_temp.game_data(game uuid) returns jsonb language sql as
  $$ select game_data from common.games where id = game $$;
create function pg_temp.summary_data(game uuid) returns jsonb language sql as
  $$ select summary_data from common.games where id = game $$;
-- The common part of a game's summary_data, as written: stackdown's keys sit beside it.
create function pg_temp.common_summary(game uuid) returns jsonb language sql as
  $$ select common._make_json_summary_data(game, (select status_changed_at from common.games where id = game)) $$;
create function pg_temp.shell_data(game uuid) returns jsonb language sql as
  $$ select shell_data from common.games where id = game $$;
create function pg_temp.player(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p
      where p ->> 'id' = uid::text $$;
-- A player's stackdown keys alone: the common player taken off, and the board
-- as its tile count.
create function pg_temp.own_keys(player jsonb) returns jsonb language sql as
  $$ select (player - 'id' - 'username' - 'color' - 'ai' - 'seat' - 'ending' - 'outcome'
                    - 'finalRanking' - 'solvedAt' - 'conceded' - 'solved' - 'stillPlaying'
                    - 'onTurn' - 'waitingForTurn' - 'board')
            || jsonb_build_object('nBoardTiles', jsonb_array_length(player -> 'board' -> 'tiles')) $$;
-- Whether a seat's stack still holds a tile.
create function pg_temp.on_board(player jsonb, tile text) returns boolean language sql as
  $$ select exists (select 1 from jsonb_array_elements(player -> 'board' -> 'tiles') t
                     where t ->> 'id' = tile) $$;

-- ─── (1) A fresh game ───
select is(
  (select jsonb_build_object(
     'nTiles',   jsonb_array_length(gd -> 'puzzle' -> 'tiles'),
     'first',    gd -> 'puzzle' -> 'tiles' -> 0,
     'last',     gd -> 'puzzle' -> 'tiles' -> 29,
     'nReqd',    gd -> 'puzzle' -> 'nReqdWords',
     'solution', gd -> 'puzzle' -> 'solution')
     from (select pg_temp.game_data(pg_temp.coop()) gd) x),
  '{"nTiles": 30, "first": {"id": "0", "letter": "E", "x": 2, "y": 0, "z": 0},
    "last": {"id": "29", "letter": "O", "x": 6, "y": 8, "z": 0},
    "nReqd": 6, "solution": null}'::jsonb,
  'the puzzle: the stack as 30 tiles by tile number, six words to clear, no solution mid-game'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'team',
  '{"nFoundWords": 0, "nHintsUsed": 0, "nSpoilersUsed": 0}'::jsonb,
  'coop: a team with nothing found or taken'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'team',
  'null'::jsonb,
  'compete: no team'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'events',
  '[]'::jsonb,
  'no log yet'
);
select is(
  pg_temp.own_keys(pg_temp.player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111')),
  '{"nFoundWords": 0, "nHintsUsed": 0, "nSpoilersUsed": 0, "nBoardTiles": 30}'::jsonb,
  'a fresh player: nothing found or taken, the whole stack as their board'
);
select is(
  pg_temp.summary_data(pg_temp.coop()),
  pg_temp.common_summary(pg_temp.coop())
    || '{"team": {"nFoundWords": 0, "nHintsUsed": 0, "nSpoilersUsed": 0},
         "nReqdWords": 6, "band": 1}'::jsonb,
  'coop: a fresh summary'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete())
    || '{"team": null, "nReqdWords": 6, "band": 1}'::jsonb,
  'compete: a fresh summary'
);

-- ─── (2) Mid-game coop: ada tries EBATL, then clears EAGLE; bea takes a hint,
-- ada a spoiler ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select stackdown.submit_word(pg_temp.coop(), pg_temp.sd_invalid());
select stackdown.submit_word(pg_temp.coop(), pg_temp.sd_seq(1));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select stackdown.reveal_next_hint(pg_temp.coop());
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select stackdown.reveal_next_word(pg_temp.coop());
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select jsonb_agg(e - 'id' - 'at' - 'userId' - 'clue' order by (e ->> 'id')::bigint)
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e),
  '[{"kind": "word", "word": "ebatl", "tileIds": ["10", "5", "11", "6", "2"],
     "valid": false, "tookTurn": true},
    {"kind": "word", "word": "eagle", "tileIds": ["19", "11", "15", "24", "10"],
     "valid": true, "tookTurn": true},
    {"kind": "hint", "word": null, "tileIds": [], "valid": null, "tookTurn": false},
    {"kind": "spoiler", "word": "table", "tileIds": [], "valid": null, "tookTurn": true}]'::jsonb,
  'coop: the log — a refused word, a word''s tiles as ids in pick order, the hint and the spoiler'
);
select is(
  (select jsonb_build_array(e -> 'clue' is not null and e ->> 'clue' <> '', e -> 'word')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'events') e
    where e ->> 'kind' = 'hint'),
  '[true, null]'::jsonb,
  'a hint''s text is its clue, never a word'
);
select is(
  pg_temp.game_data(pg_temp.coop()) -> 'team',
  '{"nFoundWords": 1, "nHintsUsed": 1, "nSpoilersUsed": 1}'::jsonb,
  'coop: the team''s counts, summed over every player''s own'
);
select is(
  jsonb_build_array(
    pg_temp.own_keys(pg_temp.player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111')),
    pg_temp.own_keys(pg_temp.player(pg_temp.coop(), 'bea22222-2222-2222-2222-222222222222'))),
  '[{"nFoundWords": 1, "nHintsUsed": 0, "nSpoilersUsed": 1, "nBoardTiles": 25},
    {"nFoundWords": 0, "nHintsUsed": 1, "nSpoilersUsed": 0, "nBoardTiles": 25}]'::jsonb,
  'coop: each player''s own counts, and the one shared stack on both seats'
);
select is(
  pg_temp.on_board(pg_temp.player(pg_temp.coop(), 'bea22222-2222-2222-2222-222222222222'), '19'),
  false,
  'coop: a word one player cleared is off everyone''s stack'
);

-- ─── (3) Mid-game compete: ada clears EAGLE ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select stackdown.submit_word(pg_temp.compete(), pg_temp.sd_seq(1));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  jsonb_build_array(
    pg_temp.own_keys(pg_temp.player(pg_temp.compete(), 'ada11111-1111-1111-1111-111111111111')),
    pg_temp.own_keys(pg_temp.player(pg_temp.compete(), 'bea22222-2222-2222-2222-222222222222'))),
  '[{"nFoundWords": 1, "nHintsUsed": 0, "nSpoilersUsed": 0, "nBoardTiles": 25},
    {"nFoundWords": 0, "nHintsUsed": 0, "nSpoilersUsed": 0, "nBoardTiles": 30}]'::jsonb,
  'compete: each racer''s counts and stack are their own'
);
select is(
  (select jsonb_agg(e ->> 'userId') from jsonb_array_elements(pg_temp.game_data(pg_temp.compete()) -> 'events') e),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb,
  'compete: the log carries every racer''s rows — what a racer may see is the hook''s rule'
);

-- ─── (4) The endings ───
-- Coop: the team clears the other five. Compete: ada clears the other five and
-- wins the race.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select stackdown.submit_word(pg_temp.coop(), pg_temp.sd_seq(n)) from generate_series(2, 6) n;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select stackdown.submit_word(pg_temp.compete(), pg_temp.sd_seq(n)) from generate_series(2, 6) n;
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.game_data(pg_temp.coop()) -> 'puzzle' -> 'solution',
  '["eagle", "table", "plans", "apple", "juice", "lemon"]'::jsonb,
  'the solution arrives once the game has ended'
);
select is(
  (select jsonb_agg(jsonb_build_array(p -> 'solved', p -> 'outcome') order by p ->> 'id')
     from jsonb_array_elements(pg_temp.game_data(pg_temp.coop()) -> 'players') p)
    || jsonb_build_array(pg_temp.game_data(pg_temp.coop()) -> 'team' -> 'nFoundWords'),
  '[[true, "won"], [true, "won"], 6]'::jsonb,
  'coop cleared: the clear stamps every teammate, and the team found all six'
);
select is(
  pg_temp.own_keys(pg_temp.player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111')) -> 'nBoardTiles',
  '0'::jsonb,
  'coop cleared: the stack is empty'
);
select is(
  pg_temp.game_data(pg_temp.compete()) -> 'ending',
  jsonb_build_object(
    'reason', 'reached_goal',
    'detail', 'cleared',
    'by',     'ada11111-1111-1111-1111-111111111111',
    'winner', 'ada11111-1111-1111-1111-111111111111'),
  'compete: the first to clear ended it and won'
);
select is(
  pg_temp.summary_data(pg_temp.compete()),
  pg_temp.common_summary(pg_temp.compete())
    || '{"team": null, "nReqdWords": 6, "band": 1}'::jsonb,
  'compete won: the summary names no count of its own; the winner is the common ending''s'
);
select is(
  (pg_temp.shell_data(pg_temp.coop()) ->> 'ended')::boolean,
  true,
  'the builder rewrites shell_data beside the game_data'
);

-- ─── (5) A Restart empties it all again ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select stackdown.replay_board(pg_temp.coop());
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  jsonb_build_object(
    'team',     pg_temp.game_data(pg_temp.coop()) -> 'team',
    'events',   pg_temp.game_data(pg_temp.coop()) -> 'events',
    'solution', pg_temp.game_data(pg_temp.coop()) -> 'puzzle' -> 'solution',
    'ada',      pg_temp.own_keys(pg_temp.player(pg_temp.coop(), 'ada11111-1111-1111-1111-111111111111'))),
  '{"team": {"nFoundWords": 0, "nHintsUsed": 0, "nSpoilersUsed": 0}, "events": [], "solution": null,
    "ada": {"nFoundWords": 0, "nHintsUsed": 0, "nSpoilersUsed": 0, "nBoardTiles": 30}}'::jsonb,
  'after a Restart: the whole stack back, no log, nothing found or taken, no solution'
);

-- ─── (6) _rebuild_data_cols_for_all ───
update common.games set game_data = null, summary_data = null, shell_data = null, status_changed_at = '2026-01-01'
 where id in (select id from g);
select is(stackdown._rebuild_data_cols_for_all() >= 2, true, '_rebuild_data_cols_for_all rewrites every stackdown game');
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
