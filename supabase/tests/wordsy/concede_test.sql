-- cs-unmet

-- ============================================================
-- Test: wordsy.concede
-- ============================================================
--   1. a player concedes mid-round: out and lost, the game plays on
--   2. a conceder's submit, and a second concede, are races
--   3. everyone conceding ends the game, a loss for all, the clock put away
--   4. a concede into a game a friend deleted is the shared race
-- A conceder at the bonuses and the ranking is bonus_test's and
-- finish_test's; a concede that ends a no-timer round is no_timer_test's.
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(10);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.g', pg_temp.ws_game(array['ada', 'bea', 'cade'])::text, true);
create function pg_temp.g() returns uuid language sql as
  $$ select current_setting('t.g')::uuid $$;

-- The clock is running when the concessions come.
select pg_temp.ws_submit(pg_temp.g(), 'bea', pg_temp.ws_word(5));

-- ─── (1) ada concedes ───
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select pg_temp.envelope_is(
  wordsy.concede(pg_temp.g()),
  '{"type":"ok","data":{"result":"conceded"}}'::jsonb,
  'ada concedes'
);
reset role;
select is(
  (select player_ended_reason || ' ' || outcome from common.game_players
    where game_id = pg_temp.g() and user_id = pg_temp.ws_uid('ada')),
  'conceded lost',
  '… is out, and lost'
);
select is((select ended_at from common.games where id = pg_temp.g()), null, '… and the game plays on');

-- ─── (2) The races ───
select pg_temp.envelope_is(
  pg_temp.ws_submit(pg_temp.g(), 'ada', pg_temp.ws_word(6)),
  '{"type":"not-ok","severity":"race","dbcode":"PN483"}'::jsonb,
  'a conceder''s submit is a race'
);
select pg_temp.envelope_is(
  wordsy.concede(pg_temp.g()),
  '{"type":"not-ok","severity":"race","dbcode":"PN483"}'::jsonb,
  'so is a second concede'
);

-- ─── (3) Everyone concedes ───
select pg_temp.as_user(pg_temp.ws_uid('bea'));
select wordsy.concede(pg_temp.g());
select pg_temp.as_user(pg_temp.ws_uid('cade'));
select wordsy.concede(pg_temp.g());
reset role;
select is(
  (select game_ended_reason || ' ' || game_ended_outcome from common.games where id = pg_temp.g()),
  'conceded lost',
  'everyone conceding ends the game as a loss'
);
select is(
  (select array_agg(outcome order by user_id) from common.game_players where game_id = pg_temp.g()),
  array['lost', 'lost', 'lost'],
  '… for all'
);
select is(
  (select kind from common.timers where game_id = pg_temp.g()),
  'none',
  '… and puts the clock away'
);
select is(
  (select shell_data -> 'timer' from common.games where id = pg_temp.g()),
  '{"kind": "none"}'::jsonb,
  '… which the page reads'
);

-- ─── (4) A deleted game ───
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.d', pg_temp.ws_game(array['ada', 'bea'])::text, true);
reset role;
delete from common.games where id = current_setting('t.d')::uuid;
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select pg_temp.envelope_is(
  wordsy.concede(current_setting('t.d')::uuid),
  '{"type":"not-ok","severity":"race","dbcode":"PN485"}'::jsonb,
  'a concede into a deleted game is the shared race'
);

select * from finish();
rollback;
