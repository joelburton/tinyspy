-- cs-unmet

-- ============================================================
-- Test: wordleone compete — private boards, fewest misses wins
-- ============================================================
-- The same puzzle, raced. A solve ends the solver while the others play on;
-- the race ends when nobody is still racing, and every solver is ranked by
-- fewest misses, then the earlier solve. `now()` is constant inside a test
-- transaction, so the tie-break case sets one `solved_at` by hand.

begin;
set search_path = wordleone, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(17);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordleone vs', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (wordleone.create_game(
  (select handle from club), pg_temp.wordleone_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete', pg_temp.wordleone_puzzle())->'data'->>'id')::uuid as id;

-- ── ada misses once, then solves ────────────────────────────
select wordleone.submit_guess((select id from g), 'crane');
create temp table a_solve on commit drop as
select wordleone.submit_guess((select id from g), 'verse') as res;
select pg_temp.envelope_is(
  (select res from a_solve),
  '{"type":"ok","data":{"result":"correct","n_misses":1,"solved":true,"game_ended":false}}'::jsonb,
  'ada solves; the race goes on, bea still racing');

reset role;
select is(
  (select player_ended_reason || '/' || player_ended_reason_detail
     from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'
      and solved_at is not null),
  'reached_goal/solved', 'compete: a solve ends the solver');
select is(
  (select title from common.games where id = (select id from g)),
  'New compete', 'compete: a mid-race guess never lands in the club-wide title');
select is(
  (select summary_data->'team' from common.games where id = (select id from g)),
  'null'::jsonb, 'compete: the summary has no team');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordleone.submit_guess((select id from g), 'stare'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN528","message":"Already solved"}'::jsonb,
  'compete: guessing after your own solve is a fault');

-- ── bea's board is her own ──────────────────────────────────
-- ada's miss is no duplicate for bea: each racer's board holds their own.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  wordleone.submit_guess((select id from g), 'crane')->'data'->>'n_misses',
  '1', 'compete: a rival''s guess is not a duplicate, and the count is bea''s own');
select is(
  wordleone.submit_guess((select id from g), 'sieve')->'data'->>'result',
  'duplicate', '… while the starter is a duplicate on every board');
select wordleone.submit_guess((select id from g), 'stare');
create temp table b_solve on commit drop as
select wordleone.submit_guess((select id from g), 'verse') as res;
select is((select (res->'data'->>'game_ended')::boolean from b_solve), true,
  'the last racer solving ends the race');

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g)),
  'reached_goal/solved/won', 'the race ends reached_goal, won');
select is(
  (select game_ended_by_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid, 'the last racer to finish ended it');
select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won', 'ada ranked 1 — fewest misses (1 vs 2)');
select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '2/near', 'bea solved too, so she is ranked 2, near');
select is(
  (select title from common.games where id = (select id from g)),
  'VERSE', 'the finished race titles the game with its latest guess, the solve');
select is(
  (select (summary_data->>'nWinnerMisses')::int from common.games where id = (select id from g)),
  1, 'the summary names the winner''s misses');
select is(
  (select summary_data->'nMissesById' from common.games where id = (select id from g)),
  '{"ada11111-1111-1111-1111-111111111111": 1, "bea22222-2222-2222-2222-222222222222": 2}'::jsonb,
  '… and each racer''s');

-- ── The tie-break: same count, the earlier solve wins ───────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (wordleone.create_game(
  (select handle from club), pg_temp.wordleone_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete', pg_temp.wordleone_puzzle())->'data'->>'id')::uuid as id;
select wordleone.submit_guess((select id from g2), 'verse');
reset role;
update common.game_players set solved_at = now() + interval '1 minute'
 where game_id = (select id from g2)
   and user_id = 'ada11111-1111-1111-1111-111111111111';
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordleone.submit_guess((select id from g2), 'verse');
reset role;
select is(
  (select array_agg(final_ranking || '/' || outcome order by user_id)
     from common.game_players where game_id = (select id from g2)),
  array['2/near', '1/won'], 'tie on misses: the race still ranks one player first');
select is(
  (select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g2)),
  '["bea22222-2222-2222-2222-222222222222"]'::jsonb,
  'tie on misses: the earlier solved_at wins');

select * from finish();
rollback;
