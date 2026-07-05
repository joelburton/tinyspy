-- ============================================================
-- Test: bananagrams.create_game(target_club, setup, players)
-- ============================================================
--
-- Compete-only, single gametype (no mode param). What we cover:
--   1. Auth gating (unauthenticated rejected)
--   2. Membership gating (non-member caller rejected)
--   3. Setup-shape validation: hand_size + bunch_size + timer
--      (incl. bunch must hold playerCount × hand_size to deal)
--   4. Happy path: writes the 'bananagrams' gametype, the
--      bananagrams.games row, persists the immutable `bunch_seed`, deals a
--      hand_size `tiles` to each player (board empty), materializes
--      the bunch (`bunch` = undealt remainder), seeds progress
--   5. A smaller bunch deals + leaves a smaller bunch
--   6. Solo (1-player) is allowed
-- ============================================================

begin;

set search_path = bananagrams, common, public, extensions;

select plan(30);

\ir ../_shared/setup.psql

-- ============================================================
-- (1) Unauthenticated callers are rejected
-- ============================================================

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select throws_ok(
  $$ select bananagrams.create_game(
       '=ada',
       '{"hand_size": 21, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]
     ) $$,
  '42501',
  'must be authenticated',
  'unauthenticated create_game is rejected'
);

-- ============================================================
-- Build a 2-member club (ada + bea) for the rest
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea']) as handle;

-- ============================================================
-- (2) Non-member caller is rejected
-- ============================================================
-- dee is outside the club. NULL errcode/errmsg → "throws anything".

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select bananagrams.create_game(%L,
         '{"hand_size": 21, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
         array['ada11111-1111-1111-1111-111111111111'::uuid]) $$,
    (select handle from club)
  ),
  null, null,
  'non-member caller is rejected'
);

