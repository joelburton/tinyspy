-- cs-blessed-account

-- ============================================================
-- Test: common.profiles.theme — the reserved column
-- ============================================================
-- `theme` is held for a future theme picker: a free-form nullable `text`
-- column nothing reads or writes. These pin the reservation, so that it stays
-- deliberate rather than something a later migration quietly "cleans up".
--
-- Coverage:
--   1. A claimed profile starts with NO theme preference — NULL is what
--      "use the app default" looks like.
--   2. A player cannot write it directly. `common.profiles` has no UPDATE
--      policy or grant, so every profile write goes through an RPC — the
--      pattern `update_profile_color` sets, and the one a theme picker will
--      follow. Worth pinning on a reserved column: it is exactly where
--      someone reaches for a plain `.update()` from the FE and finds it works.
--   3. Free-form at the schema level — no CHECK, no enum, because the real
--      theme names do not exist yet. Constrain it when they do.
--
-- The RPC that writes the one column a player CAN change is next door, in
-- `update_profile_color_test.sql`.

begin;

set search_path = common, public, extensions;

\ir ../_shared/setup.psql

select plan(3);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select theme from common.profiles
    where user_id = 'ada11111-1111-1111-1111-111111111111'),
  null,
  'theme: a profile starts with no theme preference'
);

select throws_ok(
  $$ update common.profiles set theme = 'midnight'
      where user_id = 'ada11111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'theme: an authenticated player cannot UPDATE it directly'
);

reset role;
select lives_ok(
  $$ update common.profiles set theme = 'anything-goes-for-now'
      where user_id = 'ada11111-1111-1111-1111-111111111111' $$,
  'theme: free-form text, unconstrained while it is a placeholder'
);

select * from finish();
rollback;
