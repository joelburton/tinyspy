-- ============================================================
-- Test: common.gametypes + common.clubs_gametypes m2m
-- ============================================================
--
-- Coverage:
--   1. common.gametypes is populated for both today's gametypes
--      ('tinyspy', 'psychicnum')
--   2. handle_new_user populates clubs_gametypes for each solo
--      club it auto-creates — one row per registered gametype
--   3. create_club populates clubs_gametypes for each new club —
--      same shape
--   4. RLS: a non-member cannot see clubs_gametypes rows for a
--      club they're outside; a member can
--   5. RLS: common.gametypes is permissively readable (sanity
--      check — gametype identifiers are not sensitive)
--
-- See `tinyspy/create_game_test.sql` for the pgTAP / auth-
-- simulation primer.

begin;

set search_path = common, public, extensions;

select plan(10);

-- Cast: ada + bea form the test club; dee is the outsider used
-- for the RLS-negative assertions. The personas trigger
-- handle_new_user on insert, so each one has a solo club + a
-- populated clubs_gametypes before the test body runs — relevant
-- for the "solo club auto-creation populates m2m" check.

\ir ../_shared/setup.psql

-- ============================================================
-- (1)–(2) common.gametypes registry: both today's are present
-- ============================================================

select is(
  (select count(*) from common.gametypes),
  3::bigint,
  'common.gametypes contains three rows (tinyspy + psychicnum + wordknit)'
);

select is(
  (select array_agg(gametype order by gametype) from common.gametypes),
  array['psychicnum','tinyspy','wordknit'],
  'common.gametypes contains the three registered gametypes by name'
);

-- ============================================================
-- (3)–(4) handle_new_user populates m2m for solo clubs
-- ============================================================
-- The personas were inserted by _shared/setup.psql. Each one's
-- solo club exists with handle '=' + username. We check ada's
-- solo club — same shape for every persona by construction.

select is(
  (
    select count(*)
    from common.clubs_gametypes k
    join common.clubs c on c.id = k.club_id
    where c.handle = '=ada'
  ),
  3::bigint,
  'handle_new_user populated 3 clubs_gametypes rows for ada''s solo club'
);

select is(
  (
    select array_agg(k.gametype order by k.gametype)
    from common.clubs_gametypes k
    join common.clubs c on c.id = k.club_id
    where c.handle = '=ada'
  ),
  array['psychicnum','tinyspy','wordknit'],
  'ada''s solo club has m2m rows for all three registered gametypes'
);

-- ============================================================
-- (5)–(6) create_club populates m2m for the new club
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('Ada and Bea', array['ada','bea']);

reset role;
select is(
  (
    select count(*)
    from common.clubs_gametypes
    where club_id = (select id from club)
  ),
  3::bigint,
  'create_club populated 3 m2m rows for the new club'
);

select is(
  (
    select array_agg(gametype order by gametype)
    from common.clubs_gametypes
    where club_id = (select id from club)
  ),
  array['psychicnum','tinyspy','wordknit'],
  'new club has m2m rows for all three registered gametypes'
);

-- ============================================================
-- (7) Ada (member) can SELECT her club's m2m rows
-- ============================================================
-- Positive baseline for the RLS negative check below.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (
    select count(*)
    from common.clubs_gametypes
    where club_id = (select id from club)
  ),
  3::bigint,
  'sanity: ada (a member) sees her club''s m2m rows'
);

-- ============================================================
-- (8) Dee (outsider) cannot SELECT the m2m rows
-- ============================================================
-- clubs_gametypes_select is gated on common.is_club_member.

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (
    select count(*)
    from common.clubs_gametypes
    where club_id = (select id from club)
  ),
  0::bigint,
  'dee (non-member) sees zero m2m rows for ada+bea''s club (RLS hides)'
);

-- ============================================================
-- (9) Dee can still SELECT from common.gametypes
-- ============================================================
-- Gametype identifiers aren't club-scoped — the registry has a
-- permissive SELECT policy so the FE can resolve "what
-- gametypes exist" without needing a club context.

select is(
  (select count(*) from common.gametypes),
  3::bigint,
  'common.gametypes is readable by any signed-in user'
);

-- ============================================================
-- (10) Direct INSERT into clubs_gametypes is blocked
-- ============================================================
-- No INSERT/UPDATE/DELETE grants for authenticated — writes go
-- through the security-definer create_club / handle_new_user.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  $$ insert into common.clubs_gametypes (club_id, gametype)
     values ((select id from common.clubs where handle = '=ada'),
             'tinyspy') $$,
  '42501',
  'permission denied for table clubs_gametypes',
  'direct INSERT into clubs_gametypes is blocked (no grant on authenticated)'
);

-- ============================================================
select * from finish();
rollback;
