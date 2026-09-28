-- cs-blessed-connections

-- ============================================================
-- Test: connections compete mode
-- ============================================================
--
-- The compete delta. The shared coop-mode contract is exercised by
-- create_game_test.sql, gameplay_test.sql and rls_test.sql; this
-- file covers:
--
--   - create_game `mode` param: invalid rejected, compete-with-
--     <2-players rejected, happy compete path
--   - per-player mistake increment: caller's row only, opponents
--     untouched
--   - "already matched" is per player: the same rank can be matched
--     once per player (ada and bea both match rank 1 → both rows
--     persist)
--   - first-to-all-4 ends the race: the caller's 4th correct ends the
--     game reached_goal, the caller ranked 1 and `won`, everyone else
--     unranked and `lost`; surviving players can no longer submit
--   - elimination + collective loss: each player's 4 mistakes ends
--     them (player_ended_reason resource_exhausted, so the
--     presence-pause stops waiting on them); once all have ended, the
--     game ends resource_exhausted/'mistakes', lost
--   - eliminated-player submit answered as a race
--   - submit_timeout's compete ending (timeout, lost, nobody ranked)
--
-- See create_game_test.sql for the pgTAP / auth-simulation primer.

begin;

set search_path = connections, common, public, extensions;

select plan(30);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

-- `throws_ok` takes a SQL STRING, because the call had to be deferred until the
-- assertion ran. An envelope is a VALUE, and these calls build their SQL with
-- `format` (the club handle and the puzzle id are only known at run time), so
-- this runs one and hands back what it returned.
create function pg_temp.envelope_of(sql text) returns jsonb as $envfn$
declare result jsonb;
begin execute sql into result; return result; end;
$envfn$ language plpgsql;
\ir setup.psql

-- ============================================================
-- Fixture: ada + bea + cade form the club; dee stays outside.
-- ============================================================
-- A 3-player compete game is the smallest setup that exercises
-- "one player wins, two lose" and "all-three-eliminated".

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('compete-club',
  array['ada','bea','cade']) as handle;

create temp table puzzle on commit drop as
select pg_temp.connections_puzzle() as id;

-- ============================================================
-- (1) Invalid mode rejected
-- ============================================================

select pg_temp.envelope_is(
  pg_temp.envelope_of(format(
    $$ select connections.create_game(%L, pg_temp.connections_setup(%L::uuid),
                                    array['ada11111-1111-1111-1111-111111111111'::uuid,
                                          'bea22222-2222-2222-2222-222222222222'::uuid],
                                    'sudden-death') $$,
    (select handle from club), (select id from puzzle)
  )),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN040"}'::jsonb,
  'create_game: invalid mode value is rejected');

-- ============================================================
-- (2) Compete with <2 players rejected
-- ============================================================
-- The FE manifest's numberOfPlayers: [2, 6] hides the Start
-- button in 1-player clubs; this is the server-side catch.

select pg_temp.envelope_is(
  pg_temp.envelope_of(format(
    $$ select connections.create_game(%L, pg_temp.connections_setup(%L::uuid),
                                    array['ada11111-1111-1111-1111-111111111111'::uuid],
                                    'compete') $$,
    (select handle from club), (select id from puzzle)
  )),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN061"}'::jsonb,
  'create_game: compete with 1 player is rejected');

