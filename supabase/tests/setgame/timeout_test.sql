-- cs-unmet

-- ============================================================
-- Test: submit_timeout — the clock, and what it adjudicates
-- ============================================================
-- Coop loses on the clock: there was a reachable end (clear the deck) and the
-- table did not reach it.
--
-- Compete RANKS BY SETS FOUND — the leader at the whistle wins. The finish is
-- collective, so there are no finishers to rank, and the count of sets taken
-- is the complete result at every instant: the clock is just how the session
-- stops. With nobody scoring at all there is no one to crown, and it falls
-- back to a collective loss.

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(8);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Set clock', array['ada', 'bea']) as handle;

-- ── Coop: the clock is a loss ────────────────────────────────────────
create temp table gc on commit drop as
select (setgame.create_game(
  (select handle from club), '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;

select setgame.submit_set((select id from gc), pg_temp.sg_live((select id from gc)));
select setgame.submit_timeout((select id from gc));

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from gc)),
  'lost', 'coop loses on the clock — the deck was still full of sets');
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from gc)),
  'timeout/timeout', 'the reason says what stopped it');
select is(
  (select (clubpage_info->>'found_sets_count')::int from common.games where id = (select id from gc)),
  1, 'a lost coop game still records what the table found');
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from gc) and final_ranking is null and outcome = 'lost'),
  2, 'nobody won it — nobody is ranked');

-- A second call is a no-op the manifest swallows.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  setgame.submit_timeout((select id from gc)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'the timeout is idempotent — every client fires it, only the first counts');

-- ── Compete with a leader: the sets found decide ─────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gl on commit drop as
select (setgame.create_game(
  (select handle from club), '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

select setgame.submit_set((select id from gl), pg_temp.sg_live((select id from gl)));
select setgame.submit_set((select id from gl), pg_temp.sg_live((select id from gl)));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select setgame.submit_set((select id from gl), pg_temp.sg_live((select id from gl)));
select setgame.submit_timeout((select id from gl));

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from gl)),
  'won', 'the whistle crowns the leader rather than voiding the game');
select is(
  (select string_agg(user_id::text || ':' || final_ranking || '/' || outcome, ',' order by final_ranking)
     from common.game_players where game_id = (select id from gl)),
  'ada11111-1111-1111-1111-111111111111:1/won,bea22222-2222-2222-2222-222222222222:2/near',
  'the leader at the whistle is the winner, the runner-up near');

-- ── Compete with nobody scoring: nobody to crown ─────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gz on commit drop as
select (setgame.create_game(
  (select handle from club), '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;
select setgame.submit_timeout((select id from gz));

reset role;
select is(
  (select game_ended_outcome || '/' || count(*) filter (where gp.final_ranking is null and gp.outcome = 'lost')
     from common.games cg join common.game_players gp on gp.game_id = cg.id
    where cg.id = (select id from gz) group by cg.game_ended_outcome),
  'lost/2', 'a race nobody scored in is a collective loss, nobody ranked');

select * from finish();
rollback;
