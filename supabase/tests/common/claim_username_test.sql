-- cs-unmet

-- ============================================================
-- Test: common.claim_username(desired text, chosen_color text) RPC
-- ============================================================
--
-- claim_username is the entry point a freshly-authenticated user
-- hits to pick their permanent handle. It atomically:
--
--   1. Inserts the common.profiles row (user_id := auth.uid(),
--      chosen username, the player's chosen color).
--   2. Creates a solo club with handle '=<username>'.
--   3. Adds the user as the solo club's sole member.
--   4. Populates common.clubs_gametypes for the solo club —
--      one row per registered gametype.
--
-- This file pins the end-to-end contract: regex validation,
-- happy-path materialization, double-claim rejection, username
-- collision rejection, stale-JWT rejection. The personas-side
-- assertions live in clubs_test.sql; here we exercise the RPC
-- in isolation.
--
-- We deliberately do NOT \ir ../_shared/setup.psql here — that
-- file does its own profile-and-solo-club materialization for
-- the standard personas, which would interfere with the
-- "fresh user" assertions. Instead each subtest below inserts
-- the auth.users row it needs inline.
--
-- See ../codenamesduet/create_game_test.sql for the pgTAP primer +
-- ../_shared/setup.psql for the persona convention.

begin;

set search_path = common, public, extensions;

select plan(20);

-- The envelope assertions only; setup.psql is skipped for the reason above.
\ir ../_shared/envelope.psql

-- pg_temp.as_user lives in _shared/setup.psql, but we're skipping
-- it. Inline a minimal copy so each subtest can switch sessions.
create function pg_temp.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ============================================================
-- Setup: a fresh auth.users row with no profile
-- ============================================================

insert into auth.users
  (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('f1a66666-6666-6666-6666-666666666666',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fia@test.local',
   now(), now(), now());

-- Sanity: no profile rows for fia yet (the trigger is gone — only
-- the explicit RPC creates the profile now).
select is(
  (select count(*)::int from common.profiles
    where user_id = 'f1a66666-6666-6666-6666-666666666666'),
  0,
  'fresh auth.users row has no profile yet (no auto-trigger)'
);

select is(
  (select count(*)::int from common.clubs
    where created_by = 'f1a66666-6666-6666-6666-666666666666'),
  0,
  'fresh auth.users row has no solo club yet'
);

-- ============================================================
-- (1) Unauthenticated callers are rejected
-- ============================================================
-- No JWT claim → auth.uid() returns NULL → RPC raises 42501.

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select pg_temp.envelope_is(
  common.claim_username('fia', 'blue'),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN013", "message": "Signed out; try refresh"}'::jsonb,
  'claim_username: no auth.uid() is a fault'
);

-- ============================================================
-- (2) Regex validation — bad inputs raise P0001
-- ============================================================

select pg_temp.as_user('f1a66666-6666-6666-6666-666666666666');

-- Too short (must be 3+ chars)
select pg_temp.envelope_is(
  common.claim_username('ab', 'blue'),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN014", "message": "BUG: username in the wrong format"}'::jsonb,
  'claim_username: 2-char username rejected'
);

-- Starts with digit (must start with letter)
select pg_temp.envelope_is(
  common.claim_username('1abc', 'blue'),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN014", "message": "BUG: username in the wrong format"}'::jsonb,
  'claim_username: leading digit rejected'
);

-- Uppercase letters
select pg_temp.envelope_is(
  common.claim_username('Joel', 'blue'),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN014", "message": "BUG: username in the wrong format"}'::jsonb,
  'claim_username: uppercase letters rejected'
);

-- Dot (only a-z, 0-9, - are allowed)
select pg_temp.envelope_is(
  common.claim_username('joel.smith', 'blue'),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN014", "message": "BUG: username in the wrong format"}'::jsonb,
  'claim_username: dot rejected'
);

-- 16 chars (1 over the cap)
select pg_temp.envelope_is(
  common.claim_username('aaaaaaaaaaaaaaaa', 'blue'),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN014", "message": "BUG: username in the wrong format"}'::jsonb,
  'claim_username: 16-char username rejected'
);

-- Leading = (reserved for solo-club prefix; the regex on
-- profiles.username doesn't allow it)
select pg_temp.envelope_is(
  common.claim_username('=joel', 'blue'),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN014", "message": "BUG: username in the wrong format"}'::jsonb,
  'claim_username: leading = rejected'
);

-- Off-palette color: the username is fine and fia hasn't claimed yet,
-- so the color check is what rejects it (and nothing is inserted).
select pg_temp.envelope_is(
  common.claim_username('fia', 'chartreuse'),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN015", "message": "BUG: color outside the palette"}'::jsonb,
  'claim_username: off-palette color rejected'
);

-- Verify no side effects landed for any of the rejected attempts.
select is(
  (select count(*)::int from common.profiles
    where user_id = 'f1a66666-6666-6666-6666-666666666666'),
  0,
  'no profile created after regex-rejected claims'
);

-- ============================================================
-- (3) Happy path — fia claims their handle
-- ============================================================

select pg_temp.envelope_is(
  common.claim_username('fia', 'blue'),
  '{"type": "ok", "data": {"username": "fia"}}'::jsonb,
  'claim_username: valid claim succeeds, and hands back the name'
);

select is(
  (select username from common.profiles
    where user_id = 'f1a66666-6666-6666-6666-666666666666'),
  'fia',
  'profile materialized with the claimed username'
);

select is(
  (select color from common.profiles
    where user_id = 'f1a66666-6666-6666-6666-666666666666'),
  'blue',
  'profile materialized with the chosen color'
);

-- Solo club: handle '=fia', name 'fia', created_by the user.
select is(
  (select handle from common.clubs
    where created_by = 'f1a66666-6666-6666-6666-666666666666'),
  '=fia',
  'solo club materialized with handle = "=" + username'
);

-- Solo club has exactly the user as its sole member.
select is(
  (select count(*)::int from common.clubs_members
    where club_handle = '=fia'),
  1,
  'solo club has exactly one member'
);

select is(
  (select user_id from common.clubs_members
    where club_handle = '=fia'),
  'f1a66666-6666-6666-6666-666666666666'::uuid,
  'solo club''s sole member is fia herself'
);

-- clubs_gametypes fans out across the solo-playable registry — a
-- solo club only enrolls in gametypes one person can play, and only
-- the default-enroll ones (psychicnum's pair opts out).
select is(
  (select count(*) from common.clubs_gametypes
    where club_handle = '=fia'),
  (select count(*) from common.gametypes
    where min_players <= 1 and default_enroll),
  'solo club opted in to every solo-playable default-enroll gametype'
);

-- ============================================================
-- (4) Double-claim rejection — the same user can't claim twice
-- ============================================================
-- The user_id PK on common.profiles would reject the second
-- INSERT with 23505, but the RPC catches it earlier with a
-- clean P0001 so the FE can distinguish "you already claimed"
-- from "someone else has that username."

select pg_temp.envelope_is(
  common.claim_username('fianewname', 'blue'),
  '{"type": "not-ok", "severity": "service-error", "dbcode": "PN016",
    "message": "You already have a username"}'::jsonb,
  'claim_username: same user can''t claim twice'
);

-- ============================================================
-- (5) Username collision — second user wants fia's name
-- ============================================================

reset role;
select set_config('request.jwt.claims', '', true);

insert into auth.users
  (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('9a999999-9999-9999-9999-999999999999',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'other@test.local',
   now(), now(), now());

select pg_temp.as_user('9a999999-9999-9999-9999-999999999999');

-- The profiles.username UNIQUE constraint is the referee — a pre-check
-- `select` could not close the race — and its 23505 is caught and given words.
-- The one outcome here a player can act on, so it is the one validation, and it
-- names the field the claim form binds to.
select pg_temp.envelope_is(
  common.claim_username('fia', 'blue'),
  '{"type": "not-ok", "severity": "form-validation", "dbcode": "PN017",
    "field": "desired", "message": "That username is taken"}'::jsonb,
  'claim_username: a taken username is a validation, on the field that caused it'
);

-- ============================================================
select * from finish();
rollback;
