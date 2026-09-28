-- cs-blessed-wordle

-- ============================================================
-- Test: wordle.submit_timeout + wordle.stop_game (endings)
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
  (select game_ended_outcome from common.games where id = (select id from g1)),
  'lost', 'coop timeout → lost');
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g1)),
  'timeout/timeout', 'coop timeout: the reason is timeout');
-- Idempotent: a second call is a race — the work is already done.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordle.submit_timeout((select id from g1)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'submit_timeout is idempotent (a second call is a race)');

-- ── Compete timeout with a solver → won, ranked as when every player
--    is done ──────────────────────────────────────────────────────
-- The clock ends the race as it stands: whoever solved is ranked, fewest
-- guesses first, the reason is 'timeout', and the club line carries the
-- winner's count as it does when every player is done — _finish_compete
-- ranks both endings.
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
select target::text as w from wordle.games where game_id = (select id from g3);
grant select on tgt3 to authenticated;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess((select id from g3), (select w from tgt3));
select wordle.submit_timeout((select id from g3));
reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g3)),
  'won', 'compete timeout with a solver → won');
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/'
          || coalesce(game_ended_by_user_id::text, 'nobody')
     from common.games where id = (select id from g3)),
  'timeout/timeout/nobody', 'compete timeout: the reason is timeout, ended by nobody');
select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from g3) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won', 'compete timeout: the solver is ranked 1, the winner');
select is(
  (select (clubpage_info->>'winner_guesses_count')::int from common.games where id = (select id from g3)),
  1, 'compete timeout: the club line names the winner''s guess count, as when every player is done');
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from g3) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'unranked/lost', 'compete timeout: the racer still guessing is unranked, lost');

-- ── Compete timeout with nobody solved → lost ───────────────
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
  (select game_ended_outcome from common.games where id = (select id from g4)),
  'lost', 'compete timeout with nobody solved → lost');
select is(
  (select game_ended_reason || ':' || coalesce(clubpage_info->>'winner_user_id', 'none')
     from common.games where id = (select id from g4)),
  'timeout:none', 'compete timeout: reason timeout, no winner recorded');

-- ── Manual end (stop_game) → neutral, stopped ────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club2 on commit drop as
select pg_temp.create_club('Wordle t2', array['ada', 'bea']) as handle;
create temp table g2 on commit drop as
select (wordle.create_game(
  (select handle from club2), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;
select wordle.stop_game((select id from g2));
reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g2)),
  'neutral', 'stop_game → the game ends neutral');
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g2)),
  'stopped/stopped', 'stop_game: the reason is stopped');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g2) and final_ranking is null and outcome = 'neutral'),
  2::bigint, 'nobody won on a manual end: every player unranked, neutral');
-- The target reveals after a manual end too.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select ok(
  (select target from wordle.games_state where game_id = (select id from g2)) is not null,
  'target revealed once the game has ended (manual end)');

-- A non-player cannot end the game (dee isn't in the club).
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  wordle.stop_game((select id from g2)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot end the game (_require_game_player)');

select * from finish();
rollback;
