-- cs-unmet

-- ============================================================
-- Test: wordsy's page blobs — static_game_data, game_data, summary_data, and shell_data beside them
-- ============================================================
-- `wordsy._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move, and `_write_static_game_data` what nothing
-- after create changes (supabase/sql/wordsy.sql → The page blobs). Two
-- players, ada · bea, on the planted table. This file pins what the page gets:
--
--   1. A fresh game: the static blob the common part alone, round 1's table,
--      no log, every player's facts at zero, the summary, the clock put away
--   2. Mid-round: the timer running, the Fastest named, and every seat's
--      standing word in the blob — the frozen one marked
--   3. After the reveal: the log's rows, the totals, the next round dealt
--   4. The ending: the summary's numbers
-- ============================================================

begin;
set search_path = wordsy, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(18);

select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.g', pg_temp.ws_game(array['ada', 'bea'])::text, true);
create function pg_temp.g() returns uuid language sql as
  $$ select current_setting('t.g')::uuid $$;
reset role;

create function pg_temp.gd() returns jsonb language sql as
  $$ select game_data from common.games where id = pg_temp.g() $$;
create function pg_temp.player(p_name text) returns jsonb language sql as $$
  select p from jsonb_array_elements(pg_temp.gd() -> 'players') p
   where p ->> 'id' = pg_temp.ws_uid(p_name)::text
$$;
-- A player's wordsy facts alone, the common player's keys dropped.
create function pg_temp.facts(p_name text) returns jsonb language sql as $$
  select jsonb_build_object(
    'total', p -> 'total', 'nBonuses', p -> 'nBonuses', 'roundScores', p -> 'roundScores',
    'hasSubmitted', p -> 'hasSubmitted', 'word', p -> 'word', 'isWordFrozen', p -> 'isWordFrozen')
    from pg_temp.player(p_name) p
$$;

-- ─── (1) A fresh game ───
select is(
  (select array_agg(k order by k) from jsonb_object_keys(
     (select static_game_data from common.games where id = pg_temp.g())) k),
  array['brand', 'club', 'compete', 'coop', 'gametype', 'id', 'mode', 'setup'],
  'static_game_data is the common part alone'
);
select is(
  (select static_game_data ->> 'brand' from common.games where id = pg_temp.g()),
  'FlipWord',
  '… under the brand'
);
select is(
  (pg_temp.gd() -> 'rounds' -> 0) - 'tiles'::text,
  '{"num": 1, "fastest": null, "noFlipHolder": null, "isTimerRunning": false, "ended": false}'::jsonb,
  'round 1: nobody has submitted'
);
select is(
  pg_temp.gd() -> 'rounds' -> 0 -> 'tiles',
  '[{"id": "45", "letter": "f", "bonus": 1, "slot": 1, "value": 5},
    {"id": "1",  "letter": "b", "bonus": 0, "slot": 2, "value": 5},
    {"id": "5",  "letter": "c", "bonus": 0, "slot": 3, "value": 4},
    {"id": "9",  "letter": "d", "bonus": 0, "slot": 4, "value": 4},
    {"id": "17", "letter": "l", "bonus": 0, "slot": 5, "value": 3},
    {"id": "6",  "letter": "c", "bonus": 0, "slot": 6, "value": 3},
    {"id": "58", "letter": "q", "bonus": 2, "slot": 7, "value": 2},
    {"id": "33", "letter": "r", "bonus": 0, "slot": 8, "value": 2}]'::jsonb,
  '… its eight cards in slot order, each with its letter, bonus, slot and value'
);
select is(
  jsonb_build_array(pg_temp.gd() -> 'nTilesInDeck', pg_temp.gd() -> 'events'),
  '[52, []]'::jsonb,
  'fifty-two cards left and an empty log'
);
select is(
  pg_temp.facts('ada'),
  '{"total": 0, "nBonuses": 0, "roundScores": [null, null, null, null, null, null, null],
    "hasSubmitted": false, "word": null, "isWordFrozen": false}'::jsonb,
  'a player''s facts at the start'
);
select is(
  (select summary_data - 'id' - 'gametype' - 'title' - 'statusChangedAt' - 'ending'
                       - 'ended' - 'outcome' - 'players'
     from common.games where id = pg_temp.g()),
  '{"team": null, "nRoundsPlayed": 0, "winnerTotal": null, "legalBand": 4, "roundStyle": "timer"}'::jsonb,
  'summary_data''s own part'
);

-- ─── (2) Mid-round ───
select pg_temp.ws_submit(pg_temp.g(), 'ada', pg_temp.ws_word(5));
select pg_temp.ws_submit(pg_temp.g(), 'bea', pg_temp.ws_word(4));
reset role;
select is(
  (pg_temp.gd() -> 'rounds' -> 0) - 'tiles'::text,
  jsonb_build_object('num', 1, 'fastest', pg_temp.ws_uid('ada'), 'noFlipHolder', null,
                     'isTimerRunning', true, 'ended', false),
  'the first submit names the Fastest and the timer runs'
);
select is(
  pg_temp.facts('ada') - 'roundScores',
  '{"total": 0, "nBonuses": 0, "hasSubmitted": true, "word": "ab", "isWordFrozen": true}'::jsonb,
  'the Fastest''s word, frozen'
);
select is(
  pg_temp.facts('bea') - 'roundScores',
  '{"total": 0, "nBonuses": 0, "hasSubmitted": true, "word": "ad", "isWordFrozen": false}'::jsonb,
  'a rival''s standing word is in the blob too: useGame drops it'
);
select is(
  (select shell_data -> 'timer' from common.games where id = pg_temp.g()),
  '{"kind": "countdown", "seconds": 30}'::jsonb,
  'shell_data carries the running clock'
);

-- ─── (3) After the reveal ───
select pg_temp.ws_buzz(pg_temp.g());
reset role;
select is(
  (select jsonb_agg(e - 'id' - 'at' order by (e ->> 'id')::bigint)
     from jsonb_array_elements(pg_temp.gd() -> 'events') e),
  jsonb_build_array(
    jsonb_build_object('userId', pg_temp.ws_uid('ada'), 'kind', 'word', 'num', 1, 'word', 'ab',
                       'score', 5, 'bonus', 2, 'tookTurn', true),
    jsonb_build_object('userId', pg_temp.ws_uid('bea'), 'kind', 'word', 'num', 1, 'word', 'ad',
                       'score', 4, 'bonus', 0, 'tookTurn', true)),
  'the log: each word, its score and its bonus'
);
select is(
  pg_temp.facts('ada'),
  '{"total": 7, "nBonuses": 1, "roundScores": [7, null, null, null, null, null, null],
    "hasSubmitted": false, "word": null, "isWordFrozen": false}'::jsonb,
  'ada''s total, and nothing standing in the new round'
);
select is(
  (select jsonb_agg(jsonb_build_array(r -> 'num', r -> 'ended'))
     from jsonb_array_elements(pg_temp.gd() -> 'rounds') r),
  '[[1, true], [2, false]]'::jsonb,
  'round 1 ended, round 2 in play last'
);
select is(pg_temp.gd() -> 'nTilesInDeck', '48'::jsonb, 'four more cards drawn');
select is(
  (select shell_data -> 'timer' from common.games where id = pg_temp.g()),
  '{"kind": "none"}'::jsonb,
  'the clock is put away between rounds'
);

-- ─── (4) The ending ───
select pg_temp.ws_play_round(pg_temp.g(), array['ada', 'bea'], array[5, 4]) from generate_series(2, 7);
reset role;
select is(
  (select jsonb_build_array(summary_data -> 'nRoundsPlayed', summary_data -> 'winnerTotal')
     from common.games where id = pg_temp.g()),
  '[7, 44]'::jsonb,
  'the summary at the end: seven rounds, the winner''s total'
);
select is(pg_temp.winner_ids(pg_temp.gd()), jsonb_build_array(pg_temp.ws_uid('ada')), 'ada won');

select * from finish();
rollback;
