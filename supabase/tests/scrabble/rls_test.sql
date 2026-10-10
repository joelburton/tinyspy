-- cs-unmet

-- ============================================================
-- Test: scrabble RLS — the club gate, and what stays out of the grant
-- ============================================================
-- The page reads the blobs on common.games; these rules cover what a club
-- member may still read off scrabble's own tables. The dictionary bands, the
-- bag's order and the racks, the log's among them, stay out of the column grant; the board is
-- readable by any club member and by nobody outside the club. Who may see a
-- rack is the page's seat rule now (game_data_test.sql).

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

-- ─── The bands, the bag and the racks are not selectable ─
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok($$ select dict_2 from scrabble.games where game_id = (select id from g) $$,
  '42501', null, 'the dict_2 band is not selectable');
select throws_ok($$ select dict_3plus from scrabble.games where game_id = (select id from g) $$,
  '42501', null, 'the dict_3plus band is not selectable');
select throws_ok($$ select bag from scrabble.games where game_id = (select id from g) $$,
  '42501', null, 'the bag''s order is not selectable');
select throws_ok($$ select rack from scrabble.players where game_id = (select id from g) $$,
  '42501', null, 'a rack is not selectable off the table — even one''s own');
select throws_ok($$ select rack from scrabble.events where game_id = (select id from g) $$,
  '42501', null, 'nor is the rack a log row keeps');
select throws_ok($$ select exchanged from scrabble.events where game_id = (select id from g) $$,
  '42501', null, 'nor the tiles an exchange put back');
reset role;

-- ─── Board + events are public to any club member ────────
-- cade is in the club but not playing — reading is club-gated.
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select jsonb_array_length(board) from scrabble.games where game_id = (select id from g)),
  225, 'a non-player club member can read the public board');
select is(
  (select count(*)::int from scrabble.players where game_id = (select id from g)),
  2, 'and the players'' rows, less the rack');
reset role;

-- ─── An outsider sees nothing ────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from scrabble.games where game_id = (select id from g)),
  0, 'a non-member sees no game (RLS hides it)');
reset role;

select * from finish();
rollback;
