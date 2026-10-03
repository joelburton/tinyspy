-- cs-blessed-connections

-- ============================================================
-- Test: connections.submit_guess — the only mid-game action
-- ============================================================
--
-- Covers the FE-trusts-the-server-records contract:
--   - payload rejections (wrong tile count, bad result enum,
--     bad matched rank)
--   - phase rejections (unauth, non-member, finished game)
--   - wrong path: the caller's n_mistakes++, the game goes on
--   - oneAway path: also counts as mistake
--   - correct path: an events row with result='correct' lands
--   - submit_guess's already-matched check makes a second
--     'correct' for the same rank a race: nothing written
--   - 4 mistakes ends the game resource_exhausted/'mistakes', lost
--   - 4 matched categories ends the game reached_goal/'solved',
--     every teammate ranked 1
--   - a guess into a game a friend just deleted is the shared race (PN485)
--
-- Every envelope is asserted to carry NO outcome, which is half of one rule:
-- an ok from this game is the FACT, and what it is worth is decided once, in
-- src/connections/lib/answer.ts (its test pins the other half).
--
-- See ../codenamesduet/create_game_test.sql for the pgTAP / auth-
-- simulation primer.

begin;

set search_path = connections, common, public, extensions;

select plan(25);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- Set up an active game from the fixture puzzle. The fixture's
-- 16 tiles (ALPHA, ANGEL, APPLE, ARROW, BANANA, BIRCH, BREAD,
-- BRICK, CASTLE, CIRCLE, CLOUD, CROWN, DAGGER, DELTA, DIAMOND,
-- DRAGON) are what the wrong/correct assertions below reference.
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada and Bea', array['ada','bea']) as handle;
create temp table puzzle on commit drop as
select pg_temp.connections_puzzle() as id;
create temp table g on commit drop as
select (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;

-- ============================================================
-- (1) Wrong tile count is rejected
-- ============================================================

-- A converted RPC does not THROW its own not-oks — it catches them and answers
-- with an envelope, so these read the answer instead of catching an exception.
select pg_temp.envelope_is(
  connections.submit_guess((select id from g),
                           array['ALPHA','ANGEL','APPLE']::text[], 'wrong', null),
  '{"type":"not-ok","severity":"fault","dbcode":"PN247",
    "message":"BUG: guess that was not four tiles"}'::jsonb,
  'submit_guess: 3-tile guess is rejected'
);

-- ============================================================
-- (2) Bad result enum is rejected
-- ============================================================

select pg_temp.envelope_is(
  connections.submit_guess((select id from g),
                           array['ALPHA','ANGEL','APPLE','ARROW']::text[], 'banana', null),
  '{"type":"not-ok","severity":"fault","dbcode":"PN248",
    "message":"BUG: unknown guess result"}'::jsonb,
  'submit_guess: bogus result enum is rejected'
);

-- ============================================================
-- (3) result='correct' requires a rank
-- ============================================================

select pg_temp.envelope_is(
  connections.submit_guess((select id from g),
                           array['ALPHA','ANGEL','APPLE','ARROW']::text[], 'correct', null),
  '{"type":"not-ok","severity":"fault","dbcode":"PN249",
    "message":"BUG: correct guess with no category"}'::jsonb,
  'submit_guess: correct without a matched rank is rejected'
);

-- ============================================================
-- (4) Non-player is rejected (uses _require_game_player now)
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  connections.submit_guess((select id from g),
                           array['ALPHA','ANGEL','APPLE','ARROW']::text[], 'wrong', null),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'submit_guess: non-player is rejected (via _require_game_player)'
);

-- ============================================================
-- (5)–(7) Wrong guess: counts as a mistake
-- ============================================================

-- `lives_ok` said only that it did not throw, which stayed true after the
-- conversion and would have stayed true if the answer became a race. The
-- envelope is the claim worth making: the mistake was COUNTED.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  connections.submit_guess((select id from g),
                           array['ALPHA','BANANA','CASTLE','DAGGER']::text[],
                           'wrong', null),
  '{"type": "ok", "outcome": null, "data": {"result": "wrong"}}'::jsonb,
  'submit_guess: a wrong guess names its case and carries no outcome'
);

