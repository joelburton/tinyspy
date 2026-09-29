-- cs-unmet

-- ============================================================
-- Test: scrabble RLS + hidden-state (dictionary bands, racks)
-- ============================================================
-- The hidden surface is RESOURCES, not a solution: the dictionary bands are
-- server-only config, and a compete player's rack is own-only mid-game /
-- everyone's once the game has ended. Board, bag + plays are readable.

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(9);

-- A compete game between ada + bea; cade is a club member but NOT a
-- player; dee is outside the club.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select pg_temp.create_club('RLS club', array['ada', 'bea', 'cade']) as handle;
create temp table g on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;

-- ─── The dictionary bands are not selectable; the bag is ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok($$ select dict_2 from scrabble.games where game_id = (select id from g) $$,
  '42501', null, 'the hidden dict_2 column is not selectable');
select throws_ok($$ select dict_3plus from scrabble.games where game_id = (select id from g) $$,
  '42501', null, 'the hidden dict_3plus column is not selectable');
select is(
  (select array_length(bag, 1) from scrabble.games_state where game_id = (select id from g)), 86,
  'the bag is readable, and holds the real remainder (100 − 14 dealt)');
reset role;

-- ─── A rack is own-only mid-game ─────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select isnt(
  (select rack from scrabble.players_state
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  null, 'a player sees their own rack');
select is(
  (select rack from scrabble.players_state
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  null, 'a player cannot see an opponent''s rack mid-game');
select is(
  (select rack_count from scrabble.players_state
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  7, 'but the opponent''s tile COUNT is visible');
reset role;

-- ─── Board + plays are public to any club member ─────────
-- cade is in the club but not playing — viewing is club-gated.
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select jsonb_array_length(board) from scrabble.games_state where game_id = (select id from g)),
  225, 'a non-player club member can read the public board');
reset role;

-- ─── An outsider sees nothing ────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from scrabble.games_state where game_id = (select id from g)),
  0, 'a non-member sees no game (RLS hides it)');
reset role;

-- ─── Racks reveal once the game has ended ────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.stop_game((select id from g));
reset role;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select isnt(
  (select rack from scrabble.players_state
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  null, 'once the game has ended, an opponent''s rack is revealed (leftover-tile display)');
reset role;

select * from finish();
rollback;
