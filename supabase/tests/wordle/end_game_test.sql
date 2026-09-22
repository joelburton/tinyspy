-- cs-blessed-wordle

-- ============================================================
-- Test: wordle.submit_timeout + wordle.end_game (terminals)
-- ============================================================
-- The timeout in both modes — coop's loss, and a race ended as it stands with
-- and without a solver — then the manual end.

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(15);

-- ── Coop timeout → lost ─────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club1 on commit drop as
select pg_temp.create_club('Wordle t1', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select (wordle.create_game(
  (select handle from club1), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;
select wordle.submit_timeout((select id from g1));
reset role;
select is(
  (select play_state from common.games where id = (select id from g1)),
  'lost', 'coop timeout → lost');
select is(
  (select status->>'reason' from common.games where id = (select id from g1)),
  'timeout', 'status.reason = timeout');
-- Idempotent: a second call is a race — the work is already done.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordle.submit_timeout((select id from g1)),
  '{"type":"not-ok","severity":"race","outcome":"noted","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'submit_timeout is idempotent (a second call is a race)');

-- ── Compete timeout with a solver → won_compete, the same status a
--    natural finish writes ─────────────────────────────────────
-- The clock ends the race as it stands: whoever solved in the fewest guesses
-- wins, the reason is 'timeout', and the status carries the winner's count the
-- way a natural finish's does — _finish_compete writes both endings.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club3 on commit drop as
select pg_temp.create_club('Wordle t3', array['ada', 'bea']) as handle;
create temp table g3 on commit drop as
select (wordle.create_game(
  (select handle from club3), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;
reset role;
create temp table tgt3 on commit drop as
select target::text as w from wordle.games where id = (select id from g3);
grant select on tgt3 to authenticated;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess((select id from g3), (select w from tgt3));
select wordle.submit_timeout((select id from g3));
reset role;
select is(
  (select play_state from common.games where id = (select id from g3)),
  'won_compete', 'compete timeout with a solver → won_compete');
select is(
  (select status->>'reason' from common.games where id = (select id from g3)),
  'timeout', 'compete timeout: status.reason = timeout');
select is(
  (select (status->>'winner_user_id')::uuid from common.games where id = (select id from g3)),
  'ada11111-1111-1111-1111-111111111111'::uuid, 'compete timeout: the solver is the winner');
select is(
  (select (status->>'winner_guesses')::int from common.games where id = (select id from g3)),
  1, 'compete timeout: the status names the winner''s guess count, as a natural finish does');
select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g3) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  false, 'compete timeout: the racer still guessing did not win');

-- ── Compete timeout with nobody solved → lost_compete ───────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g4 on commit drop as
select (wordle.create_game(
  (select handle from club3), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;
select wordle.submit_timeout((select id from g4));
reset role;
select is(
  (select play_state from common.games where id = (select id from g4)),
  'lost_compete', 'compete timeout with nobody solved → lost_compete');
select is(
  (select status->>'reason' || ':' || coalesce(status->>'winner_user_id', 'none')
     from common.games where id = (select id from g4)),
  'timeout:none', 'compete timeout: reason timeout, no winner recorded');

-- ── Manual end (end_game) → neutral 'ended' ─────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club2 on commit drop as
select pg_temp.create_club('Wordle t2', array['ada', 'bea']) as handle;
create temp table g2 on commit drop as
select (wordle.create_game(
  (select handle from club2), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;
select wordle.end_game((select id from g2));
reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'ended', 'end_game → play_state ended');
select is(
  (select status->>'reason' from common.games where id = (select id from g2)),
  'manual', 'status.reason = manual');
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
select pg_temp.envelope_is(
  wordle.end_game((select id from g2)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot end the game (require_game_player)');

select * from finish();
rollback;
