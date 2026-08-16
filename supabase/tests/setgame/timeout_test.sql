-- ============================================================
-- Test: submit_timeout — the clock, and what it adjudicates
-- ============================================================
-- Coop loses on the clock: there was a reachable end (clear the deck) and the
-- table did not reach it.
--
-- Compete RANKS THE STANDINGS — the leader at the whistle wins. That is a
-- deliberate departure from scrabble-compete, the other game whose finish is
-- collective, which all-loses on timeout. The difference: here the count of
-- sets taken is the complete result at every instant, so the clock is just how
-- the session stops. With nobody scoring at all there is no one to crown, and
-- it falls back to a collective loss.

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(8);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Set clock', array['ada', 'bea']) as handle;

-- ── Coop: the clock is a loss ────────────────────────────────────────
create temp table gc on commit drop as
select * from setgame.create_game(
  (select handle from club), '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

select setgame.submit_set((select id from gc), pg_temp.sg_live((select id from gc)));
select setgame.submit_timeout((select id from gc));

reset role;
select is(
  (select play_state from common.games where id = (select id from gc)),
  'lost', 'coop loses on the clock — the deck was still full of sets');
select is(
  (select status->>'outcome' from common.games where id = (select id from gc)),
  'timeout', 'the outcome says what stopped it');
select is(
  (select (status->>'sets_found')::int from common.games where id = (select id from gc)),
  1, 'a lost coop game still records what the table found');
select ok(
  not (select (result->>'won')::boolean from common.game_players
        where game_id = (select id from gc)
          and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'nobody won it');

-- A second call is a no-op the manifest swallows.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select setgame.submit_timeout(%L) $$, (select id from gc)),
  'P0001', 'game-not-in-play|',
  'the timeout is idempotent — every client fires it, only the first counts');

-- ── Compete with a leader: the standings decide ──────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gl on commit drop as
select * from setgame.create_game(
  (select handle from club), '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete');

select setgame.submit_set((select id from gl), pg_temp.sg_live((select id from gl)));
select setgame.submit_set((select id from gl), pg_temp.sg_live((select id from gl)));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select setgame.submit_set((select id from gl), pg_temp.sg_live((select id from gl)));
select setgame.submit_timeout((select id from gl));

reset role;
select is(
  (select play_state from common.games where id = (select id from gl)),
  'won_compete', 'the whistle crowns the leader rather than voiding the game');
select is(
  (select status->>'winner_username' from common.games where id = (select id from gl)),
  'ada', 'the leader at the whistle is the winner');

-- ── Compete with nobody scoring: nobody to crown ─────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gz on commit drop as
select * from setgame.create_game(
  (select handle from club), '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete');
select setgame.submit_timeout((select id from gz));

reset role;
select is(
  (select play_state from common.games where id = (select id from gz)),
  'lost_compete', 'a race nobody scored in is a collective loss');

select * from finish();
rollback;
