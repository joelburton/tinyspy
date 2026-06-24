-- ============================================================
-- Test: stackdown.end_game (manual) + submit_timeout
-- ============================================================
-- Manual end is the neutral terminal ('ended', nobody wins), idempotent.
-- A countdown timeout is a loss (coop 'lost').

begin;
set search_path = stackdown, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(6);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Stack end', array['ada', 'bea']) as handle;

-- ── Manual end → neutral 'ended' ────────────────────────────────────
create temp table g1 on commit drop as
select * from stackdown.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');
select stackdown.end_game((select id from g1));

reset role;
select is(
  (select play_state from common.games where id = (select id from g1)),
  'ended', 'manual end → play_state ended');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g1) and not (result->>'won')::boolean),
  2::bigint, 'manual end: nobody won');
select is(
  (select status->>'outcome' from common.games where id = (select id from g1)),
  'manual', 'status.outcome = manual');

-- Idempotency: a second end is rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select stackdown.end_game(%L) $$, (select id from g1)),
  'P0001', 'game is not in progress',
  'ending an already-ended game is rejected');

-- ── Countdown timeout → loss ────────────────────────────────────────
create temp table g2 on commit drop as
select * from stackdown.create_game(
  (select handle from club), '{"timer": {"kind": "countdown", "seconds": 300}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');
select stackdown.submit_timeout((select id from g2));

reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'lost', 'coop timeout → play_state lost');
select is(
  (select status->>'outcome' from common.games where id = (select id from g2)),
  'timeout', 'status.outcome = timeout');

select * from finish();
rollback;
