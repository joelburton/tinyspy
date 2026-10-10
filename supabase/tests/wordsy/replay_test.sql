-- cs-unmet

-- ============================================================
-- Test: wordsy.replay_board — Restart
-- ============================================================
--   1. mid-game: back to round 1 on the same deck — the same table, the
--      rounds and the log gone, the clock put away, the restart counted
--   2. after the end: the game is played again
--   3. a non-player is refused; a deleted game is the shared race
-- That the same seven tables come back is deal_test's.
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.g', pg_temp.ws_game(array['ada', 'bea'])::text, true);
create function pg_temp.g() returns uuid language sql as
  $$ select current_setting('t.g')::uuid $$;

-- ─── (1) Mid-game ───
-- Two rounds played, a third's clock running.
select pg_temp.ws_play_round(pg_temp.g(), array['ada', 'bea'], array[5, 6]) from generate_series(1, 2);
select pg_temp.ws_submit(pg_temp.g(), 'ada', pg_temp.ws_word(5, 1, 3));

select pg_temp.as_user(pg_temp.ws_uid('bea'));
select pg_temp.envelope_is(
  wordsy.replay_board(pg_temp.g()),
  '{"type":"ok","data":{"result":"replayed"}}'::jsonb,
  'bea restarts mid-game'
);
reset role;
select is(
  (select array_agg(num) from wordsy.rounds where game_id = pg_temp.g()),
  array[1],
  'round 1 again, and only round 1'
);
select is(
  (select tiles from wordsy.rounds where game_id = pg_temp.g()),
  pg_temp.ws_table(),
  '… dealt the same table from the same deck'
);
select is(
  (select cardinality(drawn) from wordsy.games where game_id = pg_temp.g()),
  8,
  '… with only its eight cards drawn'
);
select is(
  (select count(*)::int from wordsy.events where game_id = pg_temp.g()),
  0,
  'the log is gone'
);
select is(
  (select count(*)::int from wordsy.round_words where game_id = pg_temp.g()),
  0,
  'so are the standing words'
);
select is(
  (select kind || ' ' || ticks from common.timers where game_id = pg_temp.g()),
  'none 0',
  'the clock is put away'
);
select is(
  (select title || ' · ' || restart_count from common.games where id = pg_temp.g()),
  'Round 1 of 7 · 1',
  'the title is round 1 again, and the restart counted'
);

-- ─── (2) After the end ───
select pg_temp.ws_play_round(pg_temp.g(), array['ada', 'bea'], array[5, 6]) from generate_series(1, 7);
select is((select ended_at is not null from common.games where id = pg_temp.g()), true, 'played to the end');
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select wordsy.replay_board(pg_temp.g());
reset role;
select is(
  (select ended_at is null and game_ended_reason is null from common.games where id = pg_temp.g()),
  true,
  'a Restart after the end plays the game again'
);

-- ─── (3) The refusals ───
select pg_temp.as_user(pg_temp.ws_uid('cade'));
select pg_temp.envelope_is(
  wordsy.replay_board(pg_temp.g()),
  '{"type":"not-ok","severity":"fault"}'::jsonb,
  'someone not in the game cannot restart it'
);

select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.d', pg_temp.ws_game(array['ada', 'bea'])::text, true);
reset role;
delete from common.games where id = current_setting('t.d')::uuid;
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select pg_temp.envelope_is(
  wordsy.replay_board(current_setting('t.d')::uuid),
  '{"type":"not-ok","severity":"race","dbcode":"PN485"}'::jsonb,
  'a Restart into a deleted game is the shared race'
);

select * from finish();
rollback;
