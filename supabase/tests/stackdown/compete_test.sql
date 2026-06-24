-- ============================================================
-- Test: stackdown compete — race to clear, opponent hidden mid-game
-- ============================================================
-- Compete: same starting board, played independently. The FIRST player to
-- clear all six words wins immediately. An opponent's submissions are
-- hidden mid-game (only the found_count tally is public) and revealed once
-- the game ends.

begin;
set search_path = stackdown, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(7);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Stack vs', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from stackdown.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete');

-- ── ada finds her first word ────────────────────────────────────────
select is(
  (select stackdown.submit_word((select id from g), pg_temp.sd_seq(1))->>'result'),
  'accepted', 'ada: EAGLE → accepted');

-- ── Mid-game visibility as bea ──────────────────────────────────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from stackdown.submissions
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  0::bigint,
  'mid-game: bea cannot see ada''s submissions (compete RLS hides them)');
select is(
  (select found_count from stackdown.players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1,
  'mid-game: ada''s found_count IS visible to bea (the public tally)');

-- ── ada clears the rest; the sixth wins the race immediately ────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select stackdown.submit_word((select id from g), pg_temp.sd_seq(2));
select stackdown.submit_word((select id from g), pg_temp.sd_seq(3));
select stackdown.submit_word((select id from g), pg_temp.sd_seq(4));
select stackdown.submit_word((select id from g), pg_temp.sd_seq(5));
create temp table win on commit drop as
select stackdown.submit_word((select id from g), pg_temp.sd_seq(6)) as res;
select is((select (res->>'terminal')::boolean from win), true,
  'ada''s sixth word ends the game (race)');

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'won_compete', 'a winner emerged → won_compete');
select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'ada won (first to clear)');
select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  false, 'bea did not win');

select * from finish();
rollback;
