-- ============================================================
-- Test: scrabble.create_game
-- ============================================================
-- Shuffles the 100-tile bag, deals 7-tile racks (per-player in compete,
-- one shared rack in coop), seeds an empty 225-cell board, picks a random
-- first player (compete), starts at version 0, flips to 'playing'.

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(18);

-- ─── Coop ────────────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cc on commit drop as
  select common.create_club('Rack coop', array['ada', 'bea']) as handle;
create temp table gc on commit drop as
  select * from scrabble.create_game(
    (select handle from cc),
    '{"dict_2": 3, "dict_3plus": 3, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop');
reset role;

select is(
  (select gametype from common.games where id = (select id from gc)),
  'scrabble_coop', 'common.games gets the scrabble_coop gametype');
select is(
  (select mode from scrabble.games where id = (select id from gc)),
  'coop', 'scrabble.games stores mode coop');
select is(
  (select dict_2 || '/' || dict_3plus from scrabble.games where id = (select id from gc)),
  '3/3', 'both difficulty bands (2-letter / 3+) are recorded');
select is(
  (select version from scrabble.games where id = (select id from gc)),
  0, 'version starts at 0');
select is(
  (select jsonb_array_length(board) from scrabble.games where id = (select id from gc)),
  225, 'an empty 225-cell board is seeded');
select is(
  (select array_length(shared_rack, 1) from scrabble.games where id = (select id from gc)),
  7, 'coop deals one shared 7-tile rack');
select is(
  (select team_score from scrabble.games where id = (select id from gc)),
  0, 'coop team_score starts at 0');
select is(
  (select array_length(bag, 1) from scrabble.games where id = (select id from gc)),
  93, 'bag holds the remaining 93 tiles (100 − 7 dealt)');
select is(
  (select count(*)::int from scrabble.players where game_id = (select id from gc)),
  2, 'one players row per player');
select ok(
  (select bool_and(rack is null) from scrabble.players where game_id = (select id from gc)),
  'coop players have no per-player rack (it lives on games)');
select is(
  (select play_state from common.games where id = (select id from gc)),
  'playing', 'game flips to playing');

-- ─── Compete ─────────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cp on commit drop as
  select common.create_club('Rack compete', array['ada', 'bea']) as handle;
create temp table gp on commit drop as
  select * from scrabble.create_game(
    (select handle from cp),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    'compete');
reset role;

select is(
  (select mode from scrabble.games where id = (select id from gp)),
  'compete', 'compete game stores mode compete');
select is(
  (select count(*)::int from scrabble.players
    where game_id = (select id from gp) and array_length(rack, 1) = 7),
  2, 'compete deals a private 7-tile rack to each player');
select ok(
  (select current_user_id from scrabble.games where id = (select id from gp))
    in ('ada11111-1111-1111-1111-111111111111',
        'bea22222-2222-2222-2222-222222222222'),
  'compete picks a seated player to go first');
select is(
  (select array_length(bag, 1) from scrabble.games where id = (select id from gp)),
  86, 'bag holds the remaining 86 tiles (100 − 14 dealt)');
select ok(
  (select bool_and(score = 0) from scrabble.players where game_id = (select id from gp)),
  'compete players start at score 0');

-- ─── Player-count floors ─────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok($$
  select scrabble.create_game(
    (select handle from cp),
    '{"dict_2": 3, "dict_3plus": 3}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'compete')
$$, 'P0001', null, 'compete rejects a single player');

select throws_ok($$
  select scrabble.create_game(
    (select handle from cp),
    '{"dict_2": 3, "dict_3plus": 3}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid,
          'cade3333-3333-3333-3333-333333333333'::uuid,
          'dee44444-4444-4444-4444-444444444444'::uuid,
          'eda55555-5555-5555-5555-555555555555'::uuid],
    'coop')
$$, 'P0001', null, 'more than 4 players is rejected');

select * from finish();
rollback;
