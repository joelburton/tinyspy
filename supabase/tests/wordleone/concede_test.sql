-- cs-unmet

-- ============================================================
-- Test: wordleone.concede(p_game_id)
-- ============================================================
-- A racer drops out while the others race on. common._concede ends the game
-- once everyone has conceded; otherwise _maybe_finish_compete ends it when
-- the last racer finishes, and the conceder is unranked. Covers:
--   1. A concede while a rival still races keeps the game going, and the
--      conceder's next guess is refused
--   2. When the last racer solves, the game ends and the conceder forfeits
--   3. Everyone conceding is a collective loss
--   4. Concede is refused in coop
--   5. A concede into a deleted game is the shared race

begin;
set search_path = wordleone, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(12);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordleone concede', array['ada', 'bea']) as handle;

create function pg_temp.new_game(p_mode text) returns uuid language sql as $$
  select (wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    p_mode, pg_temp.wordleone_puzzle())->'data'->>'id')::uuid
$$;

create temp table g on commit drop as select pg_temp.new_game('compete') as id;

-- ─── (1) ada concedes; bea is still racing ───
select wordleone.concede((select id from g));
reset role;
select is(
  (select player_ended_reason from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'conceded', 'the conceder has ended, by conceding');
select is(
  (select ended_at from common.games where id = (select id from g)),
  null, 'the game continues while bea still races');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordleone.submit_guess((select id from g), 'verse'),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN483",
    "message":"Already conceded"}'::jsonb,
  'a conceder cannot guess');

-- ─── (2) bea solves → the race ends; ada forfeits ───
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordleone.submit_guess((select id from g), 'verse');
reset role;
select is(
  (select game_ended_reason || '/' || game_ended_outcome from common.games where id = (select id from g)),
  'reached_goal/won', 'the last racer''s solve ends it, and there is a winner');
select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '1/won', 'bea wins');
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'unranked/lost', 'ada (conceded) forfeits — unranked, lost');

-- ─── (3) everyone concedes → a collective loss ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as select pg_temp.new_game('compete') as id;
select wordleone.concede((select id from g2));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordleone.concede((select id from g2));
reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g2)),
  'conceded/conceded/lost', 'everyone conceding → no winner, a collective loss');
select is(
  (select p->'ending'->>'reason'
     from common.games, jsonb_array_elements(game_data->'players') p
    where id = (select id from g2) and p->>'id' = 'bea22222-2222-2222-2222-222222222222'),
  'conceded', 'the ending concede runs the builder');
select is(
  (select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g2)),
  '[]'::jsonb, 'nobody ranked first when all conceded');
select is(
  (select title from common.games where id = (select id from g2)),
  'New compete', 'a race ended with no guesses keeps its placeholder title');

-- ─── (4) concede is refused in coop ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as select pg_temp.new_game('coop') as id;
select pg_temp.envelope_is(
  wordleone.concede((select id from gc)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN484",
    "message":"BUG: a concede in a coop game"}'::jsonb,
  'conceding a coop game is refused');

-- ─── (5) a concede into a game a friend deleted ───
create temp table gd on commit drop as select pg_temp.new_game('compete') as id;
reset role;
delete from common.games where id = (select id from gd);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordleone.concede((select id from gd)),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'a concede into a deleted game is the shared race (PN485)');

select * from finish();
rollback;
