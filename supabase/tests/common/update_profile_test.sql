-- cs-blessed-account

-- ============================================================
-- Test: common.update_profile(new_color text, new_sounds_enabled boolean)
-- ============================================================
-- The profile's editable fields, saved together — the write path behind the
-- "Edit profile" dialog. Security-definer + caller-scoped (only ever writes
-- auth.uid()'s row) + validated against the palette.
--
-- Also pins `sounds_enabled`'s DEFAULT, since that default is the whole of how
-- existing accounts got the setting turned on: every seeded persona was
-- created without naming the column, and reads true.
--
-- The reserved `theme` column is pinned next door, in
-- `profiles_theme_test.sql`: this RPC never touches it.
--
-- The pgTAP + persona conventions are docs/testing.md's. `_shared/setup.psql`
-- seeds each persona's color as common.color_for_username(<name>).

begin;

set search_path = common, public, extensions;

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

select plan(9);

-- ── The default: a profile nobody has set sounds on has them ON ─────
select is(
  (select sounds_enabled from common.profiles
     where user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'a profile starts with sounds enabled');

-- ── Happy path: ada saves a new color and turns sounds off ─────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  common.update_profile('purple', false),
  '{"type": "ok", "data": {"result": "saved"}}'::jsonb,
  'a player can save their own profile');
select is(
  (select color from common.profiles
     where user_id = 'ada11111-1111-1111-1111-111111111111'),
  'purple', 'the color is updated');
select is(
  (select sounds_enabled from common.profiles
     where user_id = 'ada11111-1111-1111-1111-111111111111'),
  false, 'the sound setting is updated');

-- ── Caller-scoped: bea's row is untouched. Checked as the test role
--    (reset out of `authenticated`) so we can call color_for_username
--    — bea's stored color still equals her seeded default. ──────────
reset role;
select is(
  (select (color, sounds_enabled) from common.profiles
     where user_id = 'bea22222-2222-2222-2222-222222222222'),
  (common.color_for_username('bea'), true),
  'saving ada''s profile leaves bea''s unchanged');

-- ── Off-palette color → a fault, and nothing changes ───────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- A fault, not a validation: the picker offers the eight palette swatches and
-- nothing else, so an off-palette value means a broken client.
select pg_temp.envelope_is(
  common.update_profile('chartreuse', true),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN033",
    "message": "BUG: color outside the palette: chartreuse"}'::jsonb,
  'an off-palette color is rejected');
select is(
  (select (color, sounds_enabled) from common.profiles
     where user_id = 'ada11111-1111-1111-1111-111111111111'),
  ('purple'::text, false),
  'the rejected save left both fields unchanged');

-- ── A null sound setting → a fault in the envelope, not a raw 23502 ─
select pg_temp.envelope_is(
  common.update_profile('green', null),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN501",
    "message": "BUG: sound setting missing"}'::jsonb,
  'a missing sound setting is rejected');
select is(
  (select color from common.profiles
     where user_id = 'ada11111-1111-1111-1111-111111111111'),
  'purple', 'the rejected save did not write the color either');

select * from finish();
rollback;
