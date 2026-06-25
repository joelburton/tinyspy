-- ============================================================
-- Test: monkeygram.dump(target_game, tile)
-- ============================================================
-- Swap one held tile for dump_count (default 3) from the bunch. Covers:
--   1. Happy path (return-to-bag, default): tiles −1 +3 (net +2); pool −3 +1;
--      the dumped tile lands at the BACK of the pool (so it can't be the tile
--      just drawn); progress.unplaced + status.pool_remaining track it
--   2. dump_to_box on: same hand math, but the dumped tile is OUT OF PLAY
--      (pool nets −3, not −2) — the game shrinks by one tile
--   3. Can't dump a tile you don't hold
--   4. Can't dump when the bunch is too small (< dump_count)
--   5. Non-players rejected
-- ============================================================

begin;

set search_path = monkeygram, common, public, extensions;

select plan(11);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea']) as handle;

-- 2 players, hand_size 21 → pool = 144 − 42 = 102, dump_count = 3.
create temp table g1 on commit drop as
select * from monkeygram.create_game(
  (select handle from club),
  '{"hand_size": 21, "bag_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- ─── Happy path: ada dumps one tile she holds ───
-- Capture the tile she'll dump (her first held tile) so we can assert it ends
-- up at the back of the bunch.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table dumped on commit drop as
select left(tiles, 1) as letter
  from monkeygram.player_boards
 where game_id = (select id from g1)
   and user_id = 'ada11111-1111-1111-1111-111111111111';

select monkeygram.dump((select id from g1), (select letter from dumped));

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select length(tiles) from monkeygram.player_boards
    where game_id = (select id from g1)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  23,
  'dumping swaps 1 for 3 (21 → 23 tiles)'
);
select is(
  (select length(pool) from monkeygram.games where id = (select id from g1)),
  100,
  'the bunch nets −2 (drew 3, returned 1: 102 → 100)'
);
-- The dumped tile is appended to the back, never among the freshly drawn.
select is(
  (select right(pool, 1) from monkeygram.games where id = (select id from g1)),
  (select letter from dumped),
  'the dumped tile is returned to the BACK of the bunch'
);
select is(
  (select unplaced from monkeygram.progress
    where game_id = (select id from g1)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  23,
  'progress.unplaced grew by dump_count − 1 (21 → 23)'
);
select is(
  (select (status->>'pool_remaining')::int from common.games where id = (select id from g1)),
  100,
  'status.pool_remaining tracks the bunch'
);

-- ─── dump_to_box: the dumped tile leaves play ───
-- A fresh game with dump_to_box on. The hand math is unchanged (−1 +3), but
-- the bunch loses a full 3 (nothing returned) — the game is one tile smaller.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from monkeygram.create_game(
  (select handle from club),
  '{"hand_size": 21, "bag_size": 144, "dump_to_box": true, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);
select monkeygram.dump((select id from g2),
  (select left(tiles, 1) from monkeygram.player_boards
    where game_id = (select id from g2)
      and user_id = 'ada11111-1111-1111-1111-111111111111'));

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select length(tiles) from monkeygram.player_boards
    where game_id = (select id from g2)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  23,
  'dump_to_box: the hand still swaps 1 for 3 (21 → 23)'
);
select is(
  (select length(pool) from monkeygram.games where id = (select id from g2)),
  99,
  'dump_to_box: the bunch nets −3 (drew 3, returned 0: 102 → 99) — one tile out of play'
);
select is(
  (select (status->>'pool_remaining')::int from common.games where id = (select id from g2)),
  99,
  'dump_to_box: status.pool_remaining reflects the shrunk bunch'
);

-- ─── Can't dump a tile you don't hold ───
-- Find a letter ada doesn't currently hold and try to dump it.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select monkeygram.dump(%L, %L) $$,
    (select id from g1),
    (select chr(c) from generate_series(65, 90) as c
       where position(chr(c) in (select tiles from monkeygram.player_boards
              where game_id = (select id from g1)
                and user_id = 'ada11111-1111-1111-1111-111111111111')) = 0
       limit 1)),
  'P0001',
  'you do not hold that tile',
  'cannot dump a tile you do not hold'
);

-- ─── Non-player rejected ───
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select monkeygram.dump(%L, 'A') $$, (select id from g1)),
  '42501',
  'not playing this game',
  'a non-player cannot dump'
);

-- ─── Bunch too small to dump ───
reset role;
select set_config('request.jwt.claims', '', true);
update monkeygram.games set pool = 'AB' where id = (select id from g1); -- 2 < dump_count 3

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select monkeygram.dump(%L, 'A') $$, (select id from g1)),
  'P0001',
  'not enough tiles in the bunch to dump',
  'cannot dump when the bunch is smaller than dump_count'
);

select * from finish();
rollback;
