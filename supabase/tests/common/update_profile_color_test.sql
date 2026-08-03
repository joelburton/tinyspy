-- ============================================================
-- Test: common.update_profile_color(new_color text)
-- ============================================================
-- The one mutable profile field today — the write path behind the
-- "Edit profile" dialog. Security-definer + caller-scoped (only ever
-- writes auth.uid()'s row) + validated against the palette.
--
-- See ../codenamesduet/create_game_test.sql for the pgTAP primer +
-- ../_shared/setup.psql for the persona convention. _shared seeds each
-- persona's color as common.color_for_username(<name>).

begin;

set search_path = common, public, extensions;

\ir ../_shared/setup.psql

select plan(8);

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

-- ── The reserved `theme` column ─────────────────────────────────────
-- Nothing reads or writes it yet (2026-08-03) — it's held for a future theme
-- picker. Pinned so the reservation is deliberate rather than something a
-- future migration quietly "cleans up": a claimed profile starts with NO theme
-- preference, and NULL is what "use the app default" looks like.
select is(
  (select theme from common.profiles
    where user_id = 'ada11111-1111-1111-1111-111111111111'),
  null,
  'theme: a profile starts with no theme preference'
);
-- A player can't write it directly, reserved or not: `common.profiles` has no
-- UPDATE policy or grant, so every profile write goes through an RPC (the
-- pattern `update_profile_color` above sets, and the one a future theme picker
-- will follow). Worth pinning on a NEW column — that's when someone is most
-- likely to reach for a plain `.update()` from the FE and find it works.
select throws_ok(
  $$ update common.profiles set theme = 'midnight'
      where user_id = 'ada11111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'theme: an authenticated player cannot UPDATE it directly'
);
reset role;
-- Free-form at the schema level, though: no CHECK, no enum, because the real
-- theme names don't exist yet. Constrain it when they do.
select lives_ok(
  $$ update common.profiles set theme = 'anything-goes-for-now'
      where user_id = 'ada11111-1111-1111-1111-111111111111' $$,
  'theme: free-form text, unconstrained while it is a placeholder'
);

select * from finish();
rollback;
