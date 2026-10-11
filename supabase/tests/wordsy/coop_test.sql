-- cs-unmet

-- ============================================================
-- Test: coop — the solo card's game, for one to six, free-for-all or turns
-- ============================================================
-- On the planted table (setup.psql → ws_coop_game). The card's own moves are
-- solo_card_test's and the ending coop_finish_test's; this file pins the game
-- around them:
--   1. create: one player in their solo club, and six; the card starts on
--      band 1 with no penalties; the deal arms the clock for the setup's
--      seconds, and the page reads it running with no Fastest
--   2. the faults: a setup off the card (PN559), a first writer who is not a
--      player (PN560)
--   3. free-for-all: anyone's submit is the team's word and ends the round;
--      the next waits for everyone's Start
--   4. turns: the writer's gate (PN243), the holder in the blob, the rotation
--      after each round
--   5. the clock running out ends nothing: `expired`, then the race, the
--      round still open and the word still taken
--   6. never a Fastest or No Flip; no concede in coop
--   7. Restart puts the card back on band 1 and arms the clock
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(29);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

create function pg_temp.timer(p_gid uuid) returns text
language plpgsql as $$
declare prev text := current_user; v text;
begin
  perform set_config('role', 'postgres', true);
  select kind || '/' || coalesce(countdown_seconds_at_setup::text, '-') || '/' || ticks
    into v from common.timers where game_id = p_gid;
  perform set_config('role', prev, true);
  return v;
end;
$$;

create function pg_temp.gd(p_gid uuid) returns jsonb language sql as
  $$ select game_data from common.games where id = p_gid $$;

create function pg_temp.holder(p_gid uuid) returns text language sql as $$
  select p.username from common.games g
    join common.profiles p on p.user_id = g.current_turn_user_id
   where g.id = p_gid
$$;

-- ─── (1) Create ───
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.s', pg_temp.ws_coop_game(array['ada'])::text, true);
create function pg_temp.s() returns uuid language sql as
  $$ select current_setting('t.s')::uuid $$;
reset role;
select is(
  (select gametype || ' ' || mode from common.games where id = pg_temp.s()),
  'wordsy_coop coop',
  'one player in their solo club makes a coop game'
);
select is(pg_temp.ws_card(pg_temp.s()), 'band 1 · penalties 0',
  '… the card starts on band 1 with no penalties');
select is(pg_temp.timer(pg_temp.s()), 'countdown/30/0',
  '… and the deal arms the clock for the setup''s seconds');
select is(
  (pg_temp.gd(pg_temp.s()) -> 'rounds' -> 0) - 'tiles'::text,
  '{"num": 1, "fastest": null, "noFlipHolder": null, "isTimerRunning": true, "ended": false}'::jsonb,
  '… which the page reads running, with no Fastest'
);

select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.six',
  pg_temp.ws_coop_game(array['ada', 'bea', 'cade', 'dee', 'eda', 'abe-bot'])::text, true);
reset role;
select is(
  (select count(*)::int from common.game_players where game_id = current_setting('t.six')::uuid),
  6,
  'six may play the card together'
);

-- ─── (2) The faults ───
create function pg_temp.setup(p_style text default 'free-for-all') returns jsonb
language sql immutable as $$
  select jsonb_build_object('timer', '{"kind": "none"}'::jsonb, 'legal_band', 4,
                            'round_style', 'timer', 'timer_seconds', 30, 'n_rounds', 7,
                            'one_word', true, 'coop_style', p_style)
