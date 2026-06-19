-- ============================================================
-- Test: monkeygram.create_game(target_club, setup, players)
-- ============================================================
--
-- Compete-only, single gametype (no mode param). What we cover:
--   1. Auth gating (unauthenticated rejected)
--   2. Membership gating (non-member caller rejected)
--   3. Setup-shape validation: hand_size + timer
--   4. Happy path: writes the 'monkeygram' gametype, the
--      monkeygram.games row, deals a hand_size hand to each
--      player (placements empty), seeds progress, and the dealt
--      tiles are globally distinct across hands
--   5. Solo (1-player) is allowed
-- ============================================================

begin;

set search_path = monkeygram, common, public, extensions;

select plan(13);

\ir ../_shared/setup.psql

-- ============================================================
-- (1) Unauthenticated callers are rejected
-- ============================================================

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select throws_ok(
  $$ select monkeygram.create_game(
       '=ada',
       '{"hand_size": 21, "timer": {"kind": "none"}}'::jsonb,
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
    $$ select monkeygram.create_game(%L,
         '{"hand_size": 21, "timer": {"kind": "none"}}'::jsonb,
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
    $$ select monkeygram.create_game(%L, '{"timer": {"kind": "none"}}'::jsonb,
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
    $$ select monkeygram.create_game(%L, '{"hand_size": 10, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.hand_size must be 15 or 21 (got 10)',
  'hand_size outside {15, 21} is rejected'
);

-- timer missing entirely
select throws_ok(
  format(
    $$ select monkeygram.create_game(%L, '{"hand_size": 21}'::jsonb,
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
select * from monkeygram.create_game(
  (select handle from club),
  '{"hand_size": 21, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- (solo is allowed: ada starts a game in her solo club)
select lives_ok(
  $$ select monkeygram.create_game('=ada',
       '{"hand_size": 15, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]) $$,
  'solo (1-player) create_game is allowed'
);

-- Reset to superuser to read across the owner-only RLS on
-- player_boards for the assertions below.
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select gametype from common.games where id = (select id from mg_game)),
  'monkeygram',
  'common.games row gets the monkeygram gametype'
);

select is(
  (select hand_size from monkeygram.games where id = (select id from mg_game)),
  21,
  'monkeygram.games records the hand_size'
);

select is(
  (select count(*)::int from monkeygram.player_boards
    where game_id = (select id from mg_game)),
  2,
  'one player_boards row per player'
);

select is(
  (select jsonb_array_length(state->'hand')::int from monkeygram.player_boards
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  21,
  'ada is dealt a 21-tile hand'
);

select is(
  (select jsonb_array_length(state->'placements')::int from monkeygram.player_boards
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  0,
  'ada starts with an empty board (no placements)'
);

select is(
  (select unplaced from monkeygram.progress
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  21,
  'progress.unplaced seeds to the hand size'
);

-- Every dealt tile across BOTH hands has a distinct id: 2 × 21 = 42.
select is(
  (select count(distinct elem->>'id')::int
     from monkeygram.player_boards pb,
          lateral jsonb_array_elements(pb.state->'hand') elem
    where pb.game_id = (select id from mg_game)),
  42,
  'all 42 dealt tiles have distinct ids — no overlap between hands'
);

select * from finish();
rollback;
