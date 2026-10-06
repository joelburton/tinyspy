-- cs-unmet

-- ============================================================
-- Test: bananagrams.dump(target_game, tile)
-- ============================================================
-- Swap one held tile for 3 from the bunch. Covers:
--   1. Happy path (return-to-bunch, default): tiles −1 +3 (net +2); bunch −3 +1;
--      the dumped tile lands at the BACK of the bunch (so it can't be the tile
--      just drawn); the blob's nUnplacedTiles and the summary's nBunchTiles
--      track it
--   2. dump_to_bag on: same hand math, but the dumped tile goes to the BAG
--      (bunch nets −3; bag +1), and the page reads the bag's count off the blob
--   3. dump_to_bag + short bunch: the draw tops up from the bag front, dumped
--      tile to the bag back
--   4. return-to-bunch + short bunch + a non-empty bag (the bunch_size
--      leftover): the draw still taps the bag, but the dumped tile returns to
--      the bunch
--   5. Can't dump a tile you don't hold
--   6. Can't dump when bunch + bag is too small (< 3)
--   7. Non-players rejected
--   8. A dump into a game deleted under it is the shared race (PN485)
-- ============================================================

begin;

set search_path = bananagrams, common, public, extensions;

select plan(22);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

-- A player's tiles and unplaced count, read where the page reads them: the
-- `tiles` column is out of the grant.
create function pg_temp.tiles_of(gid uuid, uid uuid) returns text language sql as $$
  select p->>'tiles' from common.games, jsonb_array_elements(game_data->'players') p
   where id = gid and (p->>'id')::uuid = uid
$$;
create function pg_temp.unplaced_of(gid uuid, uid uuid) returns int language sql as $$
  select (p->>'nUnplacedTiles')::int from common.games, jsonb_array_elements(game_data->'players') p
   where id = gid and (p->>'id')::uuid = uid
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada', 'bea']) as handle;

-- 2 players, hand_size 21 → bunch = 144 − 42 = 102; a dump draws 3.
create temp table g1 on commit drop as
select (bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
)->'data'->>'id')::uuid as id;

-- ─── Happy path: ada dumps one tile she holds ───
-- Capture the tile she'll dump (her first held tile) so we can assert it ends
-- up at the back of the bunch.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table dumped on commit drop as
select left(pg_temp.tiles_of((select id from g1), 'ada11111-1111-1111-1111-111111111111'), 1) as letter;

select pg_temp.envelope_is(
  bananagrams.dump((select id from g1), (select letter from dumped)),
  '{"type":"ok","data":{"result":"dumped"}}'::jsonb,
  'a return-to-bunch dump answers dumped'
);

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
  (select length(bunch) from bananagrams.games where game_id = (select id from g1)),
  100,
  'the bunch nets −2 (drew 3, returned 1: 102 → 100)'
);
-- The dumped tile is appended to the back, never among the freshly drawn.
select is(
  (select right(bunch, 1) from bananagrams.games where game_id = (select id from g1)),
  (select letter from dumped),
  'the dumped tile is returned to the BACK of the bunch'
);
select is(
  pg_temp.unplaced_of((select id from g1), 'ada11111-1111-1111-1111-111111111111'),
  23,
  'the blob''s nUnplacedTiles grew by 3 − 1 (21 → 23)'
);
select is(
  (select (summary_data->>'nBunchTiles')::int from common.games where id = (select id from g1)),
  100,
  'the summary''s nBunchTiles tracks the bunch'
);

-- ─── dump_to_bag: the dumped tile goes to the bag ───
-- A fresh game with dump_to_bag on. The hand math is unchanged (−1 +3), but
-- the dumped tile goes to the BAG instead of back to the bunch — so the bunch
-- nets −3 (not −2) and the bag grows by one.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "dump_to_bag": true, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
)->'data'->>'id')::uuid as id;
select pg_temp.envelope_is(
  bananagrams.dump((select id from g2),
    left(pg_temp.tiles_of((select id from g2), 'ada11111-1111-1111-1111-111111111111'), 1)),
  '{"type":"ok","data":{"result":"dumped"}}'::jsonb,
  'a to-bag dump answers dumped'
);

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
  (select length(bunch) from bananagrams.games where game_id = (select id from g2)),
  99,
  'dump_to_bag: the bunch nets −3 (drew 3 from it, returned 0: 102 → 99)'
);
select is(
  (select length(bag) from bananagrams.games where game_id = (select id from g2)),
  1,
  'dump_to_bag: the dumped tile lands in the bag (bag 0 → 1)'
);
-- The page reads the bag's count off the blob.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select (game_data->>'nBagTiles')::int from common.games where id = (select id from g2)),
  1,
  'dump_to_bag: a player reads the bag count off game_data'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- ─── dump_to_bag: a short bunch tops up from the bag ───
