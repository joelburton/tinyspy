-- ============================================================
-- Test: common helpers (require_club_member, validate_timer)
-- ============================================================
--
-- These helpers are the canonical building blocks for every
-- gametype's create_game (and several mid-game RPCs). Per-game
-- tests already exercise them indirectly through RPC calls — this
-- file tests them directly so the contract is pinned in one
-- place, and so a future common-side change is caught here
-- before per-game suites all light up red at once.
--
-- The helpers are SECURITY DEFINER and revoked from public/no
-- grant to authenticated — they're internal, only callable from
-- within other SECURITY DEFINER RPCs.
--
-- Direct-call testing trick: the standard `pg_temp.as_user(uid)`
-- both sets the JWT claims (so auth.uid() returns the right
-- value) AND switches the session role to `authenticated`. The
-- role switch would lose execute privilege on these helpers.
-- For these tests we use `as_jwt_only(uid)` — just sets the
-- claims, leaves the role as postgres — so we can call the
-- helpers directly while simulating the authentication context
-- they would see in production.
--
-- See ../codenamesduet/create_game_test.sql for the broader pgTAP
-- primer (personas, as_user, begin/rollback).

begin;

set search_path = common, public, extensions;

select plan(13);

\ir ../_shared/setup.psql

-- Tests-only: set just the JWT claims without changing role.
-- The helpers read auth.uid() from request.jwt.claims regardless
-- of the active role, so this is enough to put the helper in
-- the "I see ada as the caller" context while we retain postgres
-- privileges to invoke it.
create function pg_temp.as_jwt_only(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
end;
$$;

-- ============================================================
-- Set up a club so the require_club_member happy path has a
-- membership to point at.
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

-- Reset to postgres for the helper-call tests below.
reset role;
select set_config('request.jwt.claims', '', true);

-- ============================================================
-- common.require_club_member
-- ============================================================

-- (1) Empty claims (auth.uid() returns null) → 'must be authenticated'
select set_config('request.jwt.claims', '', true);
select throws_ok(
  format(
    $$ select common.require_club_member(%L) $$,
    (select handle from club)
  ),
  '42501',
  'must be authenticated',
  'require_club_member: null auth.uid() raises 42501'
);

-- (2) Authenticated non-member → 'not a member of this club'
select pg_temp.as_jwt_only('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select common.require_club_member(%L) $$,
    (select handle from club)
  ),
  '42501',
  'not a member of this club',
  'require_club_member: non-member raises 42501'
);

-- (3) Authenticated member → returns caller_id
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select is(
  (select common.require_club_member((select handle from club))),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'require_club_member: member call returns caller_id'
);

-- ============================================================
-- common.validate_timer
-- ============================================================
-- No auth or role dependency — pure shape validation.

select set_config('request.jwt.claims', '', true);

-- (4) Null timer object
select throws_ok(
  $$ select common.validate_timer(null::jsonb) $$,
  'P0001',
  'setup.timer is required',
  'validate_timer: null raises setup.timer is required'
);

-- (5) Bogus timer.kind
select throws_ok(
  $$ select common.validate_timer('{"kind":"fast"}'::jsonb) $$,
  'P0001',
  'setup.timer.kind must be none, countup, or countdown (got fast)',
  'validate_timer: bogus kind raises with the value in the message'
);

-- (6) Missing timer.kind (empty object) → 'setup.timer.kind is required'
select throws_ok(
  $$ select common.validate_timer('{}'::jsonb) $$,
  'P0001',
  'setup.timer.kind is required',
  'validate_timer: missing kind raises with its own message'
);

-- (7) Countdown missing seconds
select throws_ok(
  $$ select common.validate_timer('{"kind":"countdown"}'::jsonb) $$,
  'P0001',
  'setup.timer.seconds is required for countdown',
  'validate_timer: countdown without seconds raises the right error'
);

-- (8) Countdown seconds=0 (below min)
select throws_ok(
  $$ select common.validate_timer('{"kind":"countdown","seconds":0}'::jsonb) $$,
  'P0001',
  'setup.timer.seconds must be 1..3600 (got 0)',
  'validate_timer: countdown seconds=0 is rejected'
);

-- (9) Countdown seconds=3601 (above 60-min cap)
select throws_ok(
  $$ select common.validate_timer('{"kind":"countdown","seconds":3601}'::jsonb) $$,
  'P0001',
  'setup.timer.seconds must be 1..3600 (got 3601)',
  'validate_timer: countdown seconds=3601 is rejected'
);

-- (10) kind=none accepted
select lives_ok(
  $$ select common.validate_timer('{"kind":"none"}'::jsonb) $$,
  'validate_timer: kind=none is accepted'
);

-- (11) kind=countup accepted (no seconds needed)
select lives_ok(
  $$ select common.validate_timer('{"kind":"countup"}'::jsonb) $$,
  'validate_timer: kind=countup is accepted'
);

-- (12) Countdown at the boundaries (1 and 3600)
select lives_ok(
  $$ select common.validate_timer('{"kind":"countdown","seconds":1}'::jsonb) $$,
  'validate_timer: countdown seconds=1 is accepted (lower boundary)'
);

select lives_ok(
  $$ select common.validate_timer('{"kind":"countdown","seconds":3600}'::jsonb) $$,
  'validate_timer: countdown seconds=3600 is accepted (upper boundary)'
);

-- ============================================================
-- (set_club_active_game tests removed)
-- ============================================================
-- The set_club_active_game helper and the club_active_game table
-- are gone. Their job is now done by `common.create_game` (which
-- flips is_active on common.games) and `common.end_game` (which
-- flips it back off). Coverage for the auto-suspend / flip
-- behavior lives in games_test.sql alongside the create_game and
-- end_game tests.

-- ============================================================
select * from finish();
rollback;
