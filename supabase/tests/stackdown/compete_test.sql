-- cs-unmet

-- ============================================================
-- Test: stackdown compete — race to clear
-- ============================================================
-- Compete: same starting board, played independently. The FIRST player to
-- clear all six words wins immediately, ranked 1; everyone else is short of
-- the goal, unranked and lost. What a racer may see of a rival mid-race is
-- the hook's rule over the page blob (src/stackdown/hooks/useGame.ts), so the
-- blob carries a rival's rows; the shared club-list title never names them.

begin;
set search_path = stackdown, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(8);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Stack vs', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (stackdown.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

-- ── ada finds her first word ────────────────────────────────────────
select is(
  (select stackdown.submit_word((select id from g), pg_temp.sd_seq(1))->'data'->>'result'),
  'accepted', 'ada: EAGLE → accepted');

-- ── Mid-game visibility as bea ──────────────────────────────────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int
     from jsonb_array_elements((select game_data->'events' from common.games
                                 where id = (select id from g))) e
    where e->>'userId' = 'ada11111-1111-1111-1111-111111111111'),
  1,
  'mid-game: the blob carries ada''s row — withholding it from bea is the hook''s rule');
select is(
  (select n_found_words from stackdown.players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1,
  'mid-game: ada''s n_found_words IS visible to bea (the public tally)');
-- The title must NOT leak ada's cleared word into the shared club list:
-- compete keeps the create-time "New game" no matter how far ahead a racer is.
select is(
  (select title from common.games where id = (select id from g)),
  'New game',
  'mid-game: compete title stays "New game" — cleared words never leak');

-- ── ada clears the rest; the sixth wins the race immediately ────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select stackdown.submit_word((select id from g), pg_temp.sd_seq(2));
select stackdown.submit_word((select id from g), pg_temp.sd_seq(3));
select stackdown.submit_word((select id from g), pg_temp.sd_seq(4));
select stackdown.submit_word((select id from g), pg_temp.sd_seq(5));
create temp table win on commit drop as
select stackdown.submit_word((select id from g), pg_temp.sd_seq(6)) as res;
select is((select ended_at is not null from common.games where id = (select id from g)), true,
  'ada''s sixth word ends the game (race)');

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
          || '/' || game_ended_by_user_id::text
     from common.games where id = (select id from g)),
  'reached_goal/cleared/won/ada11111-1111-1111-1111-111111111111',
  'a winner emerged → reached_goal/cleared, won, ended by the clearer');
select is(
  (select final_ranking || '/' || outcome || '/' || (solved_at is not null)::text
     from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won/true', 'ada won (first to clear): ranked 1, solved');
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'unranked/lost', 'bea did not win: unranked, lost');

select * from finish();
rollback;
