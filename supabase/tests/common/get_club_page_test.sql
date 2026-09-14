-- cs-unmet

-- ============================================================
-- Test: common.get_club_page RPC — the club page's one read
-- ============================================================
--
-- Coverage:
--   1. Happy path: the three payload pieces, for a member
--        - club: handle, name, and the is_solo generated column
--        - members: everyone, ALPHABETICAL by username
--        - gametypes: the enrolled set, each with its default_setup
--   2. The three refusals, which are the reason this RPC exists —
--      a direct read cannot tell (b) and (c) apart, because RLS
--      hides a club you are outside and both arrive as zero rows:
--        - PN493 signed out
--        - PN494 no such club
--        - PN495 the club exists, you are not in it
--   3. A solo club reports is_solo = true.
--
-- See `codenamesduet/create_game_test.sql` for the pgTAP / auth-
-- simulation primer this file builds on.

begin;

set search_path = common, public, extensions;

select plan(14);

-- Cast: ada + bea + cade are the club. cade is here to make the
-- ordering assertion mean something — three names that are not in
-- insertion order.

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

-- Members passed cade-first, so insertion order is the REVERSE of
-- alphabetical and a passing sort assertion cannot pass by accident.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Trio', array['cade','bea','ada']) as handle;

-- The payload, fetched once and read by every assertion below, so
-- the RPC is exercised as the page calls it: one round trip.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table page on commit drop as
select common.get_club_page((select handle from club)) as env;

-- ============================================================
-- (1) Happy path — the payload
-- ============================================================

select pg_temp.envelope_is(
  (select env from page),
  '{"type":"ok"}'::jsonb,
  'a member gets an ok envelope');

-- The discriminant the call site's ok branch asserts on.
select is(
  (select env from page) -> 'data' ->> 'result',
  'loaded',
  'data.result is the answer a call site branches on, not `type` alone');

select is(
  (select env from page) -> 'data' -> 'club' ->> 'handle',
  (select handle from club),
  'club.handle is the club asked for');

select is(
  (select env from page) -> 'data' -> 'club' ->> 'name',
  'Trio',
  'club.name is the display name, not the handle');

select is(
  ((select env from page) -> 'data' -> 'club' ->> 'is_solo')::boolean,
  false,
  'club.is_solo is false for a friend club — the FE stops re-deriving the "=" prefix');

-- The ordering assertion this file's cast was chosen for.
select is(
  (select array_agg(m ->> 'username')
     from jsonb_array_elements((select env from page) -> 'data' -> 'members') m),
  array['ada','bea','cade'],
  'members come back ALPHABETICAL — the header strip renders them in array order');

select is(
  (select count(*) from jsonb_array_elements((select env from page) -> 'data' -> 'members')),
  3::bigint,
  'members is the whole roster');

-- Every member carries the three fields `Member` declares; a missing
-- color is what renders an identity disc neutral.
select is(
  (select bool_and(m ? 'user_id' and m ? 'username' and m ? 'color')
     from jsonb_array_elements((select env from page) -> 'data' -> 'members') m),
  true,
  'each member carries user_id, username and color');

select is(
  (select count(*) from jsonb_array_elements((select env from page) -> 'data' -> 'gametypes')),
  (select count(*) from common.clubs_gametypes where club_handle = (select handle from club)),
  'gametypes is the club''s whole enrolled set');

-- The pair is the point: a second read for the defaults is what this
-- RPC exists to avoid, so `default_setup` travels with the name.
select is(
  (select bool_and(k ? 'gametype' and k ? 'default_setup')
     from jsonb_array_elements((select env from page) -> 'data' -> 'gametypes') k),
  true,
  'each gametype carries its default_setup, seeding SetupGameModal');

-- ============================================================
-- (2) The three refusals
-- ============================================================

-- PN494 — a miscopied or stale URL. Distinguishable from PN495 only
-- because a definer function can see the clubs row; RLS cannot.
select pg_temp.envelope_is(
  common.get_club_page('no-such-club-at-all'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN494","message":"No club with that name"}'::jsonb,
  'PN494: a handle with no club behind it');

-- PN495 — dee is a real signed-in user who is simply not in this club.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

select pg_temp.envelope_is(
  common.get_club_page((select handle from club)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN495","message":"You are not a member of this club"}'::jsonb,
  'PN495: the club exists, the caller is not in it');

-- PN493 — App only renders ClubPage with a session, but one can expire
-- between mount and this call.
reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.envelope_is(
  common.get_club_page((select handle from club)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN493","message":"Signed out; try refresh"}'::jsonb,
  'PN493: no auth.uid()');

-- ============================================================
-- (3) A solo club knows it is one
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (common.get_club_page('=ada') -> 'data' -> 'club' ->> 'is_solo')::boolean,
  true,
  'club.is_solo is true for a solo club');

select * from finish();
rollback;
