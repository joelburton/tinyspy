-- cs-blessed-connections

-- ============================================================
-- Test: connections.stop_game — the manual "Stop game" ending
-- ============================================================
--
-- stop_game is the per-game menu's "Stop game" action. Unlike
-- submit_guess (which decides a winner/loser) or submit_timeout
-- (which ends the game lost), stop_game is the NEUTRAL stop: the
-- friends agreed to quit, so nobody won and nobody lost. It ends the
-- game with:
--   - reason `stopped`/'stopped', outcome `neutral`
--   - the caller as who ended it
--   - every player unranked and `neutral`
-- in BOTH modes (the per-player result is identical coop vs
-- compete — there's nothing "achieved" to snapshot).
--
-- Coverage (both modes):
--   - stop_game → ended_at set, outcome neutral
--   - reason stopped, ended by the caller
--   - every player unranked and neutral
--   - idempotency: a second call is the game-over race
--   - auth: a club outsider is rejected (PN253) via
--     _require_game_player
--
-- See ../codenamesduet/create_game_test.sql for the pgTAP / auth-
-- simulation primer; ../spellingbee/gameplay_test.sql for the
-- structurally-identical spellingbee.stop_game test.

begin;

set search_path = connections, common, public, extensions;

select plan(11);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- Set up: ada + bea club, one coop game + one compete game from
-- the fixture puzzle, both in progress.
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada and Bea', array['ada','bea']) as handle;
create temp table puzzle on commit drop as
select pg_temp.connections_puzzle() as id;

create temp table g_coop on commit drop as
select (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;

create temp table g_compete on commit drop as
select (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

-- ============================================================
-- (1)–(5) coop stop_game: neutral ending, no winner
-- ============================================================

select connections.stop_game((select id from g_coop));

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g_coop)),
  'neutral',
  'coop stop_game: the game ends neutral'
);

select isnt(
  (select ended_at from common.games where id = (select id from g_coop)),
  null,
  'coop stop_game: ended_at is set'
);

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g_coop)),
  'stopped/stopped',
  'coop stop_game: reason stopped (distinguishes from timeout/solve)'
);

select is(
  (select game_ended_by_user_id from common.games where id = (select id from g_coop)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'coop stop_game: the caller ended it'
);

select is(
  (
    select count(*) from common.game_players
     where game_id = (select id from g_coop)
       and final_ranking is null and outcome = 'neutral'
  ),
  2::bigint,
  'coop stop_game: every player is unranked and neutral (friends agreed to stop)'
);

-- ============================================================
-- (6) coop idempotency: a second call is the game-over race
-- ============================================================
-- Ending twice in quick succession (or racing a solve / timeout) is
-- harmless.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  connections.stop_game((select id from g_coop)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'coop stop_game: second call is the game-over race');

-- ============================================================
-- (7)–(10) compete stop_game: same neutral ending, no winner
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select connections.stop_game((select id from g_compete));

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g_compete)),
  'neutral',
  'compete stop_game: the game ends neutral'
);

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g_compete)),
  'stopped/stopped',
  'compete stop_game: reason stopped'
);

select is(
  (select game_ended_by_user_id from common.games where id = (select id from g_compete)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'compete stop_game: the caller ended it'
);

select is(
  (
    select count(*) from common.game_players
     where game_id = (select id from g_compete)
       and final_ranking is null and outcome = 'neutral'
  ),
  2::bigint,
  'compete stop_game: every player is unranked and neutral (no winner on manual end)'
);

-- ============================================================
-- (11) auth: a club outsider cannot end a game they're not in
-- ============================================================
-- _require_game_player treats stop_game the same as submit_guess —
-- dee is not a player on a fresh game, so PN253. (We use a fresh
-- game because both games above have ended and would answer the
-- game-over race before the auth gate's effect is observable here.)

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_auth on commit drop as
select (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  connections.stop_game((select id from g_auth)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'stop_game: non-player (dee, outsider) is rejected with PN253');

-- ============================================================
select * from finish();
rollback;
