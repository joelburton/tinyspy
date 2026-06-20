-- ============================================================
-- Test: monkeygram.peel(target_game)
-- ============================================================
-- The v2 draw/endgame. Covers:
--   1. Empty hand required — peeling with tiles in hand is rejected
--   2. Continue path: enough bunch → EVERY player draws peel_count, the
--      pool advances, progress + status.pool_remaining update
--   3. Non-players rejected
--   4. Win path: bunch can't refill the table → the peeler goes out and wins
--   5. Race: a peel after the game is over is rejected
-- ============================================================

begin;

set search_path = monkeygram, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea']) as handle;

-- ─── Game 1: 2 players, hand_size 21. pool = 144 − 42 = 102, needed = 2 ───
create temp table g1 on commit drop as
select * from monkeygram.create_game(
  (select handle from club),
  '{"hand_size": 21, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- (1) Tiles still in hand → peel rejected (ada's board is empty).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select monkeygram.peel(%L) $$, (select id from g1)),
  'P0001',
  'your hand is not empty',
  'cannot peel with tiles still in hand'
);

-- ada places all 21 of her REAL tiles (board = her tiles + padding), then peels.
select monkeygram.save_player_board(
  (select id from g1),
  (select tiles || repeat('.', 25 * 25 - length(tiles))
     from monkeygram.player_boards
    where game_id = (select id from g1)
      and user_id = 'ada11111-1111-1111-1111-111111111111')
);
select monkeygram.peel((select id from g1));

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select length(tiles) from monkeygram.player_boards
    where game_id = (select id from g1)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  22,
  'the peeler drew 1 tile too (21 → 22)'
);
select is(
  (select length(tiles) from monkeygram.player_boards
    where game_id = (select id from g1)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  22,
  'every other player also drew 1 (bea 21 → 22)'
);
select is(
  (select length(pool) from monkeygram.games where id = (select id from g1)),
  100,
  'the bunch advanced by players × peel_count (102 → 100)'
);
select is(
  (select unplaced from monkeygram.progress
    where game_id = (select id from g1)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1,
  'peeler unplaced = the freshly drawn tile (placed 21, holds 22)'
);
select is(
  (select unplaced from monkeygram.progress
    where game_id = (select id from g1)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  22,
  'bea unplaced grew by the draw (21 → 22)'
);
select is(
  (select (status->>'pool_remaining')::int from common.games where id = (select id from g1)),
  100,
  'status.pool_remaining tracks the bunch for the FE'
);

-- (3) Non-player cannot peel.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select monkeygram.peel(%L) $$, (select id from g1)),
  '42501',
  'not playing this game',
  'a non-player cannot peel'
);

-- ─── Game 2: solo ada (needed = 1). Drain the bunch, then peel = win ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from monkeygram.create_game(
  '=ada',
  '{"hand_size": 15, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]
);

-- ada places all 15 tiles (empty hand).
select monkeygram.save_player_board(
  (select id from g2),
  (select tiles || repeat('.', 25 * 25 - length(tiles))
     from monkeygram.player_boards
    where game_id = (select id from g2)
      and user_id = 'ada11111-1111-1111-1111-111111111111')
);

-- Empty the bunch so the next peel can't refill → going out wins.
reset role;
select set_config('request.jwt.claims', '', true);
update monkeygram.games set pool = '' where id = (select id from g2);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select monkeygram.peel((select id from g2));

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select play_state from common.games where id = (select id from g2)),
  'won',
  'peeling a dry bunch with an empty hand wins (Bananas!)'
);
select is(
  (select status->>'winner_username' from common.games where id = (select id from g2)),
  'ada',
  'status.winner_username is the peeler'
);
select is(
  (select result->>'won' from common.game_players
    where game_id = (select id from g2)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'true',
  'winner game_players result is won:true'
);

-- (5) Race: peeling an already-won game is rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select monkeygram.peel(%L) $$, (select id from g2)),
  'P0001',
  'game is not active',
  'peeling after the game is over is rejected'
);

select * from finish();
rollback;
