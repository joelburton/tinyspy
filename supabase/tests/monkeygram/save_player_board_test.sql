-- ============================================================
-- Test: monkeygram.save_player_board(target_game, state)
-- ============================================================
-- The snapshot endpoint. Covers:
--   1. Writes the caller's OWN board state
--   2. Recomputes progress (unplaced/placed) from the submitted state
--   3. Shape guard: hand/placements must be arrays
--   4. Non-player callers rejected
--   5. Terminal games: a late snapshot is a harmless no-op
-- ============================================================

begin;

set search_path = monkeygram, common, public, extensions;

select plan(7);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea']) as handle;

create temp table mg_game on commit drop as
select * from monkeygram.create_game(
  (select handle from club),
  '{"hand_size": 21, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- ─── ada snapshots a board: 2 placed (A, B), 1 in hand (C) ───
select monkeygram.save_player_board(
  (select id from mg_game),
  jsonb_build_object('board', 'AB' || repeat('.', 25 * 25 - 2), 'hand', 'C')
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select left(state->>'board', 2) from monkeygram.player_boards
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'AB',
  'save_player_board writes the caller''s board state'
);

select is(
  (select unplaced from monkeygram.progress
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1,
  'progress.unplaced recomputed from the submitted hand'
);

select is(
  (select placed from monkeygram.progress
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  2,
  'progress.placed recomputed from the filled board cells'
);

-- ─── Shape guard ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format(
    $$ select monkeygram.save_player_board(%L, '{"board":[],"hand":"C"}'::jsonb) $$,
    (select id from mg_game)
  ),
  'P0001',
  'state must have string fields "board" and "hand"',
  'non-string board is rejected'
);

-- ─── Non-player rejected ───
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select monkeygram.save_player_board(%L, '{"board":"","hand":""}'::jsonb) $$,
    (select id from mg_game)
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
    $$ select monkeygram.save_player_board(%L, '{"board":"","hand":"ABCDE"}'::jsonb) $$,
    (select id from mg_game)
  ),
  'snapshotting a terminal game does not error'
);

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select unplaced from monkeygram.progress
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1,
  'terminal snapshot is a no-op (progress unchanged from the last live save)'
);

select * from finish();
rollback;