-- With the bunch nearly empty but the bag stocked, a dump draws what's left of
-- the bunch then the rest from the FRONT of the bag; the dumped tile goes to
-- the BACK of the bag. Crafted state: bunch='a' (1), bag='xyz' (3), ada holds q.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select (bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "dump_to_bag": true, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
)->'data'->>'id')::uuid as id;
reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.games set bunch = 'a', bag = 'xyz' where game_id = (select id from g3);
update bananagrams.player_boards set tiles = 'q'
 where game_id = (select id from g3) and user_id = 'ada11111-1111-1111-1111-111111111111';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  bananagrams.dump((select id from g3), 'q'),
  '{"type":"ok","data":{"result":"dumped"}}'::jsonb,
  'a dump topped up from the bag answers dumped'
);

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select length(bunch) from bananagrams.games where game_id = (select id from g3)),
  0,
  'short-bunch dump drains the bunch (1 → 0)'
);
select is(
  (select bag from bananagrams.games where game_id = (select id from g3)),
  'zq',
  'it drew xy off the bag front (z left) and appended the dumped q to the back → zq'
);
select is(
  (select length(bag) from bananagrams.games where game_id = (select id from g3)),
  2,
  'the bag count tracks the bag (3 − 2 drawn + 1 dumped = 2)'
);

-- ─── return-to-bunch also taps the bag (the leftover from a reduced bunch) ───
-- A return-to-bunch game can have a non-empty bag too (bunch_size < 144 puts
-- the remainder there). A short-bunch dump draws off the bag front and the bag
-- shrinks; the dumped tile returns to the BUNCH, not the bag. Crafted:
-- bunch='a', bag='xyz', ada holds q.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g4 on commit drop as
select (bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "dump_to_bag": false, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
)->'data'->>'id')::uuid as id;
reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.games set bunch = 'a', bag = 'xyz' where game_id = (select id from g4);
update bananagrams.player_boards set tiles = 'q'
 where game_id = (select id from g4) and user_id = 'ada11111-1111-1111-1111-111111111111';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  bananagrams.dump((select id from g4), 'q'),
  '{"type":"ok","data":{"result":"dumped"}}'::jsonb,
  'a return-to-bunch dump topped up from the bag answers dumped'
);

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select bag from bananagrams.games where game_id = (select id from g4)),
  'z',
  'return-to-bunch: the bag shrinks as the draw taps it (xyz − xy = z)'
);
select is(
  (select bunch from bananagrams.games where game_id = (select id from g4)),
  'q',
  'return-to-bunch: the dumped tile returns to the BUNCH, not the bag'
);

-- ─── Can't dump a tile you don't hold ───
-- Find a letter ada doesn't currently hold and try to dump it.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- A RACE, not a bug: `tiles` is server-owned while the board is FE-owned, so
-- the server's view of the hand can lag the screen's for a moment.
select pg_temp.envelope_is(
  bananagrams.dump(
    (select id from g1),
    (select chr(c) from generate_series(97, 122) as c
       where position(chr(c) in pg_temp.tiles_of((select id from g1), 'ada11111-1111-1111-1111-111111111111')) = 0
       limit 1)),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN348","message":"You don''t have that tile"}'::jsonb,
  'cannot dump a tile you do not hold'
);

-- ─── Non-player rejected ───
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  bananagrams.dump((select id from g1), 'a'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN253"}'::jsonb,
  'a non-player cannot dump'
);

-- ─── Bunch (+ bag) too small to dump ───
-- g1 is return-to-bunch, so its bag is empty: bunch+bag = 2 < the 3 a dump draws.
reset role;
select set_config('request.jwt.claims', '', true);
update bananagrams.games set bunch = 'ab' where game_id = (select id from g1); -- 2 < 3

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- Also a race: the dump zone refuses the drop below 3, but the bunch is SHARED
-- and a rival's peel can drain it between that read and this call.
select pg_temp.envelope_is(
  bananagrams.dump((select id from g1), 'a'),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN347","message":"Bunch too low to dump"}'::jsonb,
  'cannot dump when bunch + bag is smaller than the 3 a dump draws'
);

-- ============================================================
-- (8) A call into a game a friend just deleted
-- ============================================================
-- The delete takes the game's rows and every membership together, so the call
-- is answered by the shared race rather than by a fault, or by "You are not in
-- this game" (docs/envelopes.md → a missing game row is PN485).

reset role;
delete from common.games where id = (select id from g1);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  bananagrams.dump((select id from g1), 'a'),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'a dump into a game deleted under it is the shared race'
);

select * from finish();
rollback;