reset role;
select is(
  -- Each row is its player's own; coop's shared count is their sum.
  (select sum(n_mistakes)::int from connections.players where game_id = (select id from g)),
  1,
  'submit_guess: wrong guess takes the team''s mistakes to 1'
);

-- (7b) A repeat of the same wrong tile set (any order) is a race — nothing
-- written, and it must NOT cost a second mistake. Guards the coop shared-selection double-
-- submit (two players Submit the identical 4 tiles at once); resubmitting in a
-- DIFFERENT order also pins the order-insensitive comparison.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  connections.submit_guess((select id from g),
                           array['DAGGER','ALPHA','CASTLE','BANANA']::text[],
                           'wrong', null),
  '{"type": "not-ok", "severity": "race", "dbcode": "PN301",
    "message": "You already tried that"}'::jsonb,
  'submit_guess: a repeat wrong guess (reordered) is a race'
);

-- (7c) The THIRD ok answer: a one-away guess is recorded like a wrong one, and
-- says which verdict it wrote. Pinned because the FE branches on it — nothing
-- else in the suite reaches this return.
select pg_temp.envelope_is(
  connections.submit_guess((select id from g),
                           array['ALPHA','ANGEL','APPLE','BANANA']::text[],
                           'oneAway', null),
  '{"type": "ok", "outcome": null, "data": {"result": "oneAway"}}'::jsonb,
  'submit_guess: a one-away guess names its case and carries no outcome'
);
reset role;
select is(
  (select sum(n_mistakes)::int from connections.players where game_id = (select id from g)),
  2,
  'submit_guess: the repeat cost nothing; only the one-away above added a mistake'
);

select is(
  (select ended_at from common.games where id = (select id from g)),
  null,
  'submit_guess: wrong guess leaves the game being played'
);

-- ============================================================
-- (8) Correct guess: a result='correct' guesses row lands
-- ============================================================

-- Asserted rather than called bare: the FE branches on this `result`, and a
-- guess that wrote NOTHING is a race (PN300 / PN301) — so reaching `matched`
-- is the claim that the match is durably recorded.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  connections.submit_guess(
    (select id from g),
    array['ALPHA','ANGEL','APPLE','ARROW']::text[],
    'correct',
    0
  ),
  '{"type": "ok", "outcome": null, "data": {"result": "correct"}}'::jsonb,
  'submit_guess: a correct guess names its case and carries no outcome'
);

reset role;
select is(
  (select count(*) from connections.events
    where game_id = (select id from g)
      and result = 'correct'
      and matched_cat_rank = 0),
  1::bigint,
  'submit_guess: correct guess inserts one correct row at rank 0'
);

-- Every row in this table is an accepted guess, and an accepted guess is the
-- player having a go — the fourth group and the fourth mistake included. A
-- repeat of a tile set already tried is refused before any insert, so there is
-- no row here that spent nothing.
select is(
  (select array_agg(distinct kind || ':' || took_turn) from connections.events
    where game_id = (select id from g)),
  array['guess:true'],
  'every row is a guess that spent a turn'
);

-- ============================================================
-- (9) A second 'correct' for the same rank is a race — the
--     already-matched check catches it, and nothing is written
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  connections.submit_guess((select id from g),
                           array['ALPHA','ANGEL','APPLE','ARROW']::text[],
                           'correct', 0),
  '{"type": "not-ok", "severity": "race", "dbcode": "PN300",
    "message": "That category is already matched"}'::jsonb,
  'submit_guess: a repeat correct on the same rank is a race'
);

reset role;
select is(
  (select count(*) from connections.events
    where game_id = (select id from g)
      and result = 'correct'
      and matched_cat_rank = 0),
  1::bigint,
  'submit_guess: still exactly one correct row at rank 0 after the race'
);

