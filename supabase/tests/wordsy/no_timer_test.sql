-- cs-unmet

-- ============================================================
-- Test: the `no-timer` style
-- ============================================================
-- Three players, ada · bea · cade, on the planted table. Round 1's First
-- Wordsmith is drawn at random (create_game_test pins that it is a player);
-- here it is planted as bea so the rest is known.
--   1. a submit starts no clock, and is final
--   2. the round ends on the last submit
--   3. the First Wordsmith stands in for the Fastest at the bonuses
--   4. the next First Wordsmith is the player with the fewest bonuses, ties
--      to the next seat after the current one, around the table
--   5. a concede by the last player yet to submit ends the round
--   6. no clock and no No Flip, ever
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.g', pg_temp.ws_game(array['ada', 'bea', 'cade'], 'no-timer')::text, true);
create function pg_temp.g() returns uuid language sql as
  $$ select current_setting('t.g')::uuid $$;
reset role;
update wordsy.rounds set fastest_user_id = pg_temp.ws_uid('bea') where game_id = pg_temp.g();

create function pg_temp.bonuses(p_num int) returns text
language sql as $$
  select string_agg(p.username || '+' || e.bonus, ' ' order by e.id)
    from wordsy.events e join common.profiles p on p.user_id = e.user_id
   where e.game_id = pg_temp.g() and e.num = p_num
$$;

create function pg_temp.first() returns text
language sql as $$
  select p.username from common.profiles p
   where p.user_id = (pg_temp.ws_round(pg_temp.g())).fastest_user_id
$$;

-- ─── (1, 2) Final submits; the last ends the round ───
select pg_temp.ws_plant_table(pg_temp.g());
select pg_temp.envelope_is(
  pg_temp.ws_submit(pg_temp.g(), 'ada', pg_temp.ws_word(6, 1, 1)),
  '{"type":"ok","data":{"result":"submitted","timer_started":false,"round_ended":false}}'::jsonb,
  'a submit stands and starts no clock'
);
select pg_temp.envelope_is(
  pg_temp.ws_submit(pg_temp.g(), 'ada', pg_temp.ws_word(4, 1, 1)),
  '{"type":"not-ok","severity":"race","dbcode":"PN549"}'::jsonb,
  'every submit is final'
);
select pg_temp.ws_submit(pg_temp.g(), 'bea', pg_temp.ws_word(5, 2, 1));
select pg_temp.envelope_is(
  pg_temp.ws_submit(pg_temp.g(), 'cade', pg_temp.ws_word(5, 3, 1)),
  '{"type":"ok","data":{"result":"submitted","round_ended":true}}'::jsonb,
  'the last player to submit ends the round'
);

-- ─── (3) The First Wordsmith at the bonuses ───
reset role;
select is(pg_temp.bonuses(1), 'ada+1 bea+0 cade+0',
  'bea, the First Wordsmith, stands in for the Fastest: ada beats her; tying cade alone is not enough');

-- ─── (4) The next First Wordsmith ───
select is(pg_temp.first(), 'cade',
  'round 2: bea and cade have the fewest bonuses; the tie goes to the next seat after bea');
select pg_temp.ws_play_round(pg_temp.g(), array['ada', 'bea', 'cade'], array[6, 4, 5]);
select is(pg_temp.bonuses(2), 'ada+1 bea+0 cade+0', 'round 2: cade at the bonuses, ada beating her');
select is(pg_temp.first(), 'bea',
  'round 3: bea and cade tie again; the next seat after cade is ada, who has more, then bea');

-- ─── (5) A concede ends the round ───
select pg_temp.ws_plant_table(pg_temp.g());
select pg_temp.ws_submit(pg_temp.g(), 'ada', pg_temp.ws_word(5, 1, 3));
select pg_temp.ws_submit(pg_temp.g(), 'bea', pg_temp.ws_word(5, 2, 3));
select pg_temp.as_user(pg_temp.ws_uid('cade'));
select pg_temp.envelope_is(
  wordsy.concede(pg_temp.g()),
  '{"type":"ok","data":{"result":"conceded"}}'::jsonb,
  'the last player yet to submit concedes'
);
reset role;
select is(
  (select ended_at is not null from wordsy.rounds where game_id = pg_temp.g() and num = 3),
  true,
  '… which ends the round'
);
select is(pg_temp.bonuses(3), 'ada+0 bea+2',
  '… scoring only the players still playing: bea, First, ties her one opponent left');

-- ─── (6) Never a clock, never No Flip ───
select is(
  (select kind from common.timers where game_id = pg_temp.g()),
  'none',
  'no clock is ever armed'
);
select is(
  (select count(*)::int from wordsy.rounds where game_id = pg_temp.g() and no_flip_user_id is not null),
  0,
  'nobody ever holds No Flip'
);

select * from finish();
rollback;
