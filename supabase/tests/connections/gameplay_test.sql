-- cs-met-connections

-- ============================================================
-- Test: connections.submit_guess — the only mid-game action
-- ============================================================
--
-- Covers the FE-trusts-the-server-records contract:
--   - payload rejections (wrong tile count, bad result enum,
--     bad matched_category_rank)
--   - phase rejections (unauth, non-member, finished game)
--   - wrong path: mistake_count++, play_state stays playing
--   - oneAway path: also counts as mistake
--   - correct path: an events row with result='correct' lands
--   - the partial unique index on (game_id,
--     matched_category_rank) where result='correct' makes a
--     second 'correct' for the same rank a race: nothing written
--   - 4 mistakes flips play_state to 'lost', clears
--     is_current_view flipped via common.end_game
--   - 4 matched categories flips play_state to 'won', clears
--     is_current_view flipped via common.end_game
--
-- Every envelope is asserted to carry NO outcome, which is half of one rule:
-- an ok from this game is the FACT, and what it is worth is decided once, in
-- src/connections/lib/answer.ts (its test pins the other half).
--
-- See ../codenamesduet/create_game_test.sql for the pgTAP / auth-
-- simulation primer.

begin;

set search_path = connections, common, public, extensions;

select plan(24);

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

-- A converted RPC does not THROW its own refusals — it catches them and answers
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
  'submit_guess: correct without matched_category_rank is rejected'
);

-- ============================================================
-- (4) Non-player is rejected (uses require_game_player now)
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  connections.submit_guess((select id from g),
                           array['ALPHA','ANGEL','APPLE','ARROW']::text[], 'wrong', null),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'submit_guess: non-player is rejected (via require_game_player)'
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
  -- mistake_count moved to connections.players (per-player). Coop
  -- updates every row in lock-step; reading max gives the
  -- canonical shared value.
  (select max(mistake_count) from connections.players where game_id = (select id from g)),
  1,
  'submit_guess: wrong guess increments mistake_count to 1'
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
  (select max(mistake_count) from connections.players where game_id = (select id from g)),
  2,
  'submit_guess: the repeat cost nothing; only the one-away above added a mistake'
);

select is(
  (select play_state from common.games where id = (select id from g)),
  'playing',
  'submit_guess: wrong guess leaves play_state playing'
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
      and matched_category_rank = 0),
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
--     partial unique index catches it, and nothing is written
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
      and matched_category_rank = 0),
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
  (select play_state from common.games where id = (select id from g)),
  'won',
  'submit_guess: 4 matched categories flips play_state to won (outcome names the solve)'
);

-- end_game marks the row terminal (is_current_view is left alone
-- — the post-game review still lives on the current-view row).
select is(
  (select is_terminal from common.games where id = (select id from g)),
  true,
  'submit_guess: end_game sets is_terminal=true on win'
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
-- After 3 wrong, mistake_count = 3, play_state still playing.
select is(
  (select max(mistake_count) from connections.players where game_id = (select id from g2)),
  3,
  'submit_guess: 3 wrong guesses leaves mistake_count at 3'
);
select is(
  (select play_state from common.games where id = (select id from g2)),
  'playing',
  'submit_guess: 3 wrong guesses leaves play_state playing'
);

-- The 4th wrong takes mistake_count to 4 and flips play_state to lost.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.submit_guess(
  (select id from g2),
  array['ALPHA','BIRCH','CASTLE','DAGGER']::text[],
  'wrong', null
);

reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'lost',
  'submit_guess: 4th wrong guess flips play_state to lost'
);

-- ============================================================
-- (15)–(18) submit_timeout — timeout-loss path
-- ============================================================
-- The FE fires this when the count-down timer hits 0. Sets
-- play_state='lost' just like a 4-mistakes-loss (the timeout
-- distinction lives in status->>'outcome'). Idempotent: a
-- second concurrent call from a racing client answers the
-- game-over race.

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
select is(
  (select play_state from common.games where id = (select id from g3)),
  'lost',
  'submit_timeout: flips play_state to lost'
);

-- end_game marks the row terminal on timeout-loss too.
select is(
  (select is_terminal from common.games where id = (select id from g3)),
  true,
  'submit_timeout: end_game sets is_terminal=true on timeout-loss'
);

-- Idempotency: a second call from any caller on the already-
-- lost game is the game-over race.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  connections.submit_timeout((select id from g3)),
  '{"type":"not-ok","severity":"race","outcome":"noted","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'submit_timeout: rejects on already-terminal games');

-- ============================================================
select * from finish();
rollback;
