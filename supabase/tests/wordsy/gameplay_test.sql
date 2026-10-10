-- cs-unmet

-- ============================================================
-- Test: a `timer` round — submit_word and submit_timeout
-- ============================================================
-- Three players, ada · bea · cade, on the planted table (setup.psql).
--   1. a non-word is a verdict, nothing recorded and no clock started
--   2. the first submit that stands makes its player the Fastest, arms the
--      clock (countdown, 30, ticks 0) and freezes their word
--   3. a later player's second submit replaces their first; a refused one
--      leaves the earlier word standing
--   4. a malformed word is a fault
--   5. the round does not end early: not on submits, not on a short clock
--   6. at 30 the round ends: the clock put away, a reveal row per player in
--      seat order, a player with no word scored '' 0
--   7. round 2: the Fastest holds No Flip, refused until someone else submits
--   8. an earlier round's root is already played, naming the earlier word
--   9. everyone submitting does not end a timer round either
--  10. a timeout with no clock running is a race
--  11. a submit after the game has ended is the game-over race
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(29);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user(pg_temp.ws_uid('ada'));
select set_config('t.g', pg_temp.ws_game(array['ada', 'bea', 'cade'])::text, true);
create function pg_temp.g() returns uuid language sql as
  $$ select current_setting('t.g')::uuid $$;

create function pg_temp.word_of(p_name text) returns text
language plpgsql as $$
declare prev text := current_user; w text;
begin
  perform set_config('role', 'postgres', true);
  select rw.word into w from wordsy.round_words rw
    join wordsy.rounds r on r.game_id = rw.game_id and r.num = rw.num
   where rw.game_id = pg_temp.g() and r.ended_at is null
     and rw.user_id = pg_temp.ws_uid(p_name);
  perform set_config('role', prev, true);
  return w;
end;
$$;

create function pg_temp.timer() returns text
language plpgsql as $$
declare prev text := current_user; v text;
begin
  perform set_config('role', 'postgres', true);
  select kind || '/' || coalesce(countdown_seconds_at_setup::text, '-') || '/' || ticks
    into v from common.timers where game_id = pg_temp.g();
  perform set_config('role', prev, true);
  return v;
end;
$$;

-- ─── (1) A non-word ───
select pg_temp.as_user(pg_temp.ws_uid('bea'));
select pg_temp.envelope_is(
  wordsy.submit_word(pg_temp.g(), 'qzxqzx'),
  '{"type":"ok","data":{"result":"notAWord","timer_started":false}}'::jsonb,
  'a non-word is a verdict'
);
select is(pg_temp.timer(), 'none/-/0', '… which starts no clock');
select is((pg_temp.ws_round(pg_temp.g())).fastest_user_id, null, '… and makes nobody the Fastest');

-- ─── (2) The first submit ───
-- A stray count on the row, as a tick landing while the clock was put away
-- would leave: the arm starts the countdown from 0 whatever it finds.
reset role;
update common.timers set ticks = 7 where game_id = pg_temp.g();
select pg_temp.envelope_is(
  pg_temp.ws_submit(pg_temp.g(), 'ada', pg_temp.ws_word(5)),
  '{"type":"ok","data":{"result":"submitted","timer_started":true,"round_ended":false}}'::jsonb,
  'the first word that stands starts the clock'
);
select is((pg_temp.ws_round(pg_temp.g())).fastest_user_id, pg_temp.ws_uid('ada'), '… its player is the Fastest');
select is(pg_temp.timer(), 'countdown/30/0', '… and the clock is a 30-second countdown from 0');
select is(
  (select shell_data -> 'timer' from common.games where id = pg_temp.g()),
  '{"kind": "countdown", "seconds": 30}'::jsonb,
  '… which the page reads in shell_data'
);
select pg_temp.envelope_is(
  pg_temp.ws_submit(pg_temp.g(), 'ada', pg_temp.ws_word(4)),
  '{"type":"not-ok","severity":"race","dbcode":"PN549","message":"Your word is in"}'::jsonb,
  'the Fastest''s word is frozen'
);
select is(pg_temp.word_of('ada'), pg_temp.ws_word(5), '… and stays what it was');

