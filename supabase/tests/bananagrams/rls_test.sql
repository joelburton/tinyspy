-- cs-unmet

-- ============================================================
-- Test: bananagrams RLS — the club-member gate, the letters out of the grant
-- ============================================================
-- The page reads the blobs on common.games and nothing from bananagrams'
-- tables, so every table here keeps the default a game table has: any club
-- member may select the row, and the columns that would tell a player what
-- they should not know — a rival's `board` and `tiles`, and the three piles
-- whose order is every draw to come — are out of the column grant. The other
-- tests read these columns as the superuser; this file is where the policies
-- and grants meet a real authenticated caller.
--
-- Covers:
--   1. A co-player sees another player's `player_boards` row, and their own
--   2. ...but neither row's `board` or `tiles`: the column grant, not the row
--      policy, is what keeps the letters in — so it holds for one's own row
--      too (the page reads its own board off the blob)
--   3. `events` is visible to a co-player
--   4. A non-member sees no rows: not a board, not an event, not the game
--   5. `games.bunch_at_setup`, `bunch` and `bag` are column-excluded even for
--      a member who can see the row; the page counts them off the blob
--   6. Once the game has ENDED nothing changes: the letters stay out of the
--      grant (every board is in the blob, where the page reads them), and a
--      non-member still sees nothing
-- ============================================================

begin;

set search_path = bananagrams, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql

-- ada (a club member) creates the club + game, so the temp tables that
-- hold the game id are owned by the `authenticated` role and every
-- persona below can read them without an explicit grant.
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

-- A dump, so the log has a row to see.
select bananagrams.dump((select id from mg_game),
  (select left(p->>'tiles', 1) from common.games, jsonb_array_elements(game_data->'players') p
    where id = (select id from mg_game) and p->>'id' = 'ada11111-1111-1111-1111-111111111111'));

-- ─── (1)+(2)+(3) As bea, a co-player of ada ───────────────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

select is(
  (select count(*) from bananagrams.player_boards
    where game_id = (select id from mg_game)),
  2::bigint,
  'a co-player sees every player''s player_boards row (the club-member gate)'
);

select throws_ok(
  format(
    $$ select board from bananagrams.player_boards where game_id = %L
        and user_id = 'ada11111-1111-1111-1111-111111111111' $$,
    (select id from mg_game)
  ),
  '42501',
  null,
  'a co-player cannot select another player''s board'
);
select throws_ok(
  format(
    $$ select tiles from bananagrams.player_boards where game_id = %L
        and user_id = 'ada11111-1111-1111-1111-111111111111' $$,
    (select id from mg_game)
  ),
  '42501',
  null,
  'nor their tiles'
);
select throws_ok(
  format(
    $$ select board from bananagrams.player_boards where game_id = %L
        and user_id = 'bea22222-2222-2222-2222-222222222222' $$,
    (select id from mg_game)
  ),
  '42501',
  null,
  'nor their own: the column is out of the grant, and the page reads the blob'
);

select is(
  (select count(*) from bananagrams.events where game_id = (select id from mg_game)),
  1::bigint,
  'a co-player sees the log'
);

-- ─── (5) The piles are column-hidden even from a member ───────
select is(
  (select count(*) from bananagrams.games where game_id = (select id from mg_game)),
  1::bigint,
  'a club member sees the games row'
);
select throws_ok(
  format(
    $$ select bunch_at_setup from bananagrams.games where game_id = %L $$,
    (select id from mg_game)
  ),
  '42501',
  null,
  'games.bunch_at_setup (the whole deal) is not selectable by authenticated'
);
select throws_ok(
  format(
    $$ select bunch, bag from bananagrams.games where game_id = %L $$,
    (select id from mg_game)
  ),
  '42501',
  null,
  'nor games.bunch and games.bag: the page counts them off the blob'
);

-- ─── (4) As dee, outside the club entirely ────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

select is(
  (select count(*) from bananagrams.player_boards where game_id = (select id from mg_game))
  + (select count(*) from bananagrams.events where game_id = (select id from mg_game))
  + (select count(*) from bananagrams.games where game_id = (select id from mg_game)),
  0::bigint,
  'a non-member sees no boards, no events and no game'
);

-- ─── (6) The same reads once the game is OVER ─────────────────
-- stop_game is the manual stop; any player may call it.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.stop_game((select id from mg_game));

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format(
    $$ select board from bananagrams.player_boards where game_id = %L
        and user_id = 'ada11111-1111-1111-1111-111111111111' $$,
    (select id from mg_game)
  ),
  '42501',
  null,
  'once ended the letters are still out of the grant: every board is in the blob'
);
select is(
  (select count(*) from common.games, jsonb_array_elements(game_data->'players') p
    where id = (select id from mg_game) and jsonb_typeof(p->'board'->'letters') = 'string'),
  2::bigint,
  'and the blob is where a co-player finds every board, as the page does'
);

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*) from bananagrams.player_boards where game_id = (select id from mg_game)),
  0::bigint,
  'a non-member still sees no boards, even once ended'
);

select * from finish();
rollback;
