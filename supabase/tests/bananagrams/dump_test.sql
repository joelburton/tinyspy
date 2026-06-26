-- ============================================================
-- Test: bananagrams.dump(target_game, tile)
-- ============================================================
-- Swap one held tile for dump_count (default 3) from the bunch. Covers:
--   1. Happy path (return-to-bag, default): tiles −1 +3 (net +2); pool −3 +1;
--      the dumped tile lands at the BACK of the pool (so it can't be the tile
--      just drawn); progress.unplaced + status.pool_remaining track it
--   2. dump_to_box on: same hand math, but the dumped tile goes to the BOX
--      (bunch nets −3; box +1)
--   3. dump_to_box + short bunch: the draw tops up from the box front, dumped
--      tile to the box back
--   4. return-to-bag + short bunch + a non-empty box (the bag_size leftover):
--      the draw still taps the box, but the dumped tile returns to the bag
--   5. Can't dump a tile you don't hold
--   6. Can't dump when bunch + box is too small (< dump_count)
--   7. Non-players rejected
-- ============================================================

begin;

set search_path = bananagrams, common, public, extensions;

select plan(17);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea']) as handle;

-- 2 players, hand_size 21 → pool = 144 − 42 = 102, dump_count = 3.
create temp table g1 on commit drop as
select * from bananagrams.create_game(
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
  from bananagrams.player_boards
 where game_id = (select id from g1)
   and user_id = 'ada11111-1111-1111-1111-111111111111';

select bananagrams.dump((select id from g1), (select letter from dumped));

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select length(tiles) from bananagrams.player_boards
    where game_id = (select id from g1)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  23,
  'dumping swaps 1 for 3 (21 → 23 tiles)'
);
select is(
  (select length(pool) from bananagrams.games where id = (select id from g1)),
  100,
  'the bunch nets −2 (drew 3, returned 1: 102 → 100)'
);
-- The dumped tile is appended to the back, never among the freshly drawn.
select is(
  (select right(pool, 1) from bananagrams.games where id = (select id from g1)),
  (select letter from dumped),
  'the dumped tile is returned to the BACK of the bunch'
);
select is(
  (select unplaced from bananagrams.progress
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

-- ─── dump_to_box: the dumped tile goes to the box ───
-- A fresh game with dump_to_box on. The hand math is unchanged (−1 +3), but
-- the dumped tile goes to the BOX instead of back to the bunch — so the bunch
-- nets −3 (not −2) and the box grows by one.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bag_size": 144, "dump_to_box": true, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);
select bananagrams.dump((select id from g2),
  (select left(tiles, 1) from bananagrams.player_boards
    where game_id = (select id from g2)
      and user_id = 'ada11111-1111-1111-1111-111111111111'));

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select length(tiles) from bananagrams.player_boards
    where game_id = (select id from g2)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  23,
  'dump_to_box: the hand still swaps 1 for 3 (21 → 23)'
);
select is(
  (select length(pool) from bananagrams.games where id = (select id from g2)),
  99,
  'dump_to_box: the bunch nets −3 (drew 3 from it, returned 0: 102 → 99)'
);
select is(
  (select length(box) from bananagrams.games where id = (select id from g2)),
  1,
  'dump_to_box: the dumped tile lands in the box (box 0 → 1)'
);
select is(
  (select (status->>'box_remaining')::int from common.games where id = (select id from g2)),
  1,
  'dump_to_box: status.box_remaining surfaces the box count to the FE'
);

-- ─── dump_to_box: a short bunch tops up from the box ───
-- With the bunch nearly empty but the box stocked, a dump draws what's left of
-- the bunch then the rest from the FRONT of the box; the dumped tile goes to
-- the BACK of the box. Crafted state: pool='A' (1), box='XYZ' (3), ada holds Q.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bag_size": 144, "dump_to_box": true, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);
reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.games set pool = 'A', box = 'XYZ' where id = (select id from g3);
update bananagrams.player_boards set tiles = 'Q'
 where game_id = (select id from g3) and user_id = 'ada11111-1111-1111-1111-111111111111';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.dump((select id from g3), 'Q');

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select length(pool) from bananagrams.games where id = (select id from g3)),
  0,
  'short-bunch dump drains the bunch (1 → 0)'
);
select is(
  (select box from bananagrams.games where id = (select id from g3)),
  'ZQ',
  'it drew XY off the box front (Z left) and appended the dumped Q to the back → ZQ'
);
select is(
  (select (status->>'box_remaining')::int from common.games where id = (select id from g3)),
  2,
  'status.box_remaining tracks the box (3 − 2 drawn + 1 dumped = 2)'
);

-- ─── return-to-bag also taps the box (the leftover from a reduced bag) ───
-- A return-to-bag game can have a non-empty box too (bag_size < 144 puts the
-- remainder there). A short-bunch dump draws off the box front and the box
-- shrinks; the dumped tile returns to the BAG, not the box. Crafted: pool='A',
-- box='XYZ', ada holds Q.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g4 on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bag_size": 144, "dump_to_box": false, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);
reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.games set pool = 'A', box = 'XYZ' where id = (select id from g4);
update bananagrams.player_boards set tiles = 'Q'
 where game_id = (select id from g4) and user_id = 'ada11111-1111-1111-1111-111111111111';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.dump((select id from g4), 'Q');

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select box from bananagrams.games where id = (select id from g4)),
  'Z',
  'return-to-bag: the box shrinks as the draw taps it (XYZ − XY = Z)'
);
select is(
  (select pool from bananagrams.games where id = (select id from g4)),
  'Q',
  'return-to-bag: the dumped tile returns to the BAG, not the box'
);

-- ─── Can't dump a tile you don't hold ───
-- Find a letter ada doesn't currently hold and try to dump it.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select bananagrams.dump(%L, %L) $$,
    (select id from g1),
    (select chr(c) from generate_series(65, 90) as c
       where position(chr(c) in (select tiles from bananagrams.player_boards
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
  format($$ select bananagrams.dump(%L, 'A') $$, (select id from g1)),
  '42501',
  'not playing this game',
  'a non-player cannot dump'
);

-- ─── Bunch (+ box) too small to dump ───
-- g1 is return-to-bag, so its box is empty: bunch+box = 2 < dump_count 3.
reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.games set pool = 'AB' where id = (select id from g1); -- 2 < dump_count 3

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select bananagrams.dump(%L, 'A') $$, (select id from g1)),
  'P0001',
  'not enough tiles to dump',
  'cannot dump when bunch + box is smaller than dump_count'
);

select * from finish();
rollback;
