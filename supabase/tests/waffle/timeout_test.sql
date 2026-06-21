-- ============================================================
-- Test: waffle.submit_timeout (countdown expiry)
-- ============================================================
-- Coop: the shared board wasn't solved in time → lost. Compete: time's
-- up — the winner is whoever solved in the fewest swaps (same rule as
-- a natural finish); a non-solver loses. Idempotent on the play_state
-- check (a peer racing to fire it gets "not in progress").

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(6);

-- ── Coop: timeout → lost ────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club1 on commit drop as
select common.create_club('Waffle to1', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select * from waffle.create_game(
  (select handle from club1), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);

select waffle.submit_timeout((select id from g1));

reset role;
select is(
  (select play_state from common.games where id = (select id from g1)),
  'lost',
  'coop: countdown expiry → lost');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g1) and not (result->>'won')::boolean),
  2::bigint,
  'coop: both players recorded as not-won');

-- Idempotent: a second timeout raises (already terminal).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select waffle.submit_timeout(%L::uuid) $$, (select id from g1)),
  'P0001', NULL, 'a second timeout on a finished game raises (idempotent)');

-- ── Compete: timeout with one solver → that player wins ─────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club2 on commit drop as
select common.create_club('Waffle to2', array['ada', 'bea']) as handle;
create temp table g2 on commit drop as
select * from waffle.create_game(
  (select handle from club2), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);

-- ada solves; bea never does; then the clock runs out.
select waffle.submit_swap((select id from g2), 0, 1);
select waffle.submit_timeout((select id from g2));

reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'won_compete',
  'compete: timeout with a solver → won_compete');
select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g2)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'compete: the solver (ada) wins on timeout');
select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g2)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  false, 'compete: the non-solver (bea) loses');

select * from finish();
rollback;
