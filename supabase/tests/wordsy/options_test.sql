-- cs-unmet

-- ============================================================
-- Test: the two setup options — a short game, and one word a round
-- ============================================================
-- On the planted table (setup.psql → ws_play_round), ada first.
--   1. a short game is three rounds: the title, the blob's counts, and the
--      third round's end ends it
--   2. its total is the best two word scores plus every bonus
--   3. one word, with the timer: every submit is final, not just the
--      Fastest's, and the page is told so
--   4. … the last player in ends the round and puts the clock away
--   5. … the clock still ends a round that not everyone is in
--   6. … a concede by the last player yet to submit ends the round
--   7. summary_data says both
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(14);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

create function pg_temp.player(p_gid uuid, p_name text) returns jsonb
language sql as $$
  select p from common.games g, jsonb_array_elements(g.game_data -> 'players') p
   where g.id = p_gid and p ->> 'username' = p_name
$$;

create function pg_temp.round_num(p_gid uuid) returns int
language sql as $$ select (pg_temp.ws_round(p_gid)).num $$;

-- ─── (1, 2) A short game ───
-- ada scores 6 2 4 and bea nothing, so ada, the Fastest, ties or beats her
-- one opponent every round: +2 +2 +2. The best two are 6 4 = 10, the 2
-- crossed out: 16.
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.s', pg_temp.ws_game(array['ada', 'bea'], 'timer', 3)::text, true);
reset role;

select is(
  (select title from common.games where id = current_setting('t.s')::uuid),
  'Round 1 of 3',
  'a short game''s title counts to three'
);
select is(
  (select jsonb_build_array(game_data -> 'nRounds', game_data -> 'nBestRounds')
     from common.games where id = current_setting('t.s')::uuid),
  '[3, 2]'::jsonb,
  'game_data says three rounds, the best two counted'
);

select pg_temp.ws_play_round(current_setting('t.s')::uuid, array['ada', 'bea'], array[s, 0])
  from unnest(array[6, 2, 4]) s;
reset role;

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail
     from common.games where id = current_setting('t.s')::uuid),
  'resource_exhausted/rounds_played',
  'the third round''s end ends a short game'
);
select is((select count(*)::int from wordsy.rounds where game_id = current_setting('t.s')::uuid),
  3, '… and no fourth round is dealt');
select is((pg_temp.player(current_setting('t.s')::uuid, 'ada') ->> 'total')::int, 16,
  'the total is the best two word scores plus every bonus');
select is(pg_temp.player(current_setting('t.s')::uuid, 'ada') -> 'roundScores',
  '[8, 4, 6]'::jsonb, 'roundScores has a short game''s three rounds');

-- ─── (3, 4) One word, with the timer ───
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.w', pg_temp.ws_game(array['ada', 'bea', 'cade'], 'timer', 7, true)::text, true);
select pg_temp.ws_plant_table(current_setting('t.w')::uuid);
select pg_temp.ws_submit(current_setting('t.w')::uuid, 'ada', pg_temp.ws_word(6, 1, 1));
select pg_temp.ws_submit(current_setting('t.w')::uuid, 'bea', pg_temp.ws_word(5, 2, 1));

select pg_temp.envelope_is(
  pg_temp.ws_submit(current_setting('t.w')::uuid, 'bea', pg_temp.ws_word(4, 2, 1)),
  '{"type":"not-ok","severity":"race","dbcode":"PN549"}'::jsonb,
  'a word that is not the Fastest''s is final too'
);
reset role;
select is((pg_temp.player(current_setting('t.w')::uuid, 'bea') ->> 'isWordFrozen')::boolean, true,
  '… and the page is told it is');

select pg_temp.envelope_is(
  pg_temp.ws_submit(current_setting('t.w')::uuid, 'cade', pg_temp.ws_word(4, 3, 1)),
  '{"type":"ok","data":{"result":"submitted","timer_started":false,"round_ended":true}}'::jsonb,
  'the last player in ends the round, with time left on the clock'
);
select pg_temp.ws_start_all(current_setting('t.w')::uuid);
select is(
  (select pg_temp.round_num(current_setting('t.w')::uuid) || '/' || kind
     from common.timers where game_id = current_setting('t.w')::uuid),
  '2/none',
  '… round 2 is dealt once everyone starts it, and the clock put away'
);

-- ─── (5) The clock still ends it ───
select pg_temp.ws_plant_table(current_setting('t.w')::uuid);
select pg_temp.ws_submit(current_setting('t.w')::uuid, 'bea', pg_temp.ws_word(6, 1, 2));
select pg_temp.envelope_is(
  pg_temp.ws_buzz(current_setting('t.w')::uuid),
  '{"type":"ok"}'::jsonb,
  'the clock ends a round that not everyone is in'
);
select pg_temp.ws_start_all(current_setting('t.w')::uuid);
select is(pg_temp.round_num(current_setting('t.w')::uuid), 3, '… and round 3 is dealt');

-- ─── (6) A concede by the last one out ───
select pg_temp.ws_plant_table(current_setting('t.w')::uuid);
select pg_temp.ws_submit(current_setting('t.w')::uuid, 'ada', pg_temp.ws_word(6, 1, 3));
select pg_temp.ws_submit(current_setting('t.w')::uuid, 'bea', pg_temp.ws_word(5, 2, 3));
select pg_temp.as_user(pg_temp.ws_uid('cade'));
select wordsy.concede(current_setting('t.w')::uuid);
reset role;
select is(
  (select ended_at is not null from wordsy.rounds
    where game_id = current_setting('t.w')::uuid and num = 3),
  true,
  'the last player yet to submit conceding ends the round'
);

-- ─── (7) summary_data ───
select is(
  (select jsonb_build_array(summary_data -> 'nRounds', summary_data -> 'oneWord')
     from common.games where id = current_setting('t.w')::uuid),
  '[7, true]'::jsonb,
  'summary_data says the round count and one word'
);

select * from finish();
rollback;