-- ============================================================
-- (3)–(5) Happy compete path
-- ============================================================
-- Create a 3-player compete game; assert the mode, the gametype
-- string, and per-player rows.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g on commit drop as
select (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete')->'data'->>'id')::uuid as id;

reset role;
select is(
  (select mode from common.games where id = (select id from g)),
  'compete',
  'create_game: common.games.mode = compete'
);

select is(
  (select gametype from common.games where id = (select id from g)),
  'connections_compete',
  'create_game: common.games.gametype = connections_compete'
);

select is(
  (select count(*) from connections.players where game_id = (select id from g)),
  3::bigint,
  'create_game: one connections.players row per player'
);

-- ============================================================
-- (6) Per-player mistake increment (caller's row only)
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.submit_guess(
  (select id from g),
  array['ALPHA','BANANA','CASTLE','DAGGER']::text[],
  'wrong', null
);

reset role;
select is(
  (select mistake_count from connections.players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid),
  1,
  'submit_guess (compete): caller mistake_count increments to 1'
);

select is(
  (select mistake_count from connections.players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'::uuid),
  0,
  'submit_guess (compete): opponent mistake_count untouched'
);

-- ============================================================
-- (7) "Already matched" is per player: different players can
--     both match the same rank
-- ============================================================
-- In compete, submit_guess asks only whether the CALLER already
-- matched the rank, so ada matching rank-1 and bea matching rank-1
-- produce two rows, not a race.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.submit_guess(
  (select id from g),
  array['BANANA','BIRCH','BREAD','BRICK']::text[],
  'correct', 1
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select connections.submit_guess(
  (select id from g),
  array['BANANA','BIRCH','BREAD','BRICK']::text[],
  'correct', 1
);

reset role;
select is(
  (select count(*) from connections.events
    where game_id = (select id from g)
      and matched_category_rank = 1
      and result = 'correct'),
  2::bigint,
  'submit_guess (compete): same rank can be matched once per player'
);

-- ============================================================
-- (8) Same player double-matching a rank: still a race
-- ============================================================
-- ada trying to re-submit rank-1 (her own already-matched
-- category) is caught by the same already-matched check as coop's,
-- scoped to her own rows.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  connections.submit_guess((select id from g),
                           array['BANANA','BIRCH','BREAD','BRICK']::text[],
                           'correct', 1),
  '{"type": "not-ok", "severity": "race", "dbcode": "PN300",
    "message": "That category is already matched"}'::jsonb,
  'submit_guess (compete): same player re-matching same rank is a race'
);

reset role;
select is(
  (select count(*) from connections.events
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid
      and matched_category_rank = 1
      and result = 'correct'),
  1::bigint,
  'submit_guess (compete): still exactly one correct row per (player, rank)'
);

-- ============================================================
-- (9)–(11) First-to-all-4 ends the race
-- ============================================================
-- Ada matches the remaining 3 categories. Her 4th correct ends the
-- race with her the winner; bea and cade can no longer submit.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.submit_guess((select id from g),
  array['ALPHA','ANGEL','APPLE','ARROW']::text[], 'correct', 0);
select connections.submit_guess((select id from g),
  array['CASTLE','CIRCLE','CLOUD','CROWN']::text[], 'correct', 2);
select connections.submit_guess((select id from g),
  array['DAGGER','DELTA','DIAMOND','DRAGON']::text[], 'correct', 3);

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
          || '/' || game_ended_by_user_id::text
     from common.games where id = (select id from g)),
  'reached_goal/solved/won/ada11111-1111-1111-1111-111111111111',
  'submit_guess (compete): ada''s 4th correct ends the race reached_goal, won, by ada'
);

select is(
  (select final_ranking || '/' || outcome || '/' || (solved_at is not null)::text
     from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid),
  '1/won/true',
  'submit_guess (compete): the winner is ranked 1, won, and solved'
);

select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'::uuid),
  'unranked/lost',
  'submit_guess (compete): an opponent is unranked and lost (the race ended when decided)'
);

-- Surviving player tries to submit after the race ended; the
-- game-ended guard rejects.
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select pg_temp.envelope_is(
  connections.submit_guess((select id from g),
                           array['ALPHA','ANGEL','APPLE','ARROW']::text[], 'correct', 0),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'submit_guess (compete): post-win opponent submit is rejected'
);

-- ============================================================
-- (12)–(14) All-eliminated → a collective loss
-- ============================================================
-- Fresh 2-player game. Bea racks up 4 mistakes (eliminated), ada
-- racks up 4 mistakes (also eliminated; nobody left ends the game).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

-- Bea: 4 wrong guesses → eliminated.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select connections.submit_guess((select id from g2),
  array['ALPHA','BANANA','CASTLE','DAGGER']::text[], 'wrong', null);
select connections.submit_guess((select id from g2),
  array['ALPHA','BANANA','CASTLE','DELTA']::text[], 'wrong', null);
select connections.submit_guess((select id from g2),
  array['ALPHA','BANANA','CIRCLE','DAGGER']::text[], 'wrong', null);
select connections.submit_guess((select id from g2),
  array['ALPHA','BIRCH','CASTLE','DAGGER']::text[], 'wrong', null);

reset role;
select is(
  (select mistake_count from connections.players
    where game_id = (select id from g2)
      and user_id = 'bea22222-2222-2222-2222-222222222222'::uuid),
  4,
  'submit_guess (compete): bea at 4 mistakes is eliminated'
);

select is(
  (select ended_at from common.games where id = (select id from g2)),
  null,
  'submit_guess (compete): one eliminated player leaves the game being played'
);

-- …and the common roster hears about it, which is what keeps bea's closed tab
-- from pausing the game for ada. Her ending is the mistakes, not a concession:
-- bea did not walk away.
select is(
  (select player_ended_reason || '/' || player_ended_reason_detail
     from common.game_players
    where game_id = (select id from g2)
      and user_id = 'bea22222-2222-2222-2222-222222222222'::uuid
      and player_ended_at is not null),
  'resource_exhausted/mistakes',
  'submit_guess (compete): elimination ends the player resource_exhausted/mistakes'
);

