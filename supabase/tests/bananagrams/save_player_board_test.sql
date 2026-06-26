-- ============================================================
-- Test: bananagrams.save_player_board(target_game, board)
-- ============================================================
-- The snapshot endpoint. Only the BOARD is sent — `tiles` (what the
-- player holds) is server-owned and untouched here. Covers:
--   1. Writes the caller's OWN board
--   2. Recomputes progress: placed = filled cells,
--      unplaced = length(tiles) − placed
--   3. Length guard: board must be exactly 625 chars
--   4. Non-player callers rejected
--   5. Terminal games: a late snapshot is a harmless no-op
-- ============================================================

begin;

set search_path = bananagrams, common, public, extensions;

select plan(7);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea']) as handle;

create temp table mg_game on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bag_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- ─── ada snapshots a board with 2 tiles placed (A, B) ───
-- She holds 21 tiles; placing 2 leaves 19 in hand.
select bananagrams.save_player_board(
  (select id from mg_game),
  'AB' || repeat('.', 25 * 25 - 2)
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select left(board, 2) from bananagrams.player_boards
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'AB',
  'save_player_board writes the caller''s board'
);

select is(
  (select placed from bananagrams.progress
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  2,
  'progress.placed recomputed from the filled board cells'
);

select is(
  (select unplaced from bananagrams.progress
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  19,
  'progress.unplaced = held tiles (21) − placed (2)'
);

-- ─── Length guard ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format(
    $$ select bananagrams.save_player_board(%L, 'AB') $$,
    (select id from mg_game)
  ),
  'P0001',
  'board must be a 625-char string',
  'a board that is not 625 chars is rejected'
);

-- ─── Non-player rejected ───
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select bananagrams.save_player_board(%L, %L) $$,
    (select id from mg_game), repeat('.', 25 * 25)
  ),
  '42501',
  'not playing this game',
  'a non-player cannot snapshot a board'
);

-- ─── Terminal game: snapshot is a no-op ───
reset role;
select set_config('request.jwt.claims', '', true);
select common.end_game((select id from mg_game), 'won', '{}'::jsonb, '{}'::jsonb);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format(
    $$ select bananagrams.save_player_board(%L, %L) $$,
    (select id from mg_game), repeat('C', 5) || repeat('.', 25 * 25 - 5)
  ),
  'snapshotting a terminal game does not error'
);

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select placed from bananagrams.progress
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  2,
  'terminal snapshot is a no-op (progress unchanged from the last live save)'
);

select * from finish();
rollback;
