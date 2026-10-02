-- cs-blessed-wordle

-- ============================================================
-- Test: wordle.concede(p_game_id)  (elimination-game concede)
-- ============================================================
-- wordle is an ELIMINATION game (a player can be done — solved or out
-- of guesses — without the table ending). wordle.concede records the
-- concession through common._concede, which ends the game once everyone has
-- conceded, then runs its own end check (_maybe_finish_compete), which counts
-- a conceder as ended; the ranking _finish_compete passes leaves them
-- unranked. Covers:
--   1. A concede while an opponent still races keeps the game going, and the
--      conceder's own next guess is refused
--   2. When the last racer finishes, the game ends and the CONCEDER
--      forfeits (unranked and lost, though the game had a winner)
--   3. Everyone conceding ends it as a collective loss (no winner), and the
--      reason says everyone walked away — where a MIXED table, one quit and
--      one played it out, reads as the guesses running out
--   4. Concede is rejected in coop (a team doesn't drop out)
-- ============================================================

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(16);

-- ─── A 2-player compete game (ada + bea) ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordle concede', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

reset role;
create temp table tgt on commit drop as
select target::text as w from wordle.games where game_id = (select id from g);
grant select on tgt to authenticated;

-- ─── (1) ada concedes; bea is still racing → game continues ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.concede((select id from g));
select is(
  (select player_ended_reason from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'conceded', 'the conceder has ended, by conceding');
reset role;
select is(
  (select ended_at from common.games where id = (select id from g)),
  null, 'the game continues while bea still races');

-- A guess in flight when the concede committed (or a stale second tab) must
-- not land: the conceder could otherwise solve and be recorded the winner.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordle.submit_guess((select id from g), (select w from tgt)),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN483",
    "message":"Already conceded"}'::jsonb,
  'a conceder cannot guess');
reset role;

-- ─── (2) bea solves → game ends; bea wins, ada (conceded) forfeits ───
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.submit_guess((select id from g), (select w from tgt));
reset role;
select isnt(
  (select ended_at from common.games where id = (select id from g)),
  null, 'the game ends when the last racer finishes');
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

-- ─── (3) both players concede → collective loss, no winner ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;
select wordle.concede((select id from g2)); -- ada out, bea still racing
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.concede((select id from g2)); -- last racer out
reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g2)),
  'lost', 'everyone conceding → no winner, a collective loss');
-- common._concede ends the game; the builder must still run after it, so the
-- page blobs catch up with the ending.
select is(
  (select p->'ending'->>'reason'
     from common.games, jsonb_array_elements(game_data->'players') p
    where id = (select id from g2) and p->>'id' = 'bea22222-2222-2222-2222-222222222222'),
  'conceded', 'the ending concede runs the builder: the last conceder''s game_data player says conceded');
select is(
  (select summary_data->'ending'->'winner' from common.games where id = (select id from g2)),
  'null'::jsonb, 'no winner recorded when all conceded');
-- The two ways a race ends with nobody winning are both `lost`; the reason is
-- what lets the club list tell "everyone burned their guesses" from "everyone
-- walked away".
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g2)),
  'conceded/conceded', 'an all-conceded race ends conceded, not exhausted');

-- ─── (3b) a MIXED table: ada concedes, bea burns her budget → exhausted ───
-- Somebody played it to the end, so the race did not end by everyone walking
-- away. Five valid words that miss the target, read as the superuser.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select (wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;
reset role;
create temp table tgt3 on commit drop as
select target::text as w from wordle.games where game_id = (select id from g3);
create temp table valw3 on commit drop as
select word, row_number() over (order by word) as rn
  from common.words
 where len = 5 and difficulty <= 4 and word <> (select w from tgt3)
 order by word limit 5;
grant select on valw3 to authenticated;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.concede((select id from g3));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.submit_guess((select id from g3), (select word from valw3 where rn = 1));
select wordle.submit_guess((select id from g3), (select word from valw3 where rn = 2));
select wordle.submit_guess((select id from g3), (select word from valw3 where rn = 3));
select wordle.submit_guess((select id from g3), (select word from valw3 where rn = 4));
select wordle.submit_guess((select id from g3), (select word from valw3 where rn = 5));
reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g3)),
  'lost', 'mixed table: the last racer running out ends it with no winner');
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g3)),
  'resource_exhausted/exhausted', 'mixed table: one quit and one ran out reads exhausted, not conceded');
select is(
  (select summary_data->'ending'->'winner' from common.games where id = (select id from g3)),
  'null'::jsonb, 'mixed table: nobody won');

-- ─── (4) concede is rejected in coop ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select (wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;
select pg_temp.envelope_is(
  wordle.concede((select id from gc)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN484",
    "message":"BUG: a concede in a coop game"}'::jsonb,
  'conceding a coop game is rejected');

-- ─── (5) a concede into a game a friend deleted ───
-- Any club member may delete a game, taking its rows and every membership
-- with it; the concede answers the shared race, not a fault
-- (docs/envelopes.md → a missing game row is PN485).
create temp table gd on commit drop as
select (wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;
reset role;
delete from common.games where id = (select id from gd);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordle.concede((select id from gd)),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'a concede into a deleted game is the shared race (PN485)');

select * from finish();
rollback;
