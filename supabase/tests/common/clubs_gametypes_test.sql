-- ============================================================
-- Test: common.gametypes + common.clubs_gametypes m2m
-- ============================================================
--
-- Coverage:
--   1. common.gametypes is populated for every registered gametype
--      family — both psychicnum siblings ('psychicnum_coop' AND
--      'psychicnum_compete'), both connections siblings (coop and
--      compete), plus tinyspy + spellingbee.
--      Each manifest entry is its own row.
--   2. claim_username populates clubs_gametypes for each solo
--      club it creates — one row per SOLO-PLAYABLE gametype
--      (min_players <= 1), not the full registry
--   3. create_club populates clubs_gametypes for each new (friend)
--      club — the full registry, since it always has ≥2 members
--   4. RLS: a non-member cannot see clubs_gametypes rows for a
--      club they're outside; a member can
--   5. RLS: common.gametypes is permissively readable (sanity
--      check — gametype identifiers are not sensitive)
--
-- See `tinyspy/create_game_test.sql` for the pgTAP / auth-
-- simulation primer.

begin;

set search_path = common, public, extensions;

select plan(17);

-- Cast: ada + bea form the test club; dee is the outsider used
-- for the RLS-negative assertions. The personas come from
-- _shared/setup.psql, which manually materializes the
-- profile + solo-club + clubs_gametypes for each one (mirroring
-- what claim_username does at first sign-in).

\ir ../_shared/setup.psql

-- ============================================================
-- (1)–(2) common.gametypes registry: today.s gametypes are present
-- ============================================================

select is(
  (select count(*) from common.gametypes),
  16::bigint,
  'common.gametypes contains sixteen rows (tinyspy + 2 psychicnum + 2 connections + 2 spellingbee + bananagrams + 2 waffle + 2 wordle + 2 stackdown + 2 scrabble)'
);

select is(
  (select array_agg(gametype order by gametype) from common.gametypes),
  array['bananagrams','connections_compete','connections_coop','psychicnum_compete','psychicnum_coop','scrabble_compete','scrabble_coop','spellingbee_compete','spellingbee_coop','stackdown_compete','stackdown_coop','tinyspy','waffle_compete','waffle_coop','wordle_compete','wordle_coop'],
  'common.gametypes contains the sixteen registered gametypes by name'
);

-- ============================================================
-- (3)–(4) claim_username populates m2m for solo clubs
-- ============================================================
-- The personas were inserted by _shared/setup.psql. Each one's
-- solo club exists with handle '=' + username. We check ada's
-- solo club — same shape for every persona by construction.

-- A solo club only enrolls in solo-playable gametypes (min_players
-- <= 1): the coop/solo variants, not the two-player games.
select is(
  (
    select count(*)
    from common.clubs_gametypes k
    join common.clubs c on c.handle = k.club_handle
    where c.handle = '=ada'
  ),
  8::bigint,
  'claim_username populated 8 (solo-playable) clubs_gametypes rows for ada''s solo club'
);

select is(
  (
    select array_agg(k.gametype order by k.gametype)
    from common.clubs_gametypes k
    join common.clubs c on c.handle = k.club_handle
    where c.handle = '=ada'
  ),
  array['bananagrams','connections_coop','psychicnum_coop','scrabble_coop','spellingbee_coop','stackdown_coop','waffle_coop','wordle_coop'],
  'ada''s solo club has m2m rows for the eight solo-playable gametypes'
);

-- ============================================================
-- (5)–(6) create_club populates m2m for the new club
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

reset role;
select is(
  (
    select count(*)
    from common.clubs_gametypes
    where club_handle = (select handle from club)
  ),
  16::bigint,
  'create_club populated 16 m2m rows for the new club'
);

