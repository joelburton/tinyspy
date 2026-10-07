-- cs-unmet

-- ============================================================
-- Test: wordleone.submit_timeout + wordleone.stop_game (endings)
-- ============================================================
-- The timeout in both modes — coop's loss, and a race ended as it stands with
-- and without a solver — then the Stop.

begin;
set search_path = wordleone, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(13);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordleone t', array['ada', 'bea']) as handle;

create function pg_temp.new_game(p_mode text) returns uuid language sql as $$
  select (wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    p_mode, pg_temp.wordleone_puzzle())->'data'->>'id')::uuid
$$;

-- ── Coop timeout → lost ─────────────────────────────────────
create temp table g1 on commit drop as select pg_temp.new_game('coop') as id;
select wordleone.submit_timeout((select id from g1));
reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g1)),
  'timeout/timeout/lost', 'coop timeout → lost, the reason timeout');
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordleone.submit_timeout((select id from g1)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486","message":"Game over"}'::jsonb,
  'a second timeout is a race');

-- ── Compete timeout with a solver → ranked as it stands ─────
create temp table g3 on commit drop as select pg_temp.new_game('compete') as id;
select wordleone.submit_guess((select id from g3), 'verse');
select wordleone.submit_timeout((select id from g3));
reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome || '/'
          || coalesce(game_ended_by_user_id::text, 'nobody')
     from common.games where id = (select id from g3)),
  'timeout/timeout/won/nobody', 'compete timeout with a solver → won, ended by nobody');
select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from g3) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won', 'the solver is ranked 1');
select is(
  (select (summary_data->>'nWinnerMisses')::int from common.games where id = (select id from g3)),
  0, 'the summary names the winner''s misses');
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from g3) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'unranked/lost', 'the racer still guessing is unranked, lost');

-- ── Compete timeout with nobody solved → lost ───────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g4 on commit drop as select pg_temp.new_game('compete') as id;
select wordleone.submit_timeout((select id from g4));
reset role;
select is(
  (select game_ended_outcome || ':' || pg_temp.winner_ids(summary_data)::text
     from common.games where id = (select id from g4)),
  'lost:[]', 'compete timeout with nobody solved → lost, nobody ranked first');

-- ── The Stop → neutral ──────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as select pg_temp.new_game('compete') as id;
select wordleone.stop_game((select id from g2));
reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g2)),
  'stopped/stopped/neutral', 'stop_game → stopped, neutral');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g2) and final_ranking is null and outcome = 'neutral'),
  2::bigint, 'nobody won a Stop: every player unranked, neutral');
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select game_data->'puzzle'->>'target' from common.games where id = (select id from g2)),
  'verse', 'the target arrives once the game has stopped');
select pg_temp.envelope_is(
  wordleone.stop_game((select id from g2)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486"}'::jsonb,
  'a second Stop is a race');

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  wordleone.stop_game((select id from g2)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot stop the game');

-- ── A Stop into a deleted game ──────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gd on commit drop as select pg_temp.new_game('coop') as id;
reset role;
delete from common.games where id = (select id from gd);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordleone.stop_game((select id from gd)),
  '{"type":"not-ok","severity":"race","dbcode":"PN485"}'::jsonb,
  'a Stop into a deleted game is the shared race (PN485)');

select * from finish();
rollback;
