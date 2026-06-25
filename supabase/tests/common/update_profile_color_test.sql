-- ============================================================
-- Test: common.update_profile_color(new_color text)
-- ============================================================
-- The one mutable profile field today — the write path behind the
-- "Edit profile" dialog. Security-definer + caller-scoped (only ever
-- writes auth.uid()'s row) + validated against the palette.
--
-- See ../tinyspy/create_game_test.sql for the pgTAP primer +
-- ../_shared/setup.psql for the persona convention. _shared seeds each
-- persona's color as common.color_for_username(<name>).

begin;

set search_path = common, public, extensions;

\ir ../_shared/setup.psql

select plan(5);

-- ── Happy path: ada changes her own color ──────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  $$ select common.update_profile_color('purple') $$,
  'a player can set their own color');
select is(
  (select color from common.profiles
     where user_id = 'ada11111-1111-1111-1111-111111111111'),
  'purple', 'the color is updated');

-- ── Caller-scoped: bea's row is untouched. Checked as the test role
--    (reset out of `authenticated`) so we can call color_for_username
--    — bea's stored color still equals her seeded default. ──────────
reset role;
select is(
  (select color from common.profiles
     where user_id = 'bea22222-2222-2222-2222-222222222222'),
  common.color_for_username('bea'),
  'updating ada''s color leaves bea''s unchanged');

-- ── Off-palette color → friendly P0001, no change ──────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  $$ select common.update_profile_color('chartreuse') $$,
  'P0001', 'not a valid player color: chartreuse',
  'an off-palette color is rejected');
select is(
  (select color from common.profiles
     where user_id = 'ada11111-1111-1111-1111-111111111111'),
  'purple', 'the rejected update left the color unchanged');

select * from finish();
rollback;
