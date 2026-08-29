-- cs-unmet

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
-- See `codenamesduet/create_game_test.sql` for the pgTAP /
-- auth-simulation primer this file builds on.

begin;

set search_path = common, public, extensions;

\ir ../_shared/envelope.psql

select plan(27);

-- Cast: ada/bea/cade are the three in-club personas this test
-- uses (creating clubs, being members, exercising the handle-
-- collision path). dee/eda are loaded too but unused here. Each
-- of the five gets a solo club from the on_auth_user_created
-- trigger, so the DB has 5 solo clubs before any explicit
-- create_club runs — relevant for the solo-club assertions
-- in Block 6, which scope their count to these fixture users.

\ir ../_shared/setup.psql

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

-- A session that expired mid-form is REACHABLE, so it comes back as a result
-- rather than an exception — but as a `fault`, because nothing in the form
-- fixes it and the modal is where the player is told to refresh.
select pg_temp.envelope_is(
  common.create_club('Some Club', array['ada','bea']),
  '{"type": "not-ok", "severity": "fault", "field": "_", "message": "Signed out; try refresh"}'::jsonb,
  'create_club: not authenticated is a fault'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- The next four are FAULTS, not validations: the form's `handleError` and
-- `maxLength` catch every one of them before the call, so reaching the server
-- with such a name means something is broken. Their messages say so — they are
-- written for whoever reads the fault modal, not for a player fixing a name.
select pg_temp.envelope_is(
  common.create_club('!!!', array['bea']),
  '{"type": "not-ok", "severity": "fault", "field": "_", "dbcode": "PN004"}'::jsonb,
  'create_club: a name with no alphanumerics is a fault'
);

-- The name ceiling (20). Rejected as a clean P0001 rather than the table's own
-- 23514, because CreateClubPage renders the message verbatim. It also keeps the
-- DERIVED HANDLE legal: slugify truncates at 40 but the handle check allows 30,
-- so a ~31-40 character name used to die on that constraint instead.
select pg_temp.envelope_is(
  common.create_club('The Wednesday Night Word Game Society', array['bea']),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN003"}'::jsonb,
  'create_club: a name over 20 characters is a fault'
);
-- The boundary is still a boundary: 20 exactly is accepted, and `type: ok` is
-- now what "accepted" looks like.
select pg_temp.envelope_is(
  common.create_club('Twenty Chars Exactly', array['bea']),
  '{"type": "ok"}'::jsonb,
  'create_club: exactly 20 characters is accepted'
);

-- The handle floor (3). Its ceiling is covered by the 20-char name cap, but
-- nothing covered the floor: a two-letter name passed every check in the RPC
-- and died on the table's CHECK with a raw 23514, which the create-club form
-- had a branch to translate. The raise is what makes that branch unnecessary.
select pg_temp.envelope_is(
  common.create_club('Jo', array['bea']),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN006"}'::jsonb,
  'create_club: a handle under 3 characters is a fault'
);

-- The next three are VALIDATIONS — the form cannot know who exists, cannot
-- know whether the caller is already in the list, and cannot win the race for a
-- handle. Each names the input it belongs under, which is what `field` is for.
select pg_temp.envelope_is(
  common.create_club('Some Club', array['nonesuch']),
  '{"type": "not-ok", "severity": "form-validation", "field": "member_usernames",
    "message": "No such user: nonesuch"}'::jsonb,
  'create_club: an unknown username is a validation, naming the offender'
);

-- Just the caller in the list, no other members → < 2 → rejected.
-- (The caller is auto-added if missing, but membership still needs
-- to be >= 2 after that.)
select pg_temp.envelope_is(
  common.create_club('Just Me', array['ada']),
  '{"type": "not-ok", "severity": "form-validation", "field": "member_usernames",
    "message": "A club needs at least 2 members"}'::jsonb,
  'create_club: lone-caller membership is a validation'
);

-- Empty member list → caller alone is added → still < 2 → rejected.
select pg_temp.envelope_is(
  common.create_club('Empty Members', array[]::text[]),
  '{"type": "not-ok", "severity": "form-validation", "field": "member_usernames"}'::jsonb,
  'create_club: an empty member list is a validation'
);

