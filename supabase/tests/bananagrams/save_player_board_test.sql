-- cs-unmet

-- ============================================================
-- Test: bananagrams.save_player_board(p_game_id, p_board)
-- ============================================================
-- The snapshot endpoint. Only the BOARD is sent — `tiles` (what the
-- player holds) is server-owned and untouched here. Covers:
--   1. Writes the caller's OWN board, and the blob carries it as saved
--   2. The blob's nUnplacedTiles = length(tiles) minus the board's largest
--      block, so a stray tile is still unplaced
--   3. Shape guard: 625 cells, each a lowercase letter or empty
--   4. Non-player callers rejected
--   5. Ended games: a late snapshot is a harmless no-op; so is a conceder's
-- ============================================================

begin;

set search_path = bananagrams, common, public, extensions;

select plan(11);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

-- ada's board and count as the page blob carries them.
create function pg_temp.ada_board(gid uuid) returns text language sql as $$
  select p->'board'->>'letters' from common.games, jsonb_array_elements(game_data->'players') p
   where id = gid and p->>'id' = 'ada11111-1111-1111-1111-111111111111'
$$;
create function pg_temp.ada_unplaced(gid uuid) returns int language sql as $$
  select (p->>'nUnplacedTiles')::int from common.games, jsonb_array_elements(game_data->'players') p
   where id = gid and p->>'id' = 'ada11111-1111-1111-1111-111111111111'
$$;

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

-- ─── ada snapshots a board with 2 tiles placed (a, b) ───
-- She holds 21 tiles; placing 2 leaves 19 in hand. The board is stored as
-- handed: nothing checks that a and b are among her tiles.
select pg_temp.envelope_is(
  bananagrams.save_player_board(
    (select id from mg_game),
    'ab' || repeat('.', 25 * 25 - 2)),
  '{"type":"ok","data":{"result":"saved"}}'::jsonb,
  'a live snapshot answers saved'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select left(board, 2) from bananagrams.player_boards
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'ab',
  'save_player_board writes the caller''s board'
);
select is(
  left(pg_temp.ada_board((select id from mg_game)), 2),
  'ab',
  'the blob carries the board as saved'
);
select is(
  pg_temp.ada_unplaced((select id from mg_game)),
  19,
  'nUnplacedTiles = held tiles (21) − the main block (2)'
);

-- ─── A tile off on its own is not placed ───
-- a and b with a gap between them: two blocks of 1, so the main block is 1.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.save_player_board((select id from mg_game), 'a.b' || repeat('.', 25 * 25 - 3));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.ada_unplaced((select id from mg_game)),
  20,
  'two separate tiles: both on the board, but only one in the main block'
);

-- ─── Shape guard ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- A FAULT: the FE builds the 625-char grid itself from lowercase tiles, so no
-- player can hand over another shape.
select pg_temp.envelope_is(
  bananagrams.save_player_board((select id from mg_game), 'ab'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN350"}'::jsonb,
  'a board that is not 625 chars is rejected'
);
select pg_temp.envelope_is(
  bananagrams.save_player_board((select id from mg_game), 'AB' || repeat('.', 25 * 25 - 2)),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN350"}'::jsonb,
  'a board with a capital in it is rejected'
);

-- ─── Non-player rejected ───
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  bananagrams.save_player_board((select id from mg_game), repeat('.', 25 * 25)),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN253"}'::jsonb,
  'a non-player cannot snapshot a board'
);

-- ─── Ended game: snapshot is a no-op ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.stop_game((select id from mg_game));
-- Named, not silent: the snapshot is discarded ON PURPOSE so a late unmount
-- save can't clobber the final board — which is a different fact from storing
-- one, and used to be the same answer.
select pg_temp.envelope_is(
  bananagrams.save_player_board(
    (select id from mg_game), repeat('c', 5) || repeat('.', 25 * 25 - 5)),
  '{"type":"ok","data":{"result":"game-over"}}'::jsonb,
  'snapshotting an ended game answers game-over'
);

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  left(pg_temp.ada_board((select id from mg_game)), 3),
  'a.b',
  'a snapshot after the end is a no-op (the blob keeps the last live save)'
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
    (select id from live_game), repeat('d', 3) || repeat('.', 25 * 25 - 3)),
  '{"type":"ok","data":{"result":"conceded"}}'::jsonb,
  'a conceded player''s snapshot answers conceded'
);

select * from finish();
rollback;
