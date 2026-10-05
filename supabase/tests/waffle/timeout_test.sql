-- cs-unmet

-- ============================================================
-- Test: waffle.submit_timeout (countdown expiry)
-- ============================================================
-- Coop: the shared board wasn't solved in time → lost. Compete: time's
-- up — whoever solved is ranked, fewest swaps first (same rule as when
-- every player is done); a non-solver is unranked and loses. A second call
-- finds the game ended (a peer racing to fire it gets the game-over race).

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(6);

-- ── Coop: timeout → lost ────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club1 on commit drop as
select pg_temp.create_club('Waffle to1', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select (waffle.create_game(
  (select handle from club1), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board()
)->'data'->>'id')::uuid as id;

select waffle.submit_timeout((select id from g1));

reset role;
-- Free-for-all coop has no turn holder, so nobody ended it.
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
          || '/' || coalesce(game_ended_by_user_id::text, 'nobody')
     from common.games where id = (select id from g1)),
  'timeout/timeout/lost/nobody',
  'coop: countdown expiry → timeout, lost, ended by nobody');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g1) and final_ranking is null and outcome = 'lost'),
  2::bigint,
  'coop: both players unranked, lost');

-- Idempotent: a second timeout raises (already ended).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  waffle.submit_timeout((select id from g1)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'a second timeout on a finished game raises (idempotent)');

-- ── Compete: timeout with one solver → that player wins ─────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club2 on commit drop as
select pg_temp.create_club('Waffle to2', array['ada', 'bea']) as handle;
create temp table g2 on commit drop as
select (waffle.create_game(
  (select handle from club2), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.waffle_board()
)->'data'->>'id')::uuid as id;

-- ada solves; bea never does; then the timer runs out.
select waffle.submit_swap((select id from g2), 0, 1);
select waffle.submit_timeout((select id from g2));

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_outcome
          || '/' || coalesce(game_ended_by_user_id::text, 'nobody')
     from common.games where id = (select id from g2)),
  'timeout/won/nobody',
  'compete: timeout with a solver → timeout, won, ended by nobody');
select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from g2)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won', 'compete: the solver (ada) is ranked 1 on timeout');
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from g2)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'unranked/lost', 'compete: the non-solver (bea) is unranked and loses');

select * from finish();
rollback;
