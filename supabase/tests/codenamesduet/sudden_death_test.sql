-- cs-unmet

-- ============================================================
-- Test: sudden death rules
-- ============================================================
--
-- Sudden death triggers when the last turn is spent and
-- agents remain. We don't play through nine real turns to drain
-- the turn budget here — that's tested implicitly by game_loop_test
-- (which verifies turns decrement on turn end). This file
-- forces the game into sudden_death directly and then exercises
-- the rules that apply there:
--
--   1. submit_clue is rejected (no more clues in sudden death)
--   2. submit_guess works for either player (no turn enforcement)
--   3. a green reveal keeps the game going
--   4. ANY non-green reveal ends the game in lost_clock
--
-- For the reveal label, sudden_death uses the *partner's* view
-- (the seat opposite the guesser). So when ada guesses, we
-- look up positions on bea's key view to find a "green for ada
-- to hit" or "neutral for ada to hit".
--
-- See `create_game_test.sql` for the pgTAP primer.
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(5);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- Set up an active game and force-flip it to sudden_death
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada','bea']) as handle;
create temp table g on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;

-- Force the game into sudden_death. We swap back to the superuser
-- because the `games` table has no UPDATE policy/grant for the
-- authenticated role — all real state changes go through RPCs. Tests
-- can write directly because they run as postgres by default.
reset role;
update common.games set play_state = 'sudden_death'
  where id = (select id from g);
update codenamesduet.games set turns_remaining = 0, current_clue_giver = null
  where id = (select id from g);

-- ============================================================
-- (1) submit_clue is rejected in sudden death
-- ============================================================
-- The RPC guards on play_state='playing'. A RACE rather than a fault: the
-- clue form is drawn from state that arrives by subscription, so the turn that
-- spent the last budget can land while the form is still up.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  submit_clue((select id from g), 'CLUE', 1),
  '{"type":"not-ok","severity":"race","dbcode":"PN370",
    "message":"Game over"}'::jsonb,
  'submit_clue is rejected when play_state = sudden_death'
);

-- ============================================================
-- (2) and (3) — green guess works, game stays in sudden_death
-- ============================================================
-- Ada guesses; the reveal uses bea's view. We look up a 'G' on bea's
-- side and submit it.

select pg_temp.envelope_is(
  submit_guess(
    (select id from g),
    pg_temp.find_position((select id from g), 'B', 'G')
  ),
  '{"type":"ok","outcome":"won","data":{"result":"agent","revealed":"G",
    "greens_found":1,"play_state":"sudden_death"}}'::jsonb,
  'green reveal in sudden death answers ok/agent and stays in sudden death'
);

select is(
  (select play_state from common.games where id = (select id from g)),
  'sudden_death',
  'play_state stays sudden_death after a green reveal'
);

-- ============================================================
-- (4) and (5) — any non-green ends the game in lost_clock
-- ============================================================
-- A neutral on the partner's view is enough.

select pg_temp.envelope_is(
  submit_guess(
    (select id from g),
    pg_temp.find_position((select id from g), 'B', 'N')
  ),
  '{"type":"ok","outcome":"lost","data":{"result":"lost_clock","revealed":"N",
    "greens_found":1}}'::jsonb,
  'a neutral in sudden death answers ok/lost_clock — the game is over'
);

select is(
  (select play_state from common.games where id = (select id from g)),
  'lost_clock',
  'a non-green reveal in sudden death sets play_state = lost_clock'
);

-- ============================================================
select * from finish();
rollback;
