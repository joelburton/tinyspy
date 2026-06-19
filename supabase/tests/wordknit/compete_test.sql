-- ============================================================
-- Test: wordknit compete mode
-- ============================================================
--
-- Coverage for the mode-aware schema + RPC behavior added in the
-- 20260620 wordknit_compete migration. The shared
-- coop-mode contract is exercised by create_game_test.sql,
-- gameplay_test.sql, rls_test.sql — this file focuses on the
-- compete delta:
--
--   - create_game `mode` param: invalid rejected, compete-with-
--     <2-players rejected, happy compete path
--   - per-player mistake decrement: caller's row only, opponents
--     untouched
--   - per-player partial unique index: same rank can be matched
--     once per player (ada and bea both match rank 0 → both rows
--     persist)
--   - first-to-all-4 ends the race: caller's 4th correct flips
--     play_state to solved_compete, caller's result {won: true},
--     opponents' result {won: false}; surviving players can no
--     longer submit
--   - elimination + collective loss: each player's 4 mistakes
--     eliminates them; once all are eliminated, play_state flips
--     to lost_compete
--   - eliminated-player submit rejected with P0001
--   - submit_timeout writes the compete-mode terminal state
--     (lost_compete + lost_compete_timeout)
--
-- See create_game_test.sql for the pgTAP / auth-simulation primer.

begin;

set search_path = wordknit, common, public, extensions;

select plan(27);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Fixture: ada + bea + cade form the club; dee stays outside.
-- ============================================================
-- A 3-player compete game is the smallest setup that exercises
-- "one player wins, two lose" and "all-three-eliminated".

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('compete-club',
  array['ada','bea','cade']) as handle;

create temp table puzzle on commit drop as
select pg_temp.wordknit_puzzle() as id;

-- ============================================================
-- (1) Invalid mode rejected
-- ============================================================

select throws_ok(
  format(
    $$ select wordknit.create_game(%L, pg_temp.wordknit_setup(%L::uuid),
                                    array['ada11111-1111-1111-1111-111111111111'::uuid,
                                          'bea22222-2222-2222-2222-222222222222'::uuid],
                                    'sudden-death') $$,
    (select handle from club), (select id from puzzle)
  ),
  'P0001',
  'mode must be coop or compete (got sudden-death)',
  'create_game: invalid mode value is rejected'
);

-- ============================================================
-- (2) Compete with <2 players rejected
-- ============================================================
-- The FE manifest's numberOfPlayers: [2, 6] hides the Start
-- button in 1-player clubs; this is the server-side catch.

select throws_ok(
  format(
    $$ select wordknit.create_game(%L, pg_temp.wordknit_setup(%L::uuid),
                                    array['ada11111-1111-1111-1111-111111111111'::uuid],
                                    'compete') $$,
    (select handle from club), (select id from puzzle)
  ),
  'P0001',
  'compete mode requires at least 2 players',
  'create_game: compete with 1 player is rejected'
);

-- ============================================================
-- (3)–(5) Happy compete path
-- ============================================================
-- Create a 3-player compete game; assert mode column, gametype
-- string, and per-player rows.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g on commit drop as
select * from wordknit.create_game(
  (select handle from club),
  pg_temp.wordknit_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete'
);

reset role;
select is(
  (select mode from wordknit.games where id = (select id from g)),
  'compete',
  'create_game: wordknit.games.mode = compete'
);

select is(
  (select gametype from common.games where id = (select id from g)),
  'wordknit_compete',
  'create_game: common.games.gametype = wordknit_compete'
);

select is(
  (select count(*) from wordknit.players where game_id = (select id from g)),
  3::bigint,
  'create_game: one wordknit.players row per player'
);

