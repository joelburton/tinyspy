-- cs-unmet

-- ============================================================
-- Test: waffle.create_game (coop)
-- ============================================================
-- create_game takes the freshly-built board, stores it on the game,
-- sets the swap budget (par + extra), seeds one players row per player
-- at the scramble, and flips the game to 'playing'.

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(8);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

create temp table club on commit drop as
select pg_temp.create_club('Waffle coop', array['ada', 'bea']) as handle;

-- The whole envelope is kept, not just the id: `data.result` is what both call
-- sites branch on (the in-game New Game and, once the interface follows,
-- SetupGameModal), and it reaches them through `waffle-build-board` untouched.
create temp table created on commit drop as
select waffle.create_game(
  (select handle from club),
  pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board()
) as env;
create temp table g on commit drop as
select (env->'data'->>'id')::uuid as id from created;

reset role;

select pg_temp.envelope_is(
  (select env from created),
  '{"type":"ok","data":{"result":"created"}}'::jsonb,
  'the answer names itself, so a call site has a case to assert'
);

select is(
  (select mode from waffle.games where id = (select id from g)),
  'coop',
  'game stored with mode coop'
);

select is(
  (select max_swaps from waffle.games where id = (select id from g)),
  6,
  'max_swaps = par (1) + extra (5)'
);

select is(
  (select scramble from waffle.games where id = (select id from g))::text,
  'bacdef.g.hijklmn.o.pqrstu',
  'scramble stored from the board'
);

select is(
  (select count(*) from waffle.players where game_id = (select id from g)),
  2::bigint,
  'one players row per player'
);

select is(
  (select board from waffle.players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111')::text,
  'bacdef.g.hijklmn.o.pqrstu',
  'each player board starts at the scramble'
);

select is(
  (select max(swaps_used) from waffle.players where game_id = (select id from g)),
  0,
  'swaps_used starts at 0'
);

select is(
  (select play_state from common.games where id = (select id from g)),
  'playing',
  'play_state is playing'
);

select * from finish();
rollback;
