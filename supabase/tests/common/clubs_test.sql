-- ============================================================
-- Test: clubs + create_club RPC + solo-club auto-creation
-- ============================================================
--
-- Coverage:
--   1. slugify_club_name produces the expected handles
--      (lowercase, non-alnum → '-', solo-namespace '=' stripped)
--   2. create_club rejection paths:
--        - not authenticated
--        - empty handle (e.g., "!!!")
--        - unknown username
--        - fewer than 2 members
--        - handle collision
--   3. create_club happy path:
--        - returns (id, handle)
--        - all members listed
--        - caller auto-added when not in list
--        - solo clubs don't count toward membership conflict
--          (a 2-person regular club + everyone's pre-existing solo
--          clubs all coexist)
--   4. Solo-club auto-creation on signup:
--        - each new auth.users insert produces a club whose handle
--          is '=' + username
--        - the user is the sole member
--   5. RLS: non-member SELECT returns 0 rows; member SELECT returns
--      the row.
--
-- See `tinyspy/create_game_test.sql` for the pgTAP /
-- auth-simulation primer this file builds on.

begin;

set search_path = common, public, extensions;

select plan(21);

-- Cast: ada/bea/cade are the three in-club personas this test
-- uses (creating clubs, being members, exercising the handle-
-- collision path). dee/eda are loaded too but unused here. Each
-- of the five gets a solo club from the on_auth_user_created
-- trigger, so the DB has 5 solo clubs before any explicit
-- create_club runs — relevant for the solo-club assertions
-- in Block 6, which scope their count to these fixture users.

\ir ../_common/setup.psql

-- ============================================================
-- Block 1: slugify_club_name
-- ============================================================

select is(common.slugify_club_name('Joel and Leah'), 'joel-and-leah',
  'slugify: spaces → hyphens, lowercased');

select is(common.slugify_club_name('=joel'), 'joel',
  'slugify: leading "=" stripped → user input cannot reach solo-club namespace');

select is(common.slugify_club_name('  Trailing & whitespace!  '), 'trailing-whitespace',
  'slugify: trim + punctuation → hyphen, no trailing hyphen');

select is(common.slugify_club_name('!!!'), '',
  'slugify: all-punctuation produces empty handle (caller rejects)');

-- ============================================================
-- Block 2: create_club rejection paths
-- ============================================================

-- Clear any test JWT for the unauthenticated case.
select set_config('request.jwt.claims', '', true)
     , set_config('role', 'postgres', true) where false;

