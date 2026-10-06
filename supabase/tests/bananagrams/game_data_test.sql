-- cs-unmet

-- ============================================================
-- Test: bananagrams' page blobs — static_game_data, game_data and summary_data
-- ============================================================
-- `bananagrams._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move and every board save, and
-- `_write_static_game_data` what nothing after create changes
-- (supabase/sql/bananagrams.sql → The page blobs). This file pins what the
-- page gets — the static blob the common part alone:
--
--   1. A fresh game: the two piles counted and never listed, no team, an
--      empty log, every player's tiles (lowercase), both counts and an empty
--      board; a fresh summary
--   2. A board save: the saved board in the blob, the unplaced count from
--      the board's main block, and the game re-dated
--   3. A dump: its row in the log, the dumper's counts, the piles
--   4. A winning peel: the went-out row, the winner named, the summary
--   5. Every seat's tiles and board are in the blob — the page's useGame is
--      what withholds a rival's
--   6. A Restart empties it all again
--   7. `_rebuild_data_cols_for_all` rewrites every bananagrams game, its
--      static blob included, without re-dating it
--
-- Two players of 21 from a bunch of 43 leaves 1 tile in the bunch: too few to
-- refill the table, so the first peel goes out and wins. The deal is random,
-- so a board is built from the tiles the player was dealt.
-- ============================================================

begin;
set search_path = bananagrams, common, public, extensions;
\ir ../_shared/setup.psql

select plan(25);

-- One player's bananagrams keys off game_data, as "nTiles/nUnplacedTiles".
create function pg_temp.bg_counts(gid uuid, uid uuid) returns text
language sql as $$
  select (p->>'nTiles') || '/' || (p->>'nUnplacedTiles')
    from common.games, jsonb_array_elements(game_data->'players') p
   where id = gid and (p->>'id')::uuid = uid;
$$;

create function pg_temp.bg_tiles(gid uuid, uid uuid) returns text
language sql as $$
  select p->>'tiles'
    from common.games, jsonb_array_elements(game_data->'players') p
   where id = gid and (p->>'id')::uuid = uid;
$$;

create function pg_temp.bg_board(gid uuid, uid uuid) returns text
language sql as $$
  select p->'board'->>'letters'
    from common.games, jsonb_array_elements(game_data->'players') p
   where id = gid and (p->>'id')::uuid = uid;
$$;

-- The log without its ids and times.
create function pg_temp.bg_events(gid uuid) returns jsonb
language sql as $$
  select coalesce(jsonb_agg(e - 'id' - 'at' order by e->'id'), '[]'::jsonb)
    from common.games, jsonb_array_elements(game_data->'events') e
   where id = gid;
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Bananagrams blobs', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select (bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 43, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
)->'data'->>'id')::uuid as id;
grant select on g to authenticated;
reset role;

-- ─── (1) A fresh game ───
select is(
  (select jsonb_build_object('nBunchTiles', game_data->'nBunchTiles', 'nBagTiles', game_data->'nBagTiles',
                             'team', game_data->'team', 'events', game_data->'events')
     from common.games where id = (select id from g)),
  '{"nBunchTiles": 1, "nBagTiles": 101, "team": null, "events": []}'::jsonb,
  'a fresh game: 1 tile left in the bunch after two hands of 21, 101 set aside, no team, an empty log');
select ok(
  (select not (game_data ? 'bunch') and not (game_data ? 'bag') and not (game_data ? 'bunch_at_setup')
     from common.games where id = (select id from g)),
  'the piles'' order is not in the blob');
select is(
  (select static_game_data from common.games where id = (select id from g)),
  common._make_json_static_game_data((select id from g)),
  'static_game_data is the common part alone: bananagrams adds nothing to it');
select is(
  array[pg_temp.bg_counts((select id from g), 'ada11111-1111-1111-1111-111111111111'),
        pg_temp.bg_counts((select id from g), 'bea22222-2222-2222-2222-222222222222')],
  array['21/21', '21/21'],
  'each player holds 21 tiles, none of them placed');
select ok(
  pg_temp.bg_tiles((select id from g), 'ada11111-1111-1111-1111-111111111111') ~ '^[a-z]{21}$',
  'a player''s tiles are one string of 21 lowercase letters');
select is(
  pg_temp.bg_board((select id from g), 'ada11111-1111-1111-1111-111111111111'),
  repeat('.', 625),
  'a board is one string of 625 empty cells');
select is(
  (select summary_data - 'id' - 'gametype' - 'title' - 'statusChangedAt' - 'ended' - 'outcome' - 'ending'
     from common.games where id = (select id from g)),
  '{"nBunchTiles": 1}'::jsonb,
  'a fresh summary: the bunch count and nothing else of bananagrams''');

-- ─── (2) A board save ───
-- ada's board: her first 20 tiles in a row from cell 126, and her 21st at
-- `p_stray_cell` — off on its own, or null to join it to the row.
create function pg_temp.ada_board(p_stray_cell int) returns text language sql as $$
  select case when p_stray_cell is null
              then overlay(repeat('.', 625) placing t from 126)
              else overlay(overlay(repeat('.', 625) placing left(t, 20) from 126)
                           placing right(t, 1) from p_stray_cell)
         end
    from (select pg_temp.bg_tiles((select id from g), 'ada11111-1111-1111-1111-111111111111') as t) x
$$;

update common.games set status_changed_at = '2026-01-01' where id = (select id from g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.save_player_board((select id from g), pg_temp.ada_board(400));
reset role;

select is(
  pg_temp.bg_board((select id from g), 'ada11111-1111-1111-1111-111111111111'),
  pg_temp.ada_board(400),
  'a save puts the board in the blob as saved');
select is(
  pg_temp.bg_counts((select id from g), 'ada11111-1111-1111-1111-111111111111'),
  '21/1',
  'a tile off to the side of the main block is unplaced');
select isnt(
  (select status_changed_at from common.games where id = (select id from g)),
  '2026-01-01'::timestamptz,
  'a save re-dates the game');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.save_player_board((select id from g), pg_temp.ada_board(null));
reset role;
select is(
  pg_temp.bg_counts((select id from g), 'ada11111-1111-1111-1111-111111111111'),
  '21/0',
  'joining the stray to the block brings the count to 0');

-- ─── (3) A dump ───
-- bea dumps her first tile. The bunch holds 1 and the bag 101: the draw takes
-- the bunch's 1 and 2 off the bag, and the dumped tile goes back to the bunch.
create temp table dumped on commit drop as
select left(pg_temp.bg_tiles((select id from g), 'bea22222-2222-2222-2222-222222222222'), 1) as letter;
grant select on dumped to authenticated;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select bananagrams.dump((select id from g), (select letter from dumped));
reset role;

select is(
  pg_temp.bg_events((select id from g)),
  jsonb_build_array(jsonb_build_object(
    'userId', 'bea22222-2222-2222-2222-222222222222', 'kind', 'dump',
    'tile', (select letter from dumped), 'nDrawn', 3)),
  'the log: who dumped, which letter, and that three were drawn');
select is(
  pg_temp.bg_counts((select id from g), 'bea22222-2222-2222-2222-222222222222'),
  '23/23',
  'a dump adds its two tiles to the dumper''s counts');
select is(
  (select jsonb_build_object('nBunchTiles', game_data->'nBunchTiles', 'nBagTiles', game_data->'nBagTiles')
     from common.games where id = (select id from g)),
  '{"nBunchTiles": 1, "nBagTiles": 99}'::jsonb,
  'the piles follow the dump: the bunch''s 1 drawn and the dumped tile back, 2 off the bag');
select is(
  (select (summary_data->>'nBunchTiles')::int from common.games where id = (select id from g)),
  1, 'the summary''s bunch count follows too');

-- ─── (4) A winning peel ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.peel((select id from g));
reset role;

select is(
  (select game_ended_reason from common.games where id = (select id from g)),
  'reached_goal',
  'precondition: the peel went out');
select is(
  (select e - 'id' - 'at' from common.games, jsonb_array_elements(game_data->'events') e
    where id = (select id from g) order by e->'id' desc limit 1),
  '{"userId": "ada11111-1111-1111-1111-111111111111", "kind": "went_out", "tile": null, "nDrawn": 0}'::jsonb,
  'the log ends with the going-out row, which drew nothing');
select is(
  (select jsonb_build_object('winner', game_data->'ending'->'winner', 'ended', game_data->'ended')
     from common.games where id = (select id from g)),
  '{"winner": "ada11111-1111-1111-1111-111111111111", "ended": true}'::jsonb,
  'the ending names the peeler as the winner');
select is(
  (select array_agg(p->>'outcome' order by p->>'username')
     from common.games, jsonb_array_elements(game_data->'players') p
    where common.games.id = (select id from g)),
  array['won', 'lost'],
  'the peeler won; the other racer lost');
select is(
  (select summary_data->'ending'->>'winner' from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111',
  'the summary''s ending names the winner too');

-- ─── (5) Every seat is in the blob ───
select is(
  (select count(*)::int
     from common.games, jsonb_array_elements(game_data->'players') p
    where id = (select id from g)
      and jsonb_typeof(p->'tiles') = 'string'
      and jsonb_typeof(p->'board'->'letters') = 'string'),
  2, 'every player''s tiles and board are in the blob; the page''s useGame withholds a rival''s');

-- ─── (6) A Restart empties it all again ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.replay_board((select id from g));
reset role;
select is(
  (select jsonb_build_object('events', game_data->'events', 'nBunchTiles', game_data->'nBunchTiles',
                             'nBagTiles', game_data->'nBagTiles', 'ended', game_data->'ended')
     from common.games where id = (select id from g)),
  '{"events": [], "nBunchTiles": 1, "nBagTiles": 101, "ended": false}'::jsonb,
  'a Restart: the log empty, the piles back to the deal, the game being played');
select is(
  array[pg_temp.bg_counts((select id from g), 'ada11111-1111-1111-1111-111111111111'),
        pg_temp.bg_board((select id from g), 'ada11111-1111-1111-1111-111111111111')],
  array['21/21', repeat('.', 625)],
  'and every board empty, every tile unplaced');

-- ─── (7) _rebuild_data_cols_for_all ───
create temp table dated on commit drop as
select status_changed_at from common.games where id = (select id from g);
update common.games set game_data = '{}'::jsonb, static_game_data = null where id = (select id from g);
select is(bananagrams._rebuild_data_cols_for_all() >= 1, true,
  '_rebuild_data_cols_for_all rewrites every bananagrams game');
select is(
  (select jsonb_build_object('rebuilt', game_data ? 'nBunchTiles', 'static', static_game_data ? 'setup',
                             'dated', status_changed_at)
     from common.games where id = (select id from g)),
  jsonb_build_object('rebuilt', true, 'static', true, 'dated', (select status_changed_at from dated)),
  'both blobs are back, and the game is not re-dated');

select * from finish();
rollback;
