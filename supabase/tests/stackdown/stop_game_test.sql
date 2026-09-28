-- cs-unmet

-- ============================================================
-- Test: stackdown.stop_game (manual) + submit_timeout
-- ============================================================
-- Manual end is the neutral Stop (`stopped`, nobody wins), idempotent.
-- A countdown timeout is a loss (`timeout`, nobody ranked).

begin;
set search_path = stackdown, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(6);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Stack end', array['ada', 'bea']) as handle;

-- ── Manual end → neutral, stopped ───────────────────────────────────
create temp table g1 on commit drop as
select (stackdown.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;
select stackdown.stop_game((select id from g1));

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g1)),
  'neutral', 'manual end → the game ends neutral');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g1) and final_ranking is null and outcome = 'neutral'),
  2::bigint, 'manual end: nobody won — every player unranked, neutral');
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g1)),
  'stopped/stopped', 'manual end: the reason is stopped');

-- Idempotency: a second end is rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  stackdown.stop_game((select id from g1)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'ending an already-ended game is rejected');

-- ── Countdown timeout → loss ────────────────────────────────────────
create temp table g2 on commit drop as
select (stackdown.create_game(
  (select handle from club), '{"timer": {"kind": "countdown", "seconds": 300}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;
select stackdown.submit_timeout((select id from g2));

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g2)),
  'lost', 'coop timeout → the game ends lost');
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail
          || '/' || coalesce(game_ended_by_user_id::text, 'nobody')
     from common.games where id = (select id from g2)),
  'timeout/timeout/nobody', 'coop timeout: the reason is timeout, ended by nobody');

select * from finish();
rollback;
