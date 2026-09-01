-- cs-unmet

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

select plan(9);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada', 'bea']) as handle;

create temp table mg_game on commit drop as
select (bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
)->'data'->>'id')::uuid as id;

-- ─── ada snapshots a board with 2 tiles placed (A, B) ───
-- She holds 21 tiles; placing 2 leaves 19 in hand.
select pg_temp.envelope_is(
  bananagrams.save_player_board(
    (select id from mg_game),
    'AB' || repeat('.', 25 * 25 - 2)),
  '{"type":"ok","data":{"result":"saved"}}'::jsonb,
  'a live snapshot answers saved'
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
-- A FAULT: the FE builds the 625-char grid itself, so no player can hand over
-- another size.
select pg_temp.envelope_is(
  bananagrams.save_player_board((select id from mg_game), 'AB'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN350"}'::jsonb,
  'a board that is not 625 chars is rejected'
);

-- ─── Non-player rejected ───
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  bananagrams.save_player_board((select id from mg_game), repeat('.', 25 * 25)),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN253"}'::jsonb,
  'a non-player cannot snapshot a board'
);

-- ─── Terminal game: snapshot is a no-op ───
reset role;
select set_config('request.jwt.claims', '', true);
select common.end_game((select id from mg_game), 'won', '{}'::jsonb, '{}'::jsonb);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- Named, not silent: the snapshot is discarded ON PURPOSE so a late unmount
-- save can't clobber the final board — which is a different fact from storing
-- one, and used to be the same answer.
select pg_temp.envelope_is(
  bananagrams.save_player_board(
    (select id from mg_game), repeat('C', 5) || repeat('.', 25 * 25 - 5)),
  '{"type":"ok","data":{"result":"game-over"}}'::jsonb,
  'snapshotting a terminal game answers game-over'
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

-- ─── Conceded caller: snapshot is a no-op too ───
-- A fresh game, because mg_game is over by now. bea drops out; ada keeps
-- racing, so the game stays live and only bea's board is frozen.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table live_game on commit drop as
select (bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
)->'data'->>'id')::uuid as id;

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select bananagrams.concede((select id from live_game));
select pg_temp.envelope_is(
  bananagrams.save_player_board(
    (select id from live_game), repeat('D', 3) || repeat('.', 25 * 25 - 3)),
  '{"type":"ok","data":{"result":"conceded"}}'::jsonb,
  'a conceded player''s snapshot answers conceded'
);

select * from finish();
rollback;
