-- cs-blessed-psychicnum

-- ============================================================
-- Test: psychicnum.stop_game — the Stop
-- ============================================================
--
-- stop_game is the explicit "we're done, stop the game" action,
-- available in BOTH modes. Unlike submit_timeout (a genuine
-- loss), a Stop is neutral: reason `stopped`, the stopper as who
-- ended it, nobody ranked, so the game and every player come out
-- `neutral`. We assert that shape for coop AND compete, plus
-- idempotency (a 2nd call is refused as the game-over race) and that a
-- non-player can't fire it.
--
-- Strategy mirrors gameplay_test.sql: build a club, create a
-- game, pin the secrets with a postgres-role UPDATE (irrelevant to
-- stop_game, but keeps the setup identical), then drive with
-- as_user switching.

begin;

set search_path = psychicnum, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada','bea']) as handle;

-- ============================================================
-- COOP block
-- ============================================================

create temp table coop_g on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 5, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
)->'data'->>'id')::uuid as id;
reset role;
update psychicnum.games set secrets = array['alpha','bravo','charlie'] where game_id = (select id from coop_g);

-- (1) Non-player (dee) cannot end the game
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  psychicnum.stop_game((select id from coop_g)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'coop: non-player stop_game rejected');

-- (2) A game player ends the game — succeeds
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  psychicnum.stop_game((select id from coop_g)),
  '{"type":"ok","data":{"result":"ended"}}'::jsonb,
  'coop: game player can end the game'
);

reset role;
-- (3) The game has ended
select isnt(
  (select ended_at from common.games where id = (select id from coop_g)),
  null,
  'coop: stop_game ends the game'
);

-- (4) The reason pair is stopped/stopped
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from coop_g)),
  'stopped/stopped',
  'coop: stop_game writes the reason stopped'
);

-- (5) The game is neutral, and ada ended it
select is(
  (select game_ended_outcome || '/' || game_ended_by_user_id from common.games where id = (select id from coop_g)),
  'neutral/ada11111-1111-1111-1111-111111111111',
  'coop: a Stop is neutral, and the stopper ended it'
);

-- (6) Every player is neutral and unranked
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from coop_g) and outcome = 'neutral' and final_ranking is null),
  2,
  'coop: every player is neutral and unranked on a Stop'
);

-- (7) Idempotency — a 2nd stop_game on an ended game is refused as the game-over race
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  psychicnum.stop_game((select id from coop_g)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'coop: second stop_game on an ended game is refused as the game-over race');

-- ============================================================
-- COMPETE block — the same shape
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table comp_g on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 3, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
)->'data'->>'id')::uuid as id;
reset role;
update psychicnum.games set secrets = array['alpha','bravo','charlie'] where game_id = (select id from comp_g);

-- (8) A game player ends the compete game — succeeds
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  psychicnum.stop_game((select id from comp_g)),
  '{"type":"ok","data":{"result":"ended"}}'::jsonb,
  'compete: game player can end the game'
);

reset role;
-- (9) Compete's Stop is the same neutral ending, not a loss
select is(
  (select game_ended_reason || '/' || game_ended_outcome from common.games where id = (select id from comp_g)),
  'stopped/neutral',
  'compete: a Stop is stopped and neutral, not a loss'
);

-- (10) bea ended it
select is(
  (select game_ended_by_user_id from common.games where id = (select id from comp_g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'compete: the stopper ended it'
);

-- (11) Every player is neutral and unranked — no winner on a Stop
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from comp_g) and outcome = 'neutral' and final_ranking is null),
  2,
  'compete: every player is neutral and unranked on a Stop'
);

-- (12) Idempotency holds in compete too
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  psychicnum.stop_game((select id from comp_g)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'compete: second stop_game on an ended game is refused as the game-over race');

-- ============================================================
select * from finish();
rollback;
