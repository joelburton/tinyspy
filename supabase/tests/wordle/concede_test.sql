-- cs-met-wordle

-- ============================================================
-- Test: wordle.concede(target_game)  (elimination-game concede)
-- ============================================================
-- wordle is an ELIMINATION game (a player can be done — solved or out
-- of guesses — without the table ending), so it can't use the generic
-- common.concede. wordle.concede flips the shared conceded flag
-- (common._set_conceded) then re-runs its own terminal check
-- (_maybe_finish_compete), which counts a conceder as done and
-- excludes them from the win. Covers:
--   1. A concede while an opponent still races keeps the game going
--   2. When the last racer finishes, the game ends and the CONCEDER
--      forfeits (recorded a loss even though the game had a winner)
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

select plan(13);

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
select target::text as w from wordle.games where id = (select id from g);
grant select on tgt to authenticated;

-- ─── (1) ada concedes; bea is still racing → game continues ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.concede((select id from g));
select is(
  (select conceded from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'the conceder is marked conceded');
reset role;
select is(
  (select is_terminal from common.games where id = (select id from g)),
  false, 'the game continues while bea still races');

-- ─── (2) bea solves → game ends; bea wins, ada (conceded) forfeits ───
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.submit_guess((select id from g), (select w from tgt));
reset role;
select is(
  (select is_terminal from common.games where id = (select id from g)),
  true, 'the game ends when the last racer finishes');
select is(
  (select play_state from common.games where id = (select id from g)),
  'won_compete', 'there is a winner');
select is(
  (select result->>'won' from common.game_players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'true', 'bea wins');
select is(
  (select result->>'won' from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'false', 'ada (conceded) forfeits — recorded a loss');

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
  (select play_state from common.games where id = (select id from g2)),
  'lost_compete', 'everyone conceding → no winner (lost_compete)');
select is(
  (select status->>'winner_user_id' from common.games where id = (select id from g2)),
  null, 'no winner recorded when all conceded');
-- The two ways a race ends with nobody winning both write lost_compete; the
-- reason is what lets the club list tell "everyone burned their guesses" from
-- "everyone walked away".
select is(
  (select status->>'reason' from common.games where id = (select id from g2)),
  'conceded', 'an all-conceded race is labeled conceded, not exhausted');

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
select target::text as w from wordle.games where id = (select id from g3);
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
  (select play_state from common.games where id = (select id from g3)),
  'lost_compete', 'mixed table: the last racer running out ends it with no winner');
select is(
  (select status->>'reason' from common.games where id = (select id from g3)),
  'exhausted', 'mixed table: one quit and one ran out reads exhausted, not conceded');
select is(
  (select status->>'winner_user_id' from common.games where id = (select id from g3)),
  null, 'mixed table: nobody won');

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

select * from finish();
rollback;
