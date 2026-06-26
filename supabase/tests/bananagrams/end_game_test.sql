-- ============================================================
-- Test: bananagrams.end_game(target_game)
-- ============================================================
-- The manual stop. bananagrams's only intrinsic terminal is the
-- peel-win; this lets the friends quit a stale race before anyone
-- goes out. Covers:
--   1. ANY player can end it (bea ends, not just the "owner")
--   2. Terminal shape: play_state 'ended', is_terminal,
--      status.outcome 'manual', NO winner
--   3. Every player's result is {"won": false} — nobody wins
--   4. Idempotency: a second end raises P0001
--   5. Non-players rejected
-- ============================================================

begin;

set search_path = bananagrams, common, public, extensions;

select plan(8);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea']) as handle;

-- 2-player compete game (bananagrams is compete-only; no mode arg).
create temp table g1 on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bag_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- (1) ANY player can end — bea (who didn't create the game) ends it.
-- No empty-hand gate (unlike peel): a manual stop works mid-build.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format($$ select bananagrams.end_game(%L) $$, (select id from g1)),
  'any game player can end the game'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- (2) Terminal shape.
select is(
  (select play_state from common.games where id = (select id from g1)),
  'ended',
  'play_state is ended (not won — nobody went out)'
);
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  true,
  'the game is terminal'
);
select is(
  (select status->>'outcome' from common.games where id = (select id from g1)),
  'manual',
  'status.outcome is manual'
);

-- (3) Every player's result is {"won": false} — no winner.
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

-- (4) Idempotency: a second end (or a click racing a peel-win) is rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select bananagrams.end_game(%L) $$, (select id from g1)),
  'P0001',
  'game is not in progress',
  'ending an already-ended game is rejected'
);

-- (5) Non-player cannot end.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select bananagrams.end_game(%L) $$, (select id from g1)),
  '42501',
  'not playing this game',
  'a non-player cannot end the game'
);

select * from finish();
rollback;
