-- ============================================================
-- Test: connections.end_game — manual "End game" terminal
-- ============================================================
--
-- end_game is the per-game menu's "End game" action. Unlike
-- submit_guess (which decides a winner/loser) or submit_timeout
-- (which writes a "you lost" timeout terminal), end_game is the
-- NEUTRAL stop: the friends agreed to quit, so nobody won and
-- nobody lost. It writes:
--   - play_state = 'ended'
--   - status = {outcome:'manual', mode:<coop|compete>}
--   - every player's game_players.result = {"won": false}
-- in BOTH modes (the per-player result is identical coop vs
-- compete — there's nothing "achieved" to snapshot).
--
-- Coverage (both modes):
--   - end_game → play_state 'ended', is_terminal true
--   - status.outcome='manual', status.mode echoes g_row.mode
--   - every player gets {"won": false}
--   - idempotency: a second call raises P0001 'game is not in
--     progress' (the FE swallows it on the End-game-twice race)
--   - auth: a club outsider is rejected with 42501 via
--     require_game_player
--
-- See ../tinyspy/create_game_test.sql for the pgTAP / auth-
-- simulation primer; ../freebee/gameplay_test.sql for the
-- structurally-identical freebee.end_game test.

begin;

set search_path = connections, common, public, extensions;

select plan(11);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up: ada + bea club, one coop game + one compete game from
-- the fixture puzzle, both in progress.
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;
create temp table puzzle on commit drop as
select pg_temp.connections_puzzle() as id;

create temp table g_coop on commit drop as
select * from connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);

create temp table g_compete on commit drop as
select * from connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);

-- ============================================================
-- (1)–(5) coop end_game: neutral terminal, no winner
-- ============================================================

select connections.end_game((select id from g_coop));

reset role;
select is(
  (select play_state from common.games where id = (select id from g_coop)),
  'ended',
  'coop end_game: play_state flips to "ended"'
);

select is(
  (select is_terminal from common.games where id = (select id from g_coop)),
  true,
  'coop end_game: is_terminal=true'
);

select is(
  (select status->>'outcome' from common.games where id = (select id from g_coop)),
  'manual',
  'coop end_game: status.outcome=manual (distinguishes from timeout/solve)'
);

select is(
  (select status->>'mode' from common.games where id = (select id from g_coop)),
  'coop',
  'coop end_game: status.mode echoes the game mode'
);

select is(
  (
    select count(*) from common.game_players
     where game_id = (select id from g_coop)
       and (result->>'won') = 'false'
  ),
  2::bigint,
  'coop end_game: every player gets {won: false} (friends agreed to stop)'
);

-- ============================================================
-- (6) coop idempotency: a second call raises P0001
-- ============================================================
-- Clicking "End game" twice in quick succession (or racing a
-- solve / timeout) is harmless — the FE swallows P0001.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select connections.end_game(%L::uuid) $$, (select id from g_coop)),
  'P0001',
  'game is not in progress',
  'coop end_game: second call raises P0001 (idempotent at the FE-swallow layer)'
);

-- ============================================================
-- (7)–(10) compete end_game: same neutral terminal, no winner
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select connections.end_game((select id from g_compete));

reset role;
select is(
  (select play_state from common.games where id = (select id from g_compete)),
  'ended',
  'compete end_game: play_state flips to "ended"'
);

select is(
  (select status->>'outcome' from common.games where id = (select id from g_compete)),
  'manual',
  'compete end_game: status.outcome=manual'
);

select is(
  (select status->>'mode' from common.games where id = (select id from g_compete)),
  'compete',
  'compete end_game: status.mode echoes the game mode'
);

select is(
  (
    select count(*) from common.game_players
     where game_id = (select id from g_compete)
       and (result->>'won') = 'false'
  ),
  2::bigint,
  'compete end_game: every player gets {won: false} (no winner on manual end)'
);

-- ============================================================
-- (11) auth: a club outsider cannot end a game they're not in
-- ============================================================
-- require_game_player treats end_game the same as submit_guess —
-- dee is not a player on a fresh game, so 42501. (We use a fresh
-- game because both games above are now terminal and would
-- short-circuit on the play_state check before the auth gate's
-- effect is observable here.)

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_auth on commit drop as
select * from connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select connections.end_game(%L::uuid) $$, (select id from g_auth)),
  '42501',
  'not playing this game',
  'end_game: non-player (dee, outsider) is rejected with 42501'
);

-- ============================================================
select * from finish();
rollback;
