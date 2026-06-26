-- ============================================================
-- Test: bananagrams.submit_timeout(target_game)
-- ============================================================
-- The countdown-expiry terminal. bananagrams is a race, so time running
-- out with nobody out is a COLLECTIVE loss. Fired by GamePage when a
-- chosen countdown hits 0; the RPC itself is timer-agnostic (it just
-- ends the in-progress game). Covers:
--   1. ANY player can fire it (bea, who didn't create the game)
--   2. Terminal shape: play_state 'lost', is_terminal,
--      status.outcome 'timeout', NO winner_username
--   3. Every player's result is {"won": false} — everyone lost
--   4. Idempotency: a second call (or a click racing a peel-win) → P0001
--   5. Non-players rejected
-- Mirror of end_game_test, but the loss-on-time variant.
-- ============================================================

begin;

set search_path = bananagrams, common, public, extensions;

select plan(8);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea']) as handle;

-- 2-player game started WITH a countdown (the realistic setup for a
-- timeout, though submit_timeout doesn't inspect the timer).
create temp table g1 on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bag_size": 144, "timer": {"kind": "countdown", "seconds": 300}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- (1) ANY player can fire it — bea (who didn't create the game).
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format($$ select bananagrams.submit_timeout(%L) $$, (select id from g1)),
  'any game player can fire the timeout'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- (2) Terminal shape: a no-winner LOSS (distinct from end_game's 'ended').
select is(
  (select play_state from common.games where id = (select id from g1)),
  'lost',
  'play_state is lost (everyone lost — time ran out)'
);
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  true,
  'the game is terminal'
);
select is(
  (select status->>'outcome' from common.games where id = (select id from g1)),
  'timeout',
  'status.outcome is timeout'
);

-- (3) Every player's result is {"won": false} — nobody went out in time.
select is(
  (select result->>'won' from common.game_players
    where game_id = (select id from g1)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'false',
  'ada result is won:false'
);
select is(
  (select result->>'won' from common.game_players
    where game_id = (select id from g1)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'false',
  'bea result is won:false'
);

-- (4) Idempotency: a second timeout (or a click racing a peel-win) is rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select bananagrams.submit_timeout(%L) $$, (select id from g1)),
  'P0001',
  'game is not in progress',
  'timing out an already-terminal game is rejected'
);

-- (5) Non-player cannot fire it.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select bananagrams.submit_timeout(%L) $$, (select id from g1)),
  '42501',
  'not playing this game',
  'a non-player cannot fire the timeout'
);

select * from finish();
rollback;