-- ============================================================
-- (3) Setup-shape validation (as a member)
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- hand_size missing
select throws_ok(
  format(
    $$ select bananagrams.create_game(%L, '{"timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.hand_size is required',
  'missing hand_size is rejected'
);

-- hand_size out of the allowed set
select throws_ok(
  format(
    $$ select bananagrams.create_game(%L, '{"hand_size": 10, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.hand_size must be 15 or 21 (got 10)',
  'hand_size outside {15, 21} is rejected'
);

-- bunch_size missing (hand_size valid, so we reach the bunch_size check)
select throws_ok(
  format(
    $$ select bananagrams.create_game(%L, '{"hand_size": 21, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.bunch_size is required',
  'missing bunch_size is rejected'
);

-- bunch_size out of range (> 144)
select throws_ok(
  format(
    $$ select bananagrams.create_game(%L, '{"hand_size": 21, "bunch_size": 200, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.bunch_size must be between 1 and 144 (got 200)',
  'bunch_size above 144 is rejected'
);

-- bunch_size too small to deal: 2 players × 21 = 42 needed, bunch holds 40
select throws_ok(
  format(
    $$ select bananagrams.create_game(%L, '{"hand_size": 21, "bunch_size": 40, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select handle from club)
  ),
  'P0001',
  'not enough tiles: 2 players × 21 = 42 needed, bunch holds 40',
  'a bunch too small to deal every hand is rejected'
);

-- an unknown word_check value is rejected
select throws_ok(
  format(
    $$ select bananagrams.create_game(%L,
       '{"hand_size": 21, "bunch_size": 144, "word_check": "bogus", "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.word_check must be off, win or strict (got bogus)',
  'an unknown word_check value is rejected'
);

-- word_check on but dict_2 missing
select throws_ok(
  format(
    $$ select bananagrams.create_game(%L,
       '{"hand_size": 21, "bunch_size": 144, "word_check": "win", "dict_3plus": 4, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.dict_2 is required unless word_check is off',
  'word_check on without dict_2 is rejected'
);

-- dict_2 out of its 2..6 band (band 1 has too few 2-letter words)
select throws_ok(
  format(
    $$ select bananagrams.create_game(%L,
       '{"hand_size": 21, "bunch_size": 144, "word_check": "strict", "dict_2": 1, "dict_3plus": 4, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.dict_2 must be between 2 and 6 (got 1)',
  'dict_2 below 2 is rejected'
);

-- dict_3plus missing (dict_2 present, so we reach the dict_3plus check)
select throws_ok(
  format(
    $$ select bananagrams.create_game(%L,
       '{"hand_size": 21, "bunch_size": 144, "word_check": "win", "dict_2": 4, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.dict_3plus is required unless word_check is off',
  'word_check on without dict_3plus is rejected'
);

-- dict_3plus out of its 1..6 band
select throws_ok(
  format(
    $$ select bananagrams.create_game(%L,
       '{"hand_size": 21, "bunch_size": 144, "word_check": "win", "dict_2": 4, "dict_3plus": 7, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.dict_3plus must be between 1 and 6 (got 7)',
  'dict_3plus above 6 is rejected'
);

-- timer missing entirely (hand_size + bunch_size valid, so we reach the timer check)
select throws_ok(
  format(
    $$ select bananagrams.create_game(%L, '{"hand_size": 21, "bunch_size": 144}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.timer is required',
  'missing timer is rejected'
);

-- ============================================================
-- Happy path (2 players, hand_size 21)
-- ============================================================

create temp table mg_game on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- (solo is allowed: ada starts a game in her solo club)
select lives_ok(
  $$ select bananagrams.create_game('=ada',
       '{"hand_size": 15, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]) $$,
  'solo (1-player) create_game is allowed'
);

-- A smaller bunch: 2 players × 21 = 42 dealt, bunch holds 60 → bunch of 18.
create temp table mg_small on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 60, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- Reset to superuser to read across the owner-only RLS on
-- player_boards for the assertions below.
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select gametype from common.games where id = (select id from mg_game)),
  'bananagrams',
  'common.games row gets the bananagrams gametype'
);

select is(
  (select hand_size from bananagrams.games where id = (select id from mg_game)),
  21,
  'bananagrams.games records the hand_size'
);

select is(
  (select count(*)::int from bananagrams.player_boards
    where game_id = (select id from mg_game)),
  2,
  'one player_boards row per player'
);

select is(
  (select length(tiles) from bananagrams.player_boards
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  21,
  'ada is dealt 21 tiles (everything she holds)'
);

select is(
  (select board from bananagrams.player_boards
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  repeat('.', 25 * 25),
  'ada starts with an empty 625-cell board'
);

select is(
  (select unplaced from bananagrams.progress
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  21,
  'progress.unplaced seeds to the hand size'
);

-- Both players are dealt distinct slices of the shuffled bunch: 2 × 21 = 42
-- tiles total, all uppercase.
select is(
  (select string_agg(pb.tiles, '') from bananagrams.player_boards pb
    where pb.game_id = (select id from mg_game)) ~ '^[A-Z]{42}$',
  true,
  'both hands together are 42 uppercase tiles dealt from the bunch'
);

-- The bunch holds everything not dealt: the 144-tile bunch − 42 dealt = 102.
select is(
  (select length(bunch) from bananagrams.games where id = (select id from mg_game)),
  102,
  'bunch (the bunch) holds the 102 undealt tiles'
);

-- The immutable `bunch_seed` of record is the full chosen size (144 here): hands +
-- bunch together. 42 dealt + 102 bunch = 144.
select is(
  (select length(bunch_seed) from bananagrams.games where id = (select id from mg_game)),
  144,
  'bunch_seed (immutable record) holds the full chosen bunch size'
);
select is(
  (select bunch_seed ~ '^[A-Z]{144}$' from bananagrams.games where id = (select id from mg_game)),
  true,
  'bunch_seed is 144 uppercase tiles'
);
-- A full (144) bunch leaves nothing over → the bag is empty.
select is(
  (select length(bag) from bananagrams.games where id = (select id from mg_game)),
  0,
  'a full 144 bunch leaves an empty bag'
);

-- Smaller bunch: bunch_seed length = 60, bunch = 60 − 42 dealt = 18.
select is(
  (select length(bunch_seed) from bananagrams.games where id = (select id from mg_small)),
  60,
  'a bunch_size of 60 persists a 60-tile bag'
);
select is(
  (select length(bunch) from bananagrams.games where id = (select id from mg_small)),
  18,
  'the smaller bunch leaves an 18-tile draw pile (60 − 2×21)'
);
-- The tiles left OUT of the bunch aren't discarded — they seed the bag.
-- 144 − 60 = 84, and bunch_seed + bag together account for all 144.
select is(
  (select length(bag) from bananagrams.games where id = (select id from mg_small)),
  84,
  'the 84 tiles not in the bunch seed the bag (144 − 60)'
);
select is(
  (select length(bunch_seed) + length(bag) from bananagrams.games where id = (select id from mg_small)),
  144,
  'bunch_seed + bag account for all 144 tiles — none discarded'
);
select is(
  (select (status->>'bag_remaining')::int from common.games where id = (select id from mg_small)),
  84,
  'status.bag_remaining surfaces the starting bag count'
);

select * from finish();
rollback;
