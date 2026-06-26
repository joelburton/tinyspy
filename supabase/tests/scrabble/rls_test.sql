-- ============================================================
-- Test: scrabble RLS + hidden-state (bag, racks)
-- ============================================================
-- The hidden surface is RESOURCES, not a solution: the bag is never
-- revealed (only its count), and a compete player's rack is own-only
-- mid-game / everyone's once terminal. Board + plays are public.

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(9);

-- A compete game between ada + bea; cade is a club member but NOT a
-- player; dee is outside the club.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select common.create_club('RLS club', array['ada', 'bea', 'cade']) as handle;
create temp table g on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');
reset role;

-- ─── The bag is never selectable; its count is ───────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok($$ select bag from scrabble.games where id = (select id from g) $$,
  '42501', null, 'the hidden bag column is not selectable');
select isnt(
  (select bag_count from scrabble.games_state where id = (select id from g)), null,
  'games_state exposes bag_count instead');
select is(
  (select bag_count from scrabble.games_state where id = (select id from g)), 86,
  'bag_count is the real remaining count (100 − 14 dealt)');
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
  (select jsonb_array_length(board) from scrabble.games_state where id = (select id from g)),
  225, 'a non-player club member can read the public board');
reset role;

-- ─── An outsider sees nothing ────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from scrabble.games_state where id = (select id from g)),
  0, 'a non-member sees no game (RLS hides it)');
reset role;

-- ─── Racks reveal once the game is terminal ──────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.end_game((select id from g));
reset role;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select isnt(
  (select rack from scrabble.players_state
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  null, 'post-terminal, an opponent''s rack is revealed (leftover-tile display)');
reset role;

select * from finish();
rollback;