-- ─── (3) Later submits replace ───
select pg_temp.ws_submit(pg_temp.g(), 'bea', pg_temp.ws_word(2));
select pg_temp.envelope_is(
  pg_temp.ws_submit(pg_temp.g(), 'bea', pg_temp.ws_word(6)),
  '{"type":"ok","data":{"result":"submitted","timer_started":false}}'::jsonb,
  'a later player may submit again'
);
select is(pg_temp.word_of('bea'), pg_temp.ws_word(6), '… and the last submit stands');
select pg_temp.as_user(pg_temp.ws_uid('bea'));
select pg_temp.envelope_is(
  wordsy.submit_word(pg_temp.g(), 'qzxqzx'),
  '{"type":"ok","data":{"result":"notAWord"}}'::jsonb,
  'a non-word after a standing word is refused'
);
select is(pg_temp.word_of('bea'), pg_temp.ws_word(6), '… and the standing word stays');

-- ─── (4) Malformed ───
select pg_temp.envelope_is(
  wordsy.submit_word(pg_temp.g(), 'ab1'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN548"}'::jsonb,
  'a word with a digit is a fault'
);

-- ─── (5) No early end ───
select is((pg_temp.ws_round(pg_temp.g())).ended_at, null, 'submits do not end a timer round');
select pg_temp.as_user(pg_temp.ws_uid('cade'));
select pg_temp.envelope_is(
  wordsy.submit_timeout(pg_temp.g()),
  '{"type":"not-ok","severity":"race","dbcode":"PN552"}'::jsonb,
  'a timeout before the server''s count reaches 30 is a race'
);

-- ─── (6) The buzzer ───
select pg_temp.envelope_is(
  pg_temp.ws_buzz(pg_temp.g()),
  '{"type":"ok","data":{"result":"ended"}}'::jsonb,
  'at 30 the timeout ends the round'
);
select is(pg_temp.timer(), 'none/-/0', '… and puts the clock away');
reset role;
select is(
  (select array_agg(p.username || ' ' || coalesce(nullif(e.word, ''), '-') || ' ' || e.score
                    || '+' || e.bonus || ' ' || e.took_turn order by e.id)
     from wordsy.events e join common.profiles p on p.user_id = e.user_id
    where e.game_id = pg_temp.g() and e.num = 1),
  array['ada ab 5+0 true', 'bea af 6+1 true', 'cade - 0+0 true'],
  'the reveal: a row per player in seat order, bea beating the Fastest, cade''s none'
);
select is(
  (select title from common.games where id = pg_temp.g()),
  'Round 2 of 7',
  'the next round is dealt'
);

-- ─── (7) No Flip ───
select is((pg_temp.ws_round(pg_temp.g())).no_flip_user_id, pg_temp.ws_uid('ada'),
  'round 2: the last round''s Fastest holds No Flip');
select pg_temp.envelope_is(
  pg_temp.ws_submit(pg_temp.g(), 'ada', 'ee'),
  '{"type":"not-ok","severity":"race","dbcode":"PN550"}'::jsonb,
  'the holder may not start the clock'
);
select is(pg_temp.timer(), 'none/-/0', '… which stays put away');
select pg_temp.ws_submit(pg_temp.g(), 'bea', 'eee');
select pg_temp.envelope_is(
  pg_temp.ws_submit(pg_temp.g(), 'ada', 'ee'),
  '{"type":"ok","data":{"result":"submitted","timer_started":false}}'::jsonb,
  '… but may submit once someone else has'
);

-- ─── (8) Already played ───
select pg_temp.ws_submit(pg_temp.g(), 'cade', 'eeee');
select pg_temp.ws_plant_word('abs', 1, 'ab');
select pg_temp.as_user(pg_temp.ws_uid('cade'));
select pg_temp.envelope_is(
  wordsy.submit_word(pg_temp.g(), 'abs'),
  '{"type":"ok","data":{"result":"alreadyPlayed","earlier":"ab"}}'::jsonb,
  'a word whose root an earlier round scored is already played, naming that word'
);
select is(pg_temp.word_of('cade'), 'eeee', '… and the standing word stays');

-- ─── (9) Everyone in, still open ───
select is((pg_temp.ws_round(pg_temp.g())).ended_at, null,
  'everyone having submitted does not end a timer round');

-- ─── (10) No clock ───
select pg_temp.ws_buzz(pg_temp.g());
select pg_temp.as_user(pg_temp.ws_uid('bea'));
select pg_temp.envelope_is(
  wordsy.submit_timeout(pg_temp.g()),
  '{"type":"not-ok","severity":"race","dbcode":"PN551"}'::jsonb,
  'a timeout once the round is over is a race'
);

-- ─── (11) Game over ───
select wordsy.stop_game(pg_temp.g());
select pg_temp.envelope_is(
  pg_temp.ws_submit(pg_temp.g(), 'bea', 'eeeee'),
  '{"type":"not-ok","severity":"race","dbcode":"PN486"}'::jsonb,
  'a submit after the game has ended is the game-over race'
);

select * from finish();
rollback;