-- ============================================================
-- (10)–(11) Solve path: match the other 3 categories → won
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.submit_guess(
  (select id from g),
  array['BANANA','BIRCH','BREAD','BRICK']::text[],
  'correct', 1
);
select connections.submit_guess(
  (select id from g),
  array['CASTLE','CIRCLE','CLOUD','CROWN']::text[],
  'correct', 2
);
select connections.submit_guess(
  (select id from g),
  array['DAGGER','DELTA','DIAMOND','DRAGON']::text[],
  'correct', 3
);

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g)),
  'reached_goal/solved/won',
  'submit_guess: 4 matched categories ends the game reached_goal, won'
);

-- The team solves together: every teammate ranked 1, won, and solved.
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g) and final_ranking = 1 and outcome = 'won'
      and solved_at is not null),
  2::bigint,
  'submit_guess: every teammate is ranked 1, won, and solved on the win'
);

-- ============================================================
-- (12)–(14) Loss path: a fresh game, 4 wrong guesses → lost
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;

-- Four wrong guesses with distinct tile sets so they pass the
-- "exactly 4 tiles" payload check. (Tile membership / dup check
-- is enforced FE-side per the FE-knows model — server just
-- records what it's told.)
select connections.submit_guess(
  (select id from g2),
  array['ALPHA','BANANA','CASTLE','DAGGER']::text[],
  'wrong', null
);
select connections.submit_guess(
  (select id from g2),
  array['ALPHA','BANANA','CASTLE','DELTA']::text[],
  'wrong', null
);
select connections.submit_guess(
  (select id from g2),
  array['ALPHA','BANANA','CIRCLE','DAGGER']::text[],
  'wrong', null
);

reset role;
-- After 3 wrong, the team's mistakes are 3, and the game goes on.
select is(
  (select sum(n_mistakes)::int from connections.players where game_id = (select id from g2)),
  3,
  'submit_guess: 3 wrong guesses leaves the team''s mistakes at 3'
);
select is(
  (select ended_at from common.games where id = (select id from g2)),
  null,
  'submit_guess: 3 wrong guesses leaves the game being played'
);

-- The 4th wrong takes the team's mistakes to 4 and ends the game, lost.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.submit_guess(
  (select id from g2),
  array['ALPHA','BIRCH','CASTLE','DAGGER']::text[],
  'wrong', null
);

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g2)),
  'resource_exhausted/mistakes/lost',
  'submit_guess: 4th wrong guess ends the game resource_exhausted/mistakes, lost'
);

-- ============================================================
-- (15)–(18) submit_timeout — timeout-loss path
-- ============================================================
-- The FE fires this when the count-down timer hits 0. The game
-- ends lost just like a 4-mistakes loss; the reason is what tells
-- them apart. Idempotent: a second concurrent call from a racing
-- client answers the game-over race.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;

-- Happy path: playing → submit_timeout → lost.
select lives_ok(
  format(
    $$ select connections.submit_timeout(%L::uuid) $$,
    (select id from g3)
  ),
  'submit_timeout: playing game accepts the call'
);

reset role;
-- Free-for-all coop has no turn holder, so nobody ended it.
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
          || '/' || coalesce(game_ended_by_user_id::text, 'nobody')
     from common.games where id = (select id from g3)),
  'timeout/timeout/lost/nobody',
  'submit_timeout: ends the game timeout, lost, ended by nobody'
);

-- Nobody is ranked on a timeout loss.
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g3) and final_ranking is null and outcome = 'lost'),
  2::bigint,
  'submit_timeout: every player is unranked and lost'
);

-- Idempotency: a second call from any caller on the already-
-- lost game is the game-over race.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  connections.submit_timeout((select id from g3)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'submit_timeout: rejects on games that have ended');

-- ============================================================
-- A guess into a game a friend deleted
-- ============================================================
-- The delete takes the game's rows and every membership together, so the
-- guess answers the shared race rather than a fault or "You are not in this
-- game" (docs/envelopes.md → a missing game row is PN485).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gone_g on commit drop as
select (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;
reset role;
delete from common.games where id = (select id from gone_g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select pg_temp.envelope_is(
  connections.submit_guess((select id from gone_g),
                           array['ALPHA','ANGEL','APPLE','ARROW']::text[], 'wrong', null),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'submit_guess into a deleted game is the shared race (PN485)'
);

-- ============================================================
select * from finish();
rollback;