$$;
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select pg_temp.envelope_is(
  wordsy.create_game('=ada', pg_temp.setup() || '{"one_word": false}', array[pg_temp.ws_uid('ada')], 'coop'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN559"}'::jsonb,
  'a coop setup off the card is refused: words that can change'
);
select pg_temp.envelope_is(
  wordsy.create_game('=ada', pg_temp.setup() || '{"n_rounds": 3}', array[pg_temp.ws_uid('ada')], 'coop'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN559"}'::jsonb,
  '… a short game'
);
select pg_temp.envelope_is(
  wordsy.create_game('=ada', pg_temp.setup() || '{"round_style": "no-timer"}', array[pg_temp.ws_uid('ada')], 'coop'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN559"}'::jsonb,
  '… no timer'
);
select pg_temp.envelope_is(
  wordsy.create_game(
    (select club_handle from common.games where id = current_setting('t.six')::uuid),
    pg_temp.setup('turns') || jsonb_build_object('first_turn_user_id', pg_temp.ws_uid('dee')),
    array[pg_temp.ws_uid('ada'), pg_temp.ws_uid('bea')], 'coop'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN560"}'::jsonb,
  'a first writer who is not a player is refused'
);

-- ─── (3) Free-for-all ───
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.f', pg_temp.ws_coop_game(array['ada', 'bea'])::text, true);
create function pg_temp.f() returns uuid language sql as
  $$ select current_setting('t.f')::uuid $$;
select pg_temp.ws_plant_table(pg_temp.f());
select pg_temp.envelope_is(
  pg_temp.ws_submit(pg_temp.f(), 'bea', pg_temp.ws_word(5)),
  '{"type":"ok","data":{"result":"submitted","timer_started":false,"round_ended":true,"game_ended":false}}'::jsonb,
  'anyone''s word is the team''s, and its submit ends the round'
);
reset role;
select is(
  (select p.username || ' ' || e.word || ' ' || e.score
     from wordsy.events e join common.profiles p on p.user_id = e.user_id
    where e.game_id = pg_temp.f() and e.num = 1),
  'bea ab 5',
  '… written to the log under the writer'
);
select is(pg_temp.gd(pg_temp.f()) -> 'turns', 'null'::jsonb, 'a free-for-all game has no turns');
select is(
  (select max(num) from wordsy.rounds where game_id = pg_temp.f()),
  1,
  'round 2 waits for Start'
);
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select is(wordsy.start_round(pg_temp.f()) -> 'data' ->> 'result', 'ready', '… ada''s press: ready');
select pg_temp.as_user(pg_temp.ws_uid('bea'));
select is(wordsy.start_round(pg_temp.f()) -> 'data' ->> 'result', 'started', '… bea''s deals it');

-- ─── (4) Turns ───
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.t', pg_temp.ws_coop_game(array['ada', 'bea'], 'turns', 'ada')::text, true);
create function pg_temp.t() returns uuid language sql as
  $$ select current_setting('t.t')::uuid $$;
reset role;
select is(
  pg_temp.gd(pg_temp.t()) -> 'turns' ->> 'holder',
  pg_temp.ws_uid('ada')::text,
  'under turns the blob names the writer: the first chosen at setup'
);
select pg_temp.ws_plant_table(pg_temp.t());
select pg_temp.envelope_is(
  pg_temp.ws_submit(pg_temp.t(), 'bea', pg_temp.ws_word(5)),
  '{"type":"not-ok","severity":"race","dbcode":"PN243"}'::jsonb,
  'a word out of turn is a race'
);
select pg_temp.ws_coop_round(pg_temp.t(), 'ada', 5);
select is(pg_temp.holder(pg_temp.t()), 'bea', 'the round''s end hands the turn to the next writer');
select pg_temp.ws_coop_round(pg_temp.t(), 'bea', 5);
select is(pg_temp.holder(pg_temp.t()), 'ada', '… and around again');

-- ─── (5) The clock runs out ───
select pg_temp.envelope_is(
  pg_temp.ws_buzz(pg_temp.s()),
  '{"type":"ok","data":{"result":"expired"}}'::jsonb,
  'the clock running out puts it away: expired'
);
select pg_temp.envelope_is(
  pg_temp.ws_buzz(pg_temp.s()),
  '{"type":"not-ok","severity":"race","dbcode":"PN551"}'::jsonb,
  '… the next page to fire meets the race'
);
reset role;
select is((pg_temp.ws_round(pg_temp.s())).num, 1, '… and the round is still in play');
-- The kind alone: the second buzz's helper ran the count up before meeting
-- the race.
select is(split_part(pg_temp.timer(pg_temp.s()), '/', 1), 'none', '… with the clock put away');
select is((pg_temp.ws_coop_round(pg_temp.s(), 'ada', 5)).num, 1, 'the word is taken all the same');

-- ─── (6) Never a Fastest or No Flip; no concede ───
select pg_temp.ws_coop_round(pg_temp.s(), 'ada', 5);
reset role;
select is(
  (select count(*)::int from wordsy.rounds
    where game_id = pg_temp.s() and (fastest_user_id is not null or no_flip_user_id is not null)),
  0,
  'no round names a Fastest or a No Flip holder'
);
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select pg_temp.envelope_is(
  wordsy.concede(pg_temp.f()),
  '{"type":"not-ok","dbcode":"PN484"}'::jsonb,
  'concede is compete''s: a coop game stops'
);

-- ─── (7) Restart ───
reset role;
select is(pg_temp.ws_card(pg_temp.s()), 'band 3 · penalties 0',
  'two words under 20 moved the card down twice');
select pg_temp.as_user(pg_temp.ws_uid('ada'));
select pg_temp.envelope_is(
  wordsy.replay_board(pg_temp.s()),
  '{"type":"ok","data":{"result":"replayed"}}'::jsonb,
  'Restart'
);
reset role;
select is(pg_temp.ws_card(pg_temp.s()) || ' · ' || pg_temp.timer(pg_temp.s()),
  'band 1 · penalties 0 · countdown/30/0',
  '… puts the card back on band 1 and arms round 1''s clock');

select * from finish();
rollback;