-- ============================================================
-- Block 3: create_club happy path
-- ============================================================

-- The SUBJECT of this file, so it calls the real function and reads the
-- envelope. (Everywhere else in the suite, a club is setup — those go through
-- `pg_temp.create_club`, which unwraps the handle in one place.)
create temp table created_club on commit drop as
select common.create_club('Joel and Leah', array['ada','bea','cade']) as envelope;

select pg_temp.envelope_is(
  (select envelope from created_club),
  '{"type": "ok", "data": {"result": "created"}}'::jsonb,
  'create_club: a successful create answers ok/created'
);

select is(
  (select envelope -> 'data' ->> 'handle' from created_club),
  'joel-and-leah',
  'create_club: the handle it returns is the slugified name'
);

-- All three listed users are members.
select is(
  (select count(*) from common.clubs_members
    where club_handle = (select envelope -> 'data' ->> 'handle' from created_club)),
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
select pg_temp.create_club('Friday Night', array['ada','cade']) as handle;

select is(
  (select count(*) from common.clubs_members
    where club_handle = (select handle from bobs_club)),
  3::bigint,
  'create_club: caller is auto-added when omitted from member_usernames'
);

select ok(
  (select exists (
    select 1 from common.clubs_members
    where club_handle = (select handle from bobs_club)
      and user_id = 'bea22222-2222-2222-2222-222222222222'
  )),
  'create_club: auto-added caller appears in clubs_members'
);

-- ============================================================
-- Block 5: handle collision
-- ============================================================
-- cade attempts to create a club whose name slugifies to the same handle as
-- bea's 'Friday Night' → 'friday-night'. The PK is the referee — a pre-check
-- `select` cannot close this race, since two callers can both see the handle
-- free — so its unique_violation is caught and re-raised, which propagates out
-- of that inner handler to the function's own.
--
-- It is a VALIDATION, on `club_name`: picking another name is exactly what
-- fixes it. The message carries the HANDLE that collided, which is the part
-- two differently spelled names share.

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');

select pg_temp.envelope_is(
  common.create_club('friday night', array['ada','bea']),
  '{"type": "not-ok", "severity": "form-validation", "field": "club_name",
    "dbcode": "PN009", "message": "Club name taken (handle “friday-night”)"}'::jsonb,
  'create_club: a handle collision is a validation naming the handle'
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
  (select count(*) from common.clubs_members
    where club_handle = (select handle from common.clubs where handle = '=ada')),
  1::bigint,
  'solo clubs: a solo club has exactly one member'
);

select ok(
  (select exists (
    select 1 from common.clubs_members cm
    where cm.club_handle = (select handle from common.clubs where handle = '=ada')
      and cm.user_id = 'ada11111-1111-1111-1111-111111111111'
  )),
  'solo clubs: the sole member is the user themselves'
);

-- `is_solo` is the generated column that carries the `=` convention, so that
-- knowing what a solo handle looks like stays the database's job (the home
-- list orders by it). Asserted as an EQUIVALENCE over every fixture club, in
-- both directions: a wrong generation expression that simply said `true` (or
-- `false`) would pass a one-sided check on one club.
select is(
  (select count(*) from common.clubs where is_solo <> (handle like '=%')),
  0::bigint,
  'solo clubs: is_solo agrees with the = prefix on every club'
);

select is(
  (select count(*) filter (where is_solo) from common.clubs
    where created_by in (
      'ada11111-1111-1111-1111-111111111111',
      'bea22222-2222-2222-2222-222222222222',
      'cade3333-3333-3333-3333-333333333333'
    )),
  3::bigint,
  'solo clubs: is_solo is true for exactly the three auto-created ones'
);

-- Generated, not writable: an INSERT naming it is rejected outright — 428C9,
-- `generated_always`, "cannot insert a non-DEFAULT value" — so no caller can
-- create a club that lies about being solo.
select throws_ok(
  $$insert into common.clubs (handle, name, created_by, is_solo)
    values ('not-solo-really', 'Nope', 'ada11111-1111-1111-1111-111111111111', true)$$,
  '428C9',
  null,
  'solo clubs: is_solo cannot be written by a caller'
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
