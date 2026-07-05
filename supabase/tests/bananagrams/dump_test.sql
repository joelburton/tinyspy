-- ============================================================
-- Test: bananagrams.dump(target_game, tile)
-- ============================================================
-- Swap one held tile for dump_count (default 3) from the bunch. Covers:
--   1. Happy path (return-to-bag, default): tiles −1 +3 (net +2); bunch −3 +1;
--      the dumped tile lands at the BACK of the bunch (so it can't be the tile
--      just drawn); progress.unplaced + status.bunch_remaining track it
--   2. dump_to_bag on: same hand math, but the dumped tile goes to the BAG
--      (bunch nets −3; bag +1)
--   3. dump_to_bag + short bunch: the draw tops up from the bag front, dumped
--      tile to the bag back
--   4. return-to-bag + short bunch + a non-empty bag (the bunch_size leftover):
--      the draw still taps the bag, but the dumped tile returns to the bag
--   5. Can't dump a tile you don't hold
--   6. Can't dump when bunch + bag is too small (< dump_count)
--   7. Non-players rejected
-- ============================================================

begin;

set search_path = bananagrams, common, public, extensions;

select plan(17);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea']) as handle;

-- 2 players, hand_size 21 → bunch = 144 − 42 = 102, dump_count = 3.
create temp table g1 on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
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
  (select length(bunch) from bananagrams.games where id = (select id from g1)),
  100,
  'the bunch nets −2 (drew 3, returned 1: 102 → 100)'
);
-- The dumped tile is appended to the back, never among the freshly drawn.
select is(
  (select right(bunch, 1) from bananagrams.games where id = (select id from g1)),
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
  (select (status->>'bunch_remaining')::int from common.games where id = (select id from g1)),
  100,
  'status.bunch_remaining tracks the bunch'
);

-- ─── dump_to_bag: the dumped tile goes to the bag ───
-- A fresh game with dump_to_bag on. The hand math is unchanged (−1 +3), but
-- the dumped tile goes to the BAG instead of back to the bunch — so the bunch
-- nets −3 (not −2) and the bag grows by one.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "dump_to_bag": true, "timer": {"kind": "none"}}'::jsonb,
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
  'dump_to_bag: the hand still swaps 1 for 3 (21 → 23)'
);
select is(
  (select length(bunch) from bananagrams.games where id = (select id from g2)),
  99,
  'dump_to_bag: the bunch nets −3 (drew 3 from it, returned 0: 102 → 99)'
);
select is(
  (select length(bag) from bananagrams.games where id = (select id from g2)),
  1,
  'dump_to_bag: the dumped tile lands in the bag (bag 0 → 1)'
);
select is(
  (select (status->>'bag_remaining')::int from common.games where id = (select id from g2)),
  1,
  'dump_to_bag: status.bag_remaining surfaces the bag count to the FE'
);

-- ─── dump_to_bag: a short bunch tops up from the bag ───
-- With the bunch nearly empty but the bag stocked, a dump draws what's left of
-- the bunch then the rest from the FRONT of the bag; the dumped tile goes to
-- the BACK of the bag. Crafted state: bunch='A' (1), bag='XYZ' (3), ada holds Q.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "dump_to_bag": true, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);
reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.games set bunch = 'A', bag = 'XYZ' where id = (select id from g3);
update bananagrams.player_boards set tiles = 'Q'
 where game_id = (select id from g3) and user_id = 'ada11111-1111-1111-1111-111111111111';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.dump((select id from g3), 'Q');

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select length(bunch) from bananagrams.games where id = (select id from g3)),
  0,
  'short-bunch dump drains the bunch (1 → 0)'
);
select is(
  (select bag from bananagrams.games where id = (select id from g3)),
  'ZQ',
  'it drew XY off the bag front (Z left) and appended the dumped Q to the back → ZQ'
);
select is(
  (select (status->>'bag_remaining')::int from common.games where id = (select id from g3)),
  2,
  'status.bag_remaining tracks the bag (3 − 2 drawn + 1 dumped = 2)'
);

-- ─── return-to-bag also taps the bag (the leftover from a reduced bag) ───
-- A return-to-bag game can have a non-empty bag too (bunch_size < 144 puts the
-- remainder there). A short-bunch dump draws off the bag front and the bag
-- shrinks; the dumped tile returns to the BAG, not the bag. Crafted: bunch='A',
-- bag='XYZ', ada holds Q.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g4 on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "dump_to_bag": false, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);
reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.games set bunch = 'A', bag = 'XYZ' where id = (select id from g4);
update bananagrams.player_boards set tiles = 'Q'
 where game_id = (select id from g4) and user_id = 'ada11111-1111-1111-1111-111111111111';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.dump((select id from g4), 'Q');

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select bag from bananagrams.games where id = (select id from g4)),
  'Z',
  'return-to-bag: the bag shrinks as the draw taps it (XYZ − XY = Z)'
);
select is(
  (select bunch from bananagrams.games where id = (select id from g4)),
  'Q',
  'return-to-bag: the dumped tile returns to the BAG, not the bag'
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

-- ─── Bunch (+ bag) too small to dump ───
-- g1 is return-to-bag, so its bag is empty: bunch+bag = 2 < dump_count 3.
reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.games set bunch = 'AB' where id = (select id from g1); -- 2 < dump_count 3

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select bananagrams.dump(%L, 'A') $$, (select id from g1)),
  'P0001',
  'not enough tiles to dump',
  'cannot dump when bunch + bag is smaller than dump_count'
);

select * from finish();
rollback;
