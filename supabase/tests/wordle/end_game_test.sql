-- ============================================================
-- Test: wordle.submit_timeout + wordle.end_game (terminals)
-- ============================================================

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(8);

-- ── Coop timeout → lost ─────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club1 on commit drop as
select common.create_club('Wordle t1', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select * from wordle.create_game(
  (select handle from club1), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);
select wordle.submit_timeout((select id from g1));
reset role;
select is(
  (select play_state from common.games where id = (select id from g1)),
  'lost', 'coop timeout → lost');
select is(
  (select status->>'outcome' from common.games where id = (select id from g1)),
  'timeout', 'status.outcome = timeout');
-- Idempotent: a second call raises P0001 (the FE swallows it).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select wordle.submit_timeout(%L::uuid) $$, (select id from g1)),
  'P0001', 'game is not in progress',
  'submit_timeout is idempotent (second call raises P0001)');

-- ── Manual end (end_game) → neutral 'ended' ─────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club2 on commit drop as
select common.create_club('Wordle t2', array['ada', 'bea']) as handle;
create temp table g2 on commit drop as
select * from wordle.create_game(
  (select handle from club2), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);
select wordle.end_game((select id from g2));
reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'ended', 'end_game → play_state ended');
select is(
  (select status->>'outcome' from common.games where id = (select id from g2)),
  'manual', 'status.outcome = manual');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g2) and (result->>'won')::boolean),
  0::bigint, 'nobody won on a manual end');
-- The target reveals after a manual end too.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select ok(
  (select target from wordle.games_state where id = (select id from g2)) is not null,
  'target revealed post-terminal (manual end)');

-- A non-player cannot end the game (dee isn't in the club).
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select wordle.end_game(%L::uuid) $$, (select id from g2)),
  '42501', null,
  'a non-player cannot end the game (require_game_player)');

select * from finish();
rollback;