select is(
  (
    select array_agg(gametype order by gametype)
    from common.clubs_gametypes
    where club_handle = (select handle from club)
  ),
  array['bananagrams','connections_compete','connections_coop','psychicnum_compete','psychicnum_coop','scrabble_compete','scrabble_coop','spellingbee_compete','spellingbee_coop','stackdown_compete','stackdown_coop','tinyspy','waffle_compete','waffle_coop','wordle_compete','wordle_coop'],
  'new club has m2m rows for all sixteen registered gametypes'
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
    where club_handle = (select handle from club)
  ),
  16::bigint,
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
    where club_handle = (select handle from club)
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
  16::bigint,
  'common.gametypes is readable by any signed-in user'
);

-- ============================================================
-- (10) Direct INSERT into clubs_gametypes is blocked
-- ============================================================
-- No INSERT/UPDATE/DELETE grants for authenticated — writes go
-- through the security-definer create_club / handle_new_user.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  $$ insert into common.clubs_gametypes (club_handle, gametype)
     values ((select handle from common.clubs where handle = '=ada'),
             'tinyspy') $$,
  '42501',
  'permission denied for table clubs_gametypes',
  'direct INSERT into clubs_gametypes is blocked (no grant on authenticated)'
);

-- ============================================================
-- (11) min_players mirrors each manifest's player-count lower bound
-- ============================================================
-- Solo-playable games register 1; two-player games register 2.
-- Sorted by gametype: bananagrams(1), spellingbee_compete(2),
-- spellingbee_coop(1), tinyspy(2).
select is(
  (select array_agg(min_players order by gametype)
     from common.gametypes
    where gametype in ('tinyspy', 'bananagrams', 'spellingbee_coop', 'spellingbee_compete')),
  array[1, 2, 1, 2]::smallint[],
  'common.gametypes.min_players: solo games register 1, two-player games register 2'
);

-- ============================================================
-- (12)-(14) set_club_gametypes — the club-settings games editor
-- ============================================================
-- Seed a default_setup on one row first, so we can prove an edit
-- that KEEPS that gametype preserves it (the RPC deletes by
-- difference rather than truncating + refilling). Done as the
-- superuser — authenticated has no write grant on the table.

reset role;
update common.clubs_gametypes
   set default_setup = '{"turns": 9}'::jsonb
 where club_handle = (select handle from club)
   and gametype = 'tinyspy';

-- Ada (a member) trims the friend club down to three gametypes.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  $$ select common.set_club_gametypes(
       (select handle from club),
       array['tinyspy', 'connections_coop', 'spellingbee_coop']) $$,
  'set_club_gametypes: a member can replace the club''s gametype set'
);

select is(
  (select array_agg(gametype order by gametype)
     from common.clubs_gametypes
    where club_handle = (select handle from club)),
  array['connections_coop', 'spellingbee_coop', 'tinyspy'],
  'set_club_gametypes replaced the set with exactly the passed gametypes'
);

select is(
  (select default_setup->>'turns'
     from common.clubs_gametypes
    where club_handle = (select handle from club) and gametype = 'tinyspy'),
  '9',
  'set_club_gametypes preserved default_setup on a kept row (delete-by-difference)'
);

-- ============================================================
-- (15)-(16) An empty list clears every enrollment
-- ============================================================
select lives_ok(
  $$ select common.set_club_gametypes((select handle from club), array[]::text[]) $$,
  'set_club_gametypes: an empty list is accepted'
);
select is(
  (select count(*) from common.clubs_gametypes
    where club_handle = (select handle from club)),
  0::bigint,
  'set_club_gametypes with an empty list clears every enrollment'
);

-- ============================================================
-- (17) A non-member cannot edit the club's gametypes
-- ============================================================
-- Same membership gate as every other club RPC (require_club_member).
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  $$ select common.set_club_gametypes((select handle from club), array['tinyspy']) $$,
  '42501',
  NULL,
  'set_club_gametypes: a non-member is rejected (42501)'
);

-- ============================================================
select * from finish();
rollback;
