-- ============================================================
-- Local dev seed — fixed test accounts + clubs (LOCAL ONLY)
-- ============================================================
-- Recreates a stable set of magic-link-loginable accounts + clubs so a
-- browser session survives `db:reset` churn. How it works: the local JWT
-- signing secret is fixed across resets, so a token already sitting in your
-- browser stays validly signed; because the user ids below are FIXED,
-- auth.uid() keeps resolving to the same person after every reset, and this
-- seed puts their profiles + clubs back. Log in once (magic link — the link
-- shows in the local mail inbox at http://127.0.0.1:54324); with jwt_expiry
-- maxed in config.toml you then stay logged in across resets for up to a week
-- before needing another link.
--
-- NOT for production: it fabricates auth.users + auth.identities rows directly.
-- It runs only via `npm run seed` (which `npm run db:reset` chains) against the
-- local stack (SUPABASE_DB_URL defaults to the local db). The `deadbeef-…` uuid
-- prefix marks these as the dev-seed accounts at a glance.
--
-- Idempotent + non-destructive: every insert is ON CONFLICT DO NOTHING, so
-- re-running never duplicates and never wipes in-progress games. To change a
-- color/username here, run `npm run db:reset` (a fresh DB) rather than re-seed.
--
-- Accounts (username / email / identity color):
--   joel  joel@test.local  orange
--   moth  moth@test.local  purple
--   leah  leah@test.local  blue
-- Clubs: a solo club each (=joel / =moth / =leah), plus joel-moth (joel + moth)
--   and all-3 (joel + moth + leah).

begin;

-- ── auth.users — confirmed email users (so magic-link/OTP sign-in works).
-- The eight token / *_change columns are set to '' (empty string), NOT left
-- NULL: GoTrue scans them as Go strings and errors ("converting NULL to string
-- is unsupported") when finding a hand-inserted user with NULLs there. Setting
-- them empty is the standard fix for SQL-seeded auth users. ──
insert into auth.users
  (id, instance_id, aud, role, email, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values
  ('deadbeef-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'joel@test.local', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   '', '', '', '', '', '', '', ''),
  ('deadbeef-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'moth@test.local', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   '', '', '', '', '', '', '', ''),
  ('deadbeef-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'leah@test.local', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
   '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

-- ── auth.identities — the email identity GoTrue expects for OTP/magic-link.
-- provider_id = the user id (modern GoTrue convention for the email provider);
-- the `email` column is GENERATED from identity_data, so it's omitted here. ──
insert into auth.identities
  (user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
values
  ('deadbeef-0000-0000-0000-000000000001', 'email', 'deadbeef-0000-0000-0000-000000000001',
   '{"sub":"deadbeef-0000-0000-0000-000000000001","email":"joel@test.local","email_verified":true,"phone_verified":false}'::jsonb,
   now(), now(), now()),
  ('deadbeef-0000-0000-0000-000000000002', 'email', 'deadbeef-0000-0000-0000-000000000002',
   '{"sub":"deadbeef-0000-0000-0000-000000000002","email":"moth@test.local","email_verified":true,"phone_verified":false}'::jsonb,
   now(), now(), now()),
  ('deadbeef-0000-0000-0000-000000000003', 'email', 'deadbeef-0000-0000-0000-000000000003',
   '{"sub":"deadbeef-0000-0000-0000-000000000003","email":"leah@test.local","email_verified":true,"phone_verified":false}'::jsonb,
   now(), now(), now())
on conflict (provider_id, provider) do nothing;

-- ── Profiles — username + the requested identity colors. (Mirrors what
-- common.claim_username would materialize; the colors are set explicitly
-- rather than via color_for_username so joel/moth/leah are always the same.) ──
insert into common.profiles (user_id, username, color) values
  ('deadbeef-0000-0000-0000-000000000001', 'joel', 'orange'),
  ('deadbeef-0000-0000-0000-000000000002', 'moth', 'purple'),
  ('deadbeef-0000-0000-0000-000000000003', 'leah', 'blue')
on conflict (user_id) do nothing;

-- ── Solo clubs ('=<username>', created by the owner), like claim_username ──
insert into common.clubs (handle, name, created_by) values
  ('=joel', 'joel', 'deadbeef-0000-0000-0000-000000000001'),
  ('=moth', 'moth', 'deadbeef-0000-0000-0000-000000000002'),
  ('=leah', 'leah', 'deadbeef-0000-0000-0000-000000000003')
on conflict (handle) do nothing;

-- ── Two shared friend clubs (created by joel) ──
insert into common.clubs (handle, name, created_by) values
  ('joel-moth', 'joel-moth', 'deadbeef-0000-0000-0000-000000000001'),
  ('all-3', 'all-3', 'deadbeef-0000-0000-0000-000000000001')
on conflict (handle) do nothing;

-- ── Memberships ──
insert into common.clubs_members (club_handle, user_id) values
  ('=joel', 'deadbeef-0000-0000-0000-000000000001'),
  ('=moth', 'deadbeef-0000-0000-0000-000000000002'),
  ('=leah', 'deadbeef-0000-0000-0000-000000000003'),
  ('joel-moth', 'deadbeef-0000-0000-0000-000000000001'),
  ('joel-moth', 'deadbeef-0000-0000-0000-000000000002'),
  ('all-3', 'deadbeef-0000-0000-0000-000000000001'),
  ('all-3', 'deadbeef-0000-0000-0000-000000000002'),
  ('all-3', 'deadbeef-0000-0000-0000-000000000003')
on conflict (club_handle, user_id) do nothing;

-- ── Enroll every club in its gametypes — solo clubs get the solo-playable
-- ones, shared clubs get all — exactly what claim_username / create_club do
-- (via common.default_gametypes_for_club, the single source of truth). ──
insert into common.clubs_gametypes (club_handle, gametype)
  select c.handle, gt.gametype
    from (values ('=joel'), ('=moth'), ('=leah'), ('joel-moth'), ('all-3')) as c(handle)
   cross join lateral common.default_gametypes_for_club(c.handle) as gt(gametype)
on conflict (club_handle, gametype) do nothing;

commit;