select is(
  (select player_ended_at from common.game_players
    where game_id = (select id from g2)
      and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid),
  null,
  'submit_guess (compete): a racer still going has not ended'
);

-- Eliminated bea tries to submit → rejected.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  connections.submit_guess((select id from g2),
                           array['ALPHA','BANANA','CASTLE','DAGGER']::text[], 'wrong', null),
  '{"type":"not-ok","severity":"race","dbcode":"PN251",
    "message":"Out of mistakes"}'::jsonb,
  'submit_guess (compete): eliminated player''s submit is rejected'
);

-- Ada: 4 wrong guesses → also eliminated → collective loss.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.submit_guess((select id from g2),
  array['ALPHA','BANANA','CASTLE','DAGGER']::text[], 'wrong', null);
select connections.submit_guess((select id from g2),
  array['ALPHA','BANANA','CASTLE','DELTA']::text[], 'wrong', null);
select connections.submit_guess((select id from g2),
  array['ALPHA','BANANA','CIRCLE','DAGGER']::text[], 'wrong', null);
select connections.submit_guess((select id from g2),
  array['ALPHA','BIRCH','CASTLE','DAGGER']::text[], 'wrong', null);

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g2)),
  'lost',
  'submit_guess (compete): everyone eliminated ends the game, lost'
);

-- The last player's act is the game's reason: ada's fourth mistake.
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_by_user_id::text
     from common.games where id = (select id from g2)),
  'resource_exhausted/mistakes/ada11111-1111-1111-1111-111111111111',
  'submit_guess (compete): the collective loss ends resource_exhausted/mistakes, by the last player out'
);

-- Every player is unranked and lost.
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g2)
      and final_ranking is null and outcome = 'lost'),
  2::bigint,
  'submit_guess (compete): every player is unranked and lost on a collective loss'
);

-- ============================================================
-- (15)–(16) submit_timeout's compete ending
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

-- Backdate status_changed_at, which only the status builder writes: `now()`
-- is fixed inside the test transaction, so this is how the timeout's builder
-- call shows.
reset role;
update common.games set status_changed_at = now() - interval '1 hour'
 where id = (select id from g3);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.submit_timeout((select id from g3));

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g3)),
  'lost',
  'submit_timeout (compete): the game ends lost, nobody ranked'
);

select is(
  (select status_changed_at from common.games where id = (select id from g3)),
  now(),
  'submit_timeout (compete): runs the builder, so the page''s copies catch up'
);

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/'
          || coalesce(game_ended_by_user_id::text, 'nobody')
     from common.games where id = (select id from g3)),
  'timeout/timeout/nobody',
  'submit_timeout (compete): reason timeout, ended by nobody'
);

-- Idempotency: a second concurrent fire is the game-over race.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  connections.submit_timeout((select id from g3)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'submit_timeout (compete): second call on an ended game is the game-over race');

-- ============================================================
-- (17)–(20) RLS sanity for compete
-- ============================================================
-- A new fresh game so opponents have guesses to read or not.
-- Ada and bea each submit one guess; cade's compete RLS should
-- show cade nothing beyond cade's own guesses (cade has none, so
-- count = 0).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g4 on commit drop as
select (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete')->'data'->>'id')::uuid as id;

select connections.submit_guess((select id from g4),
  array['ALPHA','BANANA','CASTLE','DAGGER']::text[], 'wrong', null);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select connections.submit_guess((select id from g4),
  array['ALPHA','BANANA','CASTLE','DELTA']::text[], 'wrong', null);

-- Ada sees her own guess only.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from connections.events where game_id = (select id from g4)),
  1::bigint,
  'rls (compete): ada sees only her own guess (1 row)'
);

-- Cade sees nothing (made no guesses).
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select count(*) from connections.events where game_id = (select id from g4)),
  0::bigint,
  'rls (compete): cade with no guesses sees zero rows'
);

-- All three players see all three connections.players rows
-- (mistake-counts are public to the club — that's how the
-- compete strip works).
select is(
  (select count(*) from connections.players where game_id = (select id from g4)),
  3::bigint,
  'rls (compete): every club member sees every player''s mistake row'
);

-- Dee (non-member) sees zero of anything.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*) from connections.players where game_id = (select id from g4))
  + (select count(*) from connections.events where game_id = (select id from g4))
  + (select count(*) from connections.games where game_id = (select id from g4)),
  0::bigint,
  'rls (compete): non-club-member sees zero rows across all three tables'
);

-- ============================================================
select * from finish();
rollback;
