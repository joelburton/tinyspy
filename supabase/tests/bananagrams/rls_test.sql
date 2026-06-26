-- ============================================================
-- Test: bananagrams RLS — owner-only player_boards, club-wide progress
-- ============================================================
-- The privacy boundary of the whole game: a player must NOT be able to
-- read another player's tile rack (`player_boards`), while the derived
-- counters (`progress`) ARE visible club-wide so the peer strip can show
-- everyone's race. The other tests read player_boards as the superuser
-- (to bypass RLS for their assertions), so the owner-only policy itself
-- is never exercised as a real authenticated caller — that's this file.
--
-- Covers:
--   1. A co-player cannot read another player's board (owner-only RLS)
--   2. ...but CAN read their own board (policy admits owners, not just
--      denies everyone)
--   3. progress IS visible to a co-player (the public projection)
--   4. progress is NOT visible to a non-member (club-gated)
--   5. a non-member cannot read any board either
--   6. the hidden bunch (`games.pool`) is column-excluded from
--      authenticated, even for a club member who can see the row
-- ============================================================

begin;

set search_path = bananagrams, common, public, extensions;

select plan(6);

\ir ../_shared/setup.psql

-- ada (a club member) creates the club + game, so the temp tables that
-- hold the game id are owned by the `authenticated` role and every
-- persona below can read them without an explicit grant.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea']) as handle;

create temp table mg_game on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bag_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- ─── (1)+(2)+(3) As bea, a co-player of ada ───────────────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

select is(
  (select count(*) from bananagrams.player_boards
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  0::bigint,
  'a co-player cannot read another player''s board (owner-only RLS)'
);

select is(
  (select count(*) from bananagrams.player_boards
    where game_id = (select id from mg_game)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  1::bigint,
  'a player CAN read their own board'
);

select is(
  (select count(*) from bananagrams.progress
    where game_id = (select id from mg_game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1::bigint,
  'progress is visible club-wide (a co-player sees ada''s counters)'
);

-- ─── (6) The bunch is column-hidden even from a member ────────
-- bea can see the games row (club member), but `pool` is excluded by
-- the column-level grant, so selecting it is a privilege error.
select throws_ok(
  format(
    $$ select pool from bananagrams.games where id = %L $$,
    (select id from mg_game)
  ),
  '42501',
  null,
  'games.pool (the hidden bunch) is not selectable by authenticated'
);

-- ─── (4)+(5) As dee, outside the club entirely ────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

select is(
  (select count(*) from bananagrams.progress
    where game_id = (select id from mg_game)),
  0::bigint,
  'a non-member sees no progress rows (progress is club-gated)'
);

select is(
  (select count(*) from bananagrams.player_boards
    where game_id = (select id from mg_game)),
  0::bigint,
  'a non-member sees no boards either'
);

select * from finish();
rollback;
