-- cs-unmet

-- ============================================================
-- Test: wordsy.stop_game
-- ============================================================
--   1. a Stop mid-round ends the game with no result: stopped, neutral for
--      the game and every player, nobody ranked
--   2. it puts the round's clock away
--   3. a second Stop is the game-over race
--   4. a Stop into a game a friend deleted is the shared race
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(7);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.g', pg_temp.ws_game(array['ada', 'bea'])::text, true);
create function pg_temp.g() returns uuid language sql as
  $$ select current_setting('t.g')::uuid $$;

-- A round played, and the next one's clock running.
select pg_temp.ws_play_round(pg_temp.g(), array['ada', 'bea'], array[5, 6]);
select pg_temp.ws_submit(pg_temp.g(), 'ada', pg_temp.ws_word(5, 1, 2));

-- ─── (1, 2) The Stop ───
select pg_temp.as_user(pg_temp.ws_uid('bea'));
select pg_temp.envelope_is(
  wordsy.stop_game(pg_temp.g()),
  '{"type":"ok","data":{"result":"ended"}}'::jsonb,
  'bea stops the game'
);
reset role;
select is(
  (select game_ended_reason || ' ' || game_ended_outcome from common.games where id = pg_temp.g()),
  'stopped neutral',
  'a Stop is no result'
);
select is(
  (select array_agg(coalesce(final_ranking::text, '-') || ' ' || outcome order by user_id)
     from common.game_players where game_id = pg_temp.g()),
  array['- neutral', '- neutral'],
  '… nobody ranked, everyone neutral, though bea led'
);
select is(
  (select kind from common.timers where game_id = pg_temp.g()),
  'none',
  'the round''s clock is put away'
);

-- ─── (3) Again ───
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select pg_temp.envelope_is(
  wordsy.stop_game(pg_temp.g()),
  '{"type":"not-ok","severity":"race","dbcode":"PN486"}'::jsonb,
  'a second Stop is the game-over race'
);
select is(
  (select count(*)::int from wordsy.events where game_id = pg_temp.g()),
  2,
  'the round in play is not scored'
);

-- ─── (4) A deleted game ───
select set_config('t.d', pg_temp.ws_game(array['ada', 'bea'])::text, true);
reset role;
delete from common.games where id = current_setting('t.d')::uuid;
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select pg_temp.envelope_is(
  wordsy.stop_game(current_setting('t.d')::uuid),
  '{"type":"not-ok","severity":"race","dbcode":"PN485"}'::jsonb,
  'a Stop into a deleted game is the shared race'
);

select * from finish();
rollback;
