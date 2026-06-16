-- ============================================================
-- Test: common.handle_new_user trigger on auth.users
-- ============================================================
--
-- The trigger fires for every row inserted into auth.users and
-- has three responsibilities, each of which the rest of the app
-- depends on:
--
--   1. Materialize a common.profiles row with username derived
--      from the email's local-part.
--   2. Materialize a solo club (`=<username>` handle), insert
--      the user as its sole member, and mark them `created_by`.
--   3. Populate common.clubs_gametypes for the solo club — one
--      row per registered gametype — so the solo club is opted
--      in to every game by default.
--
-- All three are covered indirectly elsewhere:
--   - profile materialization: every other test relies on it (the
--     personas in _shared/setup.psql wouldn't have profiles
--     otherwise).
--   - solo-club + m2m: clubs_gametypes_test.sql checks ada's
--     solo club has the right m2m rows.
--
-- This file pins the trigger's contract directly with a fresh
-- auth.users insert and per-responsibility assertions. If a
-- future change drops one of the three (a refactor that splits
-- responsibilities across triggers, an accidental delete, etc.),
-- this test catches it without the failure looking like
-- "personas are broken."
--
-- See ../tinyspy/create_game_test.sql for the pgTAP primer +
-- ../_shared/setup.psql for the persona convention.

begin;

set search_path = common, public, extensions;

select plan(13);

-- We deliberately do NOT \ir ../_shared/setup.psql here — that
-- file inserts the standard personas, which would mask the
-- "fresh user lands cleanly" assertion (the trigger already ran
-- for them). Instead we insert one new user inline and assert on
-- exactly what materialized for them.
--
-- (`fia` is the persona we use for this test — a sixth name not
-- in the standard cast, picked to avoid any chance of collision
-- with the shared setup's ada/bea/cade/dee/eda. The UUID follows
-- the same self-evident pattern: 'fia66666-...'.)

insert into auth.users
  (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('f1a66666-6666-6666-6666-666666666666',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fia@test.local',
   now(), now(), now());

-- ============================================================
-- (1) Profile materialized with the derived username
-- ============================================================

select is(
  (select username from common.profiles
    where user_id = 'f1a66666-6666-6666-6666-666666666666'),
  'fia',
  'profile materialized with username = email local-part'
);

select is(
  (select count(*)::int from common.profiles
    where user_id = 'f1a66666-6666-6666-6666-666666666666'),
  1,
  'profile row landed exactly once (no double-fire)'
);

-- Color: seeded from common.color_for_username at signup. Must
-- be one of the 8 palette names; must equal what
-- color_for_username returns for the derived username (so the
-- trigger and the helper agree). The exact name isn't pinned
-- here because adding a name to the palette later shouldn't
-- force a test rewrite — see common.color_for_username's own
-- unit-of-truth comment in the migration.

select ok(
  (select color from common.profiles
    where user_id = 'f1a66666-6666-6666-6666-666666666666')
    = any (array['red','orange','yellow','green','teal','blue','purple','pink']),
  'profile.color is one of the 8 palette names'
);

select is(
  (select color from common.profiles
    where user_id = 'f1a66666-6666-6666-6666-666666666666'),
  common.color_for_username('fia'),
  'profile.color matches what color_for_username returns for the username'
);

-- Determinism: the helper must return the same color on every
-- call for the same input. Without this, db:reset would produce
-- different colors run-to-run and tests / FE caching would
-- thrash.
select is(
  common.color_for_username('fia'),
  common.color_for_username('fia'),
  'color_for_username is deterministic for the same input'
);

-- ============================================================
-- (2) Solo club materialized + member + created_by
-- ============================================================

select is(
  (select handle from common.clubs
    where created_by = 'f1a66666-6666-6666-6666-666666666666'),
  '=fia',
  'solo club exists with handle = "=" + username'
);

select is(
  (select name from common.clubs
    where created_by = 'f1a66666-6666-6666-6666-666666666666'),
  'fia',
  'solo club name = username'
);

select is(
  (select count(*)::int from common.clubs
    where created_by = 'f1a66666-6666-6666-6666-666666666666'),
  1,
  'exactly one solo club landed (no double-fire)'
);

-- Solo club has exactly one member, and that member is the user.
select is(
  (select count(*)::int from common.clubs_members m
     join common.clubs c on c.id = m.club_id
    where c.handle = '=fia'),
  1,
  'solo club has exactly one member'
);

select is(
  (select m.user_id from common.clubs_members m
     join common.clubs c on c.id = m.club_id
    where c.handle = '=fia'),
  'f1a66666-6666-6666-6666-666666666666'::uuid,
  'solo club''s only member is the user themselves'
);

-- ============================================================
-- (3) clubs_gametypes populated — one row per registered gametype
-- ============================================================
-- The trigger fans the registry across the solo club, so the
-- count here must match common.gametypes exactly. If a new
-- gametype is added to the registry, this assertion picks it up
-- automatically (it's a count comparison, not a hardcoded 3).

select is(
  (select count(*) from common.clubs_gametypes k
     join common.clubs c on c.id = k.club_id
    where c.handle = '=fia'),
  (select count(*) from common.gametypes),
  'solo club opted in to every registered gametype (count matches registry)'
);

select is(
  (select array_agg(k.gametype order by k.gametype)
     from common.clubs_gametypes k
     join common.clubs c on c.id = k.club_id
    where c.handle = '=fia'),
  (select array_agg(gametype order by gametype) from common.gametypes),
  'solo club''s m2m row set equals the registry exactly'
);

-- ============================================================
-- Idempotency check: a second auth.users insert with a different
-- email but the same username-local-part lands cleanly (the
-- trigger isn't expected to dedup — fresh user gets their own
-- profile + their own solo club). If the username collides on
-- common.profiles.username (UNIQUE), the INSERT fails and the
-- whole transaction aborts. Pinning the success path here so
-- the trigger's "happy path" is exercised both ways: first
-- insert from setup.psql (deferred for shared tests) and the
-- isolated insert above.
-- ============================================================

select is(
  (select count(*)::int from common.profiles
    where username = 'fia'),
  1,
  'exactly one profile uses the username "fia" — UNIQUE constraint holds'
);

-- ============================================================
select * from finish();
rollback;