-- ============================================================
-- (6) Per-player mistake decrement (caller's row only)
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordknit.submit_guess(
  (select id from g),
  array['ALPHA','BANANA','CASTLE','DAGGER']::text[],
  'wrong', null
);

reset role;
select is(
  (select mistake_count from wordknit.players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid),
  1,
  'submit_guess (compete): caller mistake_count increments to 1'
);

select is(
  (select mistake_count from wordknit.players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'::uuid),
  0,
  'submit_guess (compete): opponent mistake_count untouched'
);

-- ============================================================
-- (7) Per-player partial unique index: different players can
--     both match the same rank
-- ============================================================
-- The compete index is (game_id, user_id, matched_category_rank)
-- where result='correct' AND mode='compete', so ada matching
-- rank-1 and bea matching rank-1 produce two rows, not a
-- unique_violation.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordknit.submit_guess(
  (select id from g),
  array['BANANA','BIRCH','BREAD','BRICK']::text[],
  'correct', 1
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordknit.submit_guess(
  (select id from g),
  array['BANANA','BIRCH','BREAD','BRICK']::text[],
  'correct', 1
);

reset role;
select is(
  (select count(*) from wordknit.guesses
    where game_id = (select id from g)
      and matched_category_rank = 1
      and result = 'correct'),
  2::bigint,
  'submit_guess (compete): same rank can be matched once per player'
);

-- ============================================================
-- (8) Same player double-matching a rank: still no-op
-- ============================================================
-- The compete index does include user_id, so ada trying to
-- re-submit rank-1 (her own already-matched category) is caught
-- by unique_violation just like the coop race-idempotency check.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format(
    $$ select wordknit.submit_guess(%L::uuid,
                                     array['BANANA','BIRCH','BREAD','BRICK']::text[],
                                     'correct', 1) $$,
    (select id from g)
  ),
  'submit_guess (compete): same player re-matching same rank is a silent no-op'
);

reset role;
select is(
  (select count(*) from wordknit.guesses
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
-- Ada matches the remaining 3 categories. Her 4th correct flips
-- play_state to solved_compete; bea and cade can no longer submit.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordknit.submit_guess((select id from g),
  array['ALPHA','ANGEL','APPLE','ARROW']::text[], 'correct', 0);
select wordknit.submit_guess((select id from g),
  array['CASTLE','CIRCLE','CLOUD','CROWN']::text[], 'correct', 2);
select wordknit.submit_guess((select id from g),
  array['DAGGER','DELTA','DIAMOND','DRAGON']::text[], 'correct', 3);

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'solved_compete',
  'submit_guess (compete): ada''s 4th correct flips play_state to solved_compete'
);

select is(
  (select result->>'won' from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid),
  'true',
  'submit_guess (compete): winner gets {won: true}'
);

select is(
  (select result->>'won' from common.game_players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'::uuid),
  'false',
  'submit_guess (compete): opponent gets {won: false} (race ended)'
);

-- Surviving player tries to submit after the race ended; the
-- play_state guard rejects.
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select throws_ok(
  format(
    $$ select wordknit.submit_guess(%L::uuid,
                                     array['ALPHA','ANGEL','APPLE','ARROW']::text[],
                                     'correct', 0) $$,
    (select id from g)
  ),
  'P0001',
  'game is not in progress',
  'submit_guess (compete): post-win opponent submit is rejected'
);

-- ============================================================
-- (12)–(14) All-eliminated → lost_compete
-- ============================================================
-- Fresh 2-player game. Bea racks up 4 mistakes (eliminated), ada
-- racks up 4 mistakes (also eliminated, MIN(mistake_count) >= 4
-- triggers collective loss).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from wordknit.create_game(
  (select handle from club),
  pg_temp.wordknit_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);

-- Bea: 4 wrong guesses → eliminated.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordknit.submit_guess((select id from g2),
  array['ALPHA','BANANA','CASTLE','DAGGER']::text[], 'wrong', null);
select wordknit.submit_guess((select id from g2),
  array['ALPHA','BANANA','CASTLE','DELTA']::text[], 'wrong', null);
select wordknit.submit_guess((select id from g2),
  array['ALPHA','BANANA','CIRCLE','DAGGER']::text[], 'wrong', null);
select wordknit.submit_guess((select id from g2),
  array['ALPHA','BIRCH','CASTLE','DAGGER']::text[], 'wrong', null);

reset role;
select is(
  (select mistake_count from wordknit.players
    where game_id = (select id from g2)
      and user_id = 'bea22222-2222-2222-2222-222222222222'::uuid),
  4,
  'submit_guess (compete): bea at 4 mistakes is eliminated'
);

select is(
  (select play_state from common.games where id = (select id from g2)),
  'playing',
  'submit_guess (compete): one eliminated player leaves game playing'
);

-- Eliminated bea tries to submit → rejected.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format(
    $$ select wordknit.submit_guess(%L::uuid,
                                     array['ALPHA','BANANA','CASTLE','DAGGER']::text[],
                                     'wrong', null) $$,
    (select id from g2)
  ),
  'P0001',
  'you are eliminated from this game',
  'submit_guess (compete): eliminated player''s submit is rejected'
);

-- Ada: 4 wrong guesses → also eliminated → collective loss.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordknit.submit_guess((select id from g2),
  array['ALPHA','BANANA','CASTLE','DAGGER']::text[], 'wrong', null);
select wordknit.submit_guess((select id from g2),
  array['ALPHA','BANANA','CASTLE','DELTA']::text[], 'wrong', null);
select wordknit.submit_guess((select id from g2),
  array['ALPHA','BANANA','CIRCLE','DAGGER']::text[], 'wrong', null);
select wordknit.submit_guess((select id from g2),
  array['ALPHA','BIRCH','CASTLE','DAGGER']::text[], 'wrong', null);

reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'lost_compete',
  'submit_guess (compete): everyone eliminated flips play_state to lost_compete'
);

select is(
  (select (status->>'outcome') from common.games where id = (select id from g2)),
  'lost_compete_mistakes',
  'submit_guess (compete): collective loss outcome = lost_compete_mistakes'
);

-- Every player gets {won: false}.
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g2)
      and (result->>'won') = 'false'),
  2::bigint,
  'submit_guess (compete): every player gets {won: false} on collective loss'
);