select throws_ok(
  $$ select common.create_club('Some Club', array['ada','bea']) $$,
  '42501',
  'must be authenticated',
  'create_club: not authenticated raises 42501'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select throws_ok(
  $$ select common.create_club('!!!', array['bea']) $$,
  'P0001',
  'club name must contain alphanumeric characters',
  'create_club: name with no alphanumerics is rejected'
);

select throws_ok(
  $$ select common.create_club('Some Club', array['nonesuch']) $$,
  'P0002',
  'unknown usernames: nonesuch',
  'create_club: unknown username is rejected with the offending name'
);

-- Just the caller in the list, no other members → < 2 → rejected.
-- (The caller is auto-added if missing, but membership still needs
-- to be >= 2 after that.)
select throws_ok(
  $$ select common.create_club('Just Me', array['ada']) $$,
  'P0001',
  'a club must have at least 2 members',
  'create_club: lone-caller membership is rejected'
);

-- Empty member list → caller alone is added → still < 2 → rejected.
select throws_ok(
  $$ select common.create_club('Empty Members', array[]::text[]) $$,
  'P0001',
  'a club must have at least 2 members',
  'create_club: empty member list is rejected'
);

-- ============================================================
-- Block 3: create_club happy path
-- ============================================================

create temp table created_club on commit drop as
select * from common.create_club('Joel and Leah', array['ada','bea','cade']);

select is(
  (select count(*) from created_club),
  1::bigint,
  'create_club: returns exactly one (id, handle) row'
);

select is(
  (select handle from created_club),
  'joel-and-leah',
  'create_club: returned handle is the slugified name'
);

-- All three listed users are members.
select is(
  (select count(*) from common.club_members
    where club_id = (select id from created_club)),
  3::bigint,
  'create_club: all three listed members were added'
);

-- ============================================================
-- Block 4: caller auto-added when not in list
-- ============================================================
-- bea creates a club listing only ada + cade; bea should be
-- silently added so the membership has 3, not 2.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

create temp table bobs_club on commit drop as
select * from common.create_club('Friday Night', array['ada','cade']);

select is(
  (select count(*) from common.club_members
    where club_id = (select id from bobs_club)),
  3::bigint,
  'create_club: caller is auto-added when omitted from member_usernames'
);

select ok(
  (select exists (
    select 1 from common.club_members
    where club_id = (select id from bobs_club)
      and user_id = 'bea22222-2222-2222-2222-222222222222'
  )),
  'create_club: auto-added caller appears in club_members'
);

-- ============================================================
-- Block 5: handle collision
-- ============================================================
-- cade attempts to create a club whose name slugifies to the same
-- handle as bea's 'Friday Night' → 'friday-night'. Unique constraint
-- raises SQLSTATE 23505 (unique_violation).

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');

select throws_ok(
  $$ select common.create_club('friday night', array['ada','bea']) $$,
  '23505',
  null,
  'create_club: handle collision raises unique_violation'
);

-- ============================================================
-- Block 6: solo-club auto-creation
-- ============================================================
-- All three users got solo clubs at signup-time (the auth.users
-- insert fixtures above). Each solo club:
--   - has handle '=<username>'
--   - has exactly one member (the user themselves)
--
-- Reset to the postgres role so the cross-user count queries
-- bypass RLS — otherwise we'd only see the "currently logged in"
-- user's solo club.

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

-- Scoped to this test's three fixture users — not a blanket count
-- of every solo club in the DB. Bare `count(*) where handle like '=%'`
-- would be brittle to any pre-existing solo clubs left over from
-- interactive testing on the same dev DB (e.g. real signups during
-- a smoke session); pgTAP's begin/rollback wrap protects against
-- cross-test pollution, not pre-test seed/local state.
select is(
  (select count(*) from common.clubs
    where handle like '=%'
      and created_by in (
        'ada11111-1111-1111-1111-111111111111',
        'bea22222-2222-2222-2222-222222222222',
        'cade3333-3333-3333-3333-333333333333'
      )),
  3::bigint,
  'solo clubs: one per user was auto-created on signup'
);

select is(
  (select handle from common.clubs where created_by = 'ada11111-1111-1111-1111-111111111111' and handle like '=%'),
  '=ada',
  'solo clubs: ada''s solo handle is "=ada"'
);

select is(
  (select count(*) from common.club_members
    where club_id = (select id from common.clubs where handle = '=ada')),
  1::bigint,
  'solo clubs: a solo club has exactly one member'
);

select ok(
  (select exists (
    select 1 from common.club_members cm
    where cm.club_id = (select id from common.clubs where handle = '=ada')
      and cm.user_id = 'ada11111-1111-1111-1111-111111111111'
  )),
  'solo clubs: the sole member is the user themselves'
);

-- ============================================================
-- Block 7: RLS
-- ============================================================
-- ada is in 'Joel and Leah' but NOT in cade's solo club.
--   - ada SELECTing 'Joel and Leah' should return 1 row.
--   - ada SELECTing '=cade' should return 0 rows (RLS hides it).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select count(*) from common.clubs where handle = 'joel-and-leah'),
  1::bigint,
  'RLS: member can see their club'
);

select is(
  (select count(*) from common.clubs where handle = '=cade'),
  0::bigint,
  'RLS: non-member cannot see another user''s solo club'
);

-- ============================================================
-- Wrap-up
-- ============================================================

select * from finish();
rollback;
