-- cs-unmet

-- ============================================================
-- Test: waffle.stop_game (manual stop)
-- ============================================================
-- The friends' explicit "we're done" button. Available in BOTH modes.
-- Unlike submit_swap / submit_timeout, stop_game is a NEUTRAL ending:
-- reason `stopped`, outcome `neutral` (not waffle's own won/lost
-- verdicts), every player unranked and `neutral`. ended_at is set (so the
-- FE reveals the solution). A second click finds the game ended and is
-- the game-over race. Non-players are rejected by
-- common._require_game_player.

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(11);

-- ── Coop: manual end → ended, no winner ─────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club1 on commit drop as
select pg_temp.create_club('Waffle eg1', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select (waffle.create_game(
  (select handle from club1), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board()
)->'data'->>'id')::uuid as id;

select waffle.stop_game((select id from g1));

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g1)),
  'neutral',
  'coop: manual end → the game ends neutral');
select isnt(
  (select ended_at from common.games where id = (select id from g1)),
  null,
  'coop: manual end → ended_at set (reveals the solution)');
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g1)),
  'stopped/stopped',
  'coop: the reason is stopped');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g1)
      and final_ranking is null and outcome = 'neutral'),
  2::bigint,
  'coop: both players unranked, neutral');

-- Idempotent: a second stop_game raises (already ended).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  waffle.stop_game((select id from g1)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'coop: a second end on a finished game raises (idempotent)');

-- ── Compete: manual end → ended, no winner ──────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club2 on commit drop as
select pg_temp.create_club('Waffle eg2', array['ada', 'bea']) as handle;
create temp table g2 on commit drop as
select (waffle.create_game(
  (select handle from club2), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.waffle_board()
)->'data'->>'id')::uuid as id;

select waffle.stop_game((select id from g2));

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g2)),
  'neutral',
  'compete: manual end → the game ends neutral');
select isnt(
  (select ended_at from common.games where id = (select id from g2)),
  null,
  'compete: manual end → ended_at set');
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g2)),
  'stopped/stopped',
  'compete: the reason is stopped');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g2)
      and final_ranking is null and outcome = 'neutral'),
  2::bigint,
  'compete: both players unranked, neutral (no winner)');

-- Idempotent: a second stop_game raises (already ended).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  waffle.stop_game((select id from g2)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'compete: a second end on a finished game raises (idempotent)');

-- ── Non-player rejected ─────────────────────────────────────
-- dee is not a member/player of g2 → _require_game_player rejects.
-- (Use a fresh game being played so the rejection isn't masked by the
-- game-over race above.)
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club3 on commit drop as
select pg_temp.create_club('Waffle eg3', array['ada', 'bea']) as handle;
create temp table g3 on commit drop as
select (waffle.create_game(
  (select handle from club3), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board()
)->'data'->>'id')::uuid as id;

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  waffle.stop_game((select id from g3)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot end the game');

select * from finish();
rollback;
