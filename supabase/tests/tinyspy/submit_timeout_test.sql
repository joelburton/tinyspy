-- ============================================================
-- Test: tinyspy.submit_timeout — wall-clock countdown expired
-- ============================================================
--
-- Mirrors wordknit / psychicnum: the FE fires this RPC when its
-- count-down timer hits 0. The server-side gate is the
-- non-terminal-play_state check; play_state flips to 'lost_timeout' and
-- common.end_game records outcome='lost_timeout'. Idempotent on
-- the gate — a second call (e.g. a peer's racing tab) raises
-- a clean P0001 the FE silently swallows.
--
-- Coverage:
--   - happy path from playing: play_state → lost_timeout, ended_at set
--   - happy path from sudden_death (the other non-terminal state)
--   - idempotency: second call on a terminal game is rejected
--   - require_game_player: non-player is rejected
--
-- See ../tinyspy/create_game_test.sql for the pgTAP primer.
-- ============================================================

begin;

set search_path = tinyspy, common, public, extensions;

select plan(8);

\ir ../_shared/setup.psql
\ir setup.psql

-- 2-member club; ada + bea are seated. dee is signed in but
-- outside the club / not playing the game.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

-- ============================================================
-- (1) Happy path: playing → lost_timeout via submit_timeout
-- ============================================================

create temp table g on commit drop as
select * from tinyspy.create_game(
  (select handle from club),
  -- Setup includes a 10-minute countdown timer so the
  -- gametype-specific row reflects "timer was configured";
  -- the RPC itself doesn't actually wait for time to pass.
  jsonb_build_object(
    'turns', 9,
    'firstClueGiverUserId', 'ada11111-1111-1111-1111-111111111111',
    'timer', jsonb_build_object('kind', 'countdown', 'seconds', 600)
  ),
  pg_temp.tinyspy_players()
);

select lives_ok(
  format(
    $$ select tinyspy.submit_timeout(%L::uuid) $$,
    (select id from g)
  ),
  'submit_timeout: playing game accepts the call'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'lost_timeout',
  'submit_timeout: flips play_state to lost_timeout'
);

-- end_game marks the common.games row terminal.
select is(
  (select is_terminal from common.games where id = (select id from g)),
  true,
  'submit_timeout: end_game sets is_terminal=true on the common header'
);

-- Status outcome carried through to common.games.
select is(
  (select status->>'outcome' from common.games
    where id = (select id from g)),
  'lost_timeout',
  'submit_timeout: status.outcome = lost_timeout'
);

-- ============================================================
-- (2) Idempotency — second call rejected
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format(
    $$ select tinyspy.submit_timeout(%L::uuid) $$,
    (select id from g)
  ),
  'P0001',
  'game is not active',
  'submit_timeout: rejects on already-terminal games'
);

-- ============================================================
-- (3) Non-player rejected (require_game_player gate)
-- ============================================================
-- dee is signed in but isn't in common.game_players for this
-- game — the player roster is frozen at create_game time. Use a
-- fresh game so the active-state guard doesn't fire first.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from tinyspy.create_game(
  (select handle from club),
  pg_temp.tinyspy_setup(9),
  pg_temp.tinyspy_players()
);

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select tinyspy.submit_timeout(%L::uuid) $$,
    (select id from g2)
  ),
  '42501',
  'not playing this game',
  'submit_timeout: non-player rejected via require_game_player'
);

-- ============================================================
-- (4) Happy path from sudden_death
-- ============================================================
-- tinyspy's other non-terminal play_state is `sudden_death`. The
-- timer can expire in that state too — submit_timeout should
-- still flip to lost_timeout.

reset role;
update common.games set play_state = 'sudden_death'
 where id = (select id from g2);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format(
    $$ select tinyspy.submit_timeout(%L::uuid) $$,
    (select id from g2)
  ),
  'submit_timeout: sudden_death game accepts the call'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'lost_timeout',
  'submit_timeout: sudden_death → lost_timeout (not lost_clock)'
);

-- ============================================================
select * from finish();
rollback;