-- ============================================================
-- (15)–(16) submit_timeout writes lost_compete + the right
--           terminal outcome
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select * from wordknit.create_game(
  (select handle from club),
  pg_temp.wordknit_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);

select wordknit.submit_timeout((select id from g3));

reset role;
select is(
  (select play_state from common.games where id = (select id from g3)),
  'lost_compete',
  'submit_timeout (compete): writes lost_compete play_state'
);

select is(
  (select (status->>'outcome') from common.games where id = (select id from g3)),
  'lost_compete_timeout',
  'submit_timeout (compete): outcome = lost_compete_timeout'
);

-- Idempotency: a second concurrent fire raises P0001.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select wordknit.submit_timeout(%L::uuid) $$,
         (select id from g3)),
  'P0001',
  'game is not in progress',
  'submit_timeout (compete): second call on already-terminal game raises P0001'
);

-- ============================================================
-- (17)–(20) RLS sanity for compete
-- ============================================================
-- A new fresh game so opponents have guesses to read or not.
-- Ada and bea each submit one guess; cade's compete RLS should
-- show cade nothing beyond cade's own guesses (cade has none, so
-- count = 0).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g4 on commit drop as
select * from wordknit.create_game(
  (select handle from club),
  pg_temp.wordknit_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete'
);

select wordknit.submit_guess((select id from g4),
  array['ALPHA','BANANA','CASTLE','DAGGER']::text[], 'wrong', null);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordknit.submit_guess((select id from g4),
  array['ALPHA','BANANA','CASTLE','DELTA']::text[], 'wrong', null);

-- Ada sees her own guess only.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from wordknit.guesses where game_id = (select id from g4)),
  1::bigint,
  'rls (compete): ada sees only her own guess (1 row)'
);

-- Cade sees nothing (made no guesses).
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select count(*) from wordknit.guesses where game_id = (select id from g4)),
  0::bigint,
  'rls (compete): cade with no guesses sees zero rows'
);

-- All three players see all three wordknit.players rows
-- (mistake-counts are public to the club — that's how the
-- compete strip works).
select is(
  (select count(*) from wordknit.players where game_id = (select id from g4)),
  3::bigint,
  'rls (compete): every club member sees every player''s mistake row'
);

-- Dee (non-member) sees zero of anything.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*) from wordknit.players where game_id = (select id from g4))
  + (select count(*) from wordknit.guesses where game_id = (select id from g4))
  + (select count(*) from wordknit.games where id = (select id from g4)),
  0::bigint,
  'rls (compete): non-club-member sees zero rows across all three tables'
);

-- ============================================================
select * from finish();
rollback;
