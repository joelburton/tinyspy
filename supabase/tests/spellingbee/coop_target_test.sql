-- cs-blessed-spellingbee

-- ============================================================
-- Test: spellingbee COOP target rank (the coop win condition)
-- ============================================================
--
-- Coop may carry the same `setup.target_rank` compete uses, meaning "reach
-- this rank TOGETHER and you win"; absent/null is the open-ended hunt, which
-- only the clock or the End button stops.
--
-- Coverage (the coop endings a target creates):
--   1. target reached  → reached_goal / target, won, everyone ranked 1
--   2. …and the game is really over: a later submit_word is rejected
--   3. clock expires with a target set + unreached → lost, timeout
--   4. clock expires with NO target                → neutral (nothing to fail at)
--   5. manual End with a target set + unreached    → neutral (stopping ≠ losing)
--
-- The fixture board scores 50 required points, so rank thresholds are
-- Good ≥ 6 / Solid ≥ 12 / Nice ≥ 18 (see setup.psql). The synthetic 17-point
-- pangram 'abcdefg' therefore crosses Nice (rank 3) in a single move.
--
-- See ../codenamesduet/create_game_test.sql for the pgTAP primer.

begin;

set search_path = spellingbee, common, public, extensions;

select plan(13);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- Fixture: ada + bea club, coop game targeting rank 3 (Nice)
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Coop target', array['ada','bea']) as handle;

create temp table g on commit drop as
select (spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup() || '{"target_rank": 3}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id;

-- ============================================================
-- (1) Below the target: a 1-point word doesn't end anything
-- ============================================================

select is(
  spellingbee.submit_word((select id from g), 'bead', 1, false, false)->'data'->>'result',
  'accepted',
  'coop: a sub-target word is accepted and the game continues'
);

select is(
  (select ended_at from common.games where id = (select id from g)),
  null,
  'coop: still playing below the target rank'
);

-- ============================================================
-- (2) Crossing the target ends the game as a TEAM win
-- ============================================================
-- 1 + 17 = 18 points = rank 3 (Nice) exactly. Bea plays it, but the win is the
-- team's — coop has no individual result.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  spellingbee.submit_word((select id from g), 'abcdefg', 17, true, false),
  -- No outcome and no message: the frontend says what a word is worth
  -- (src/spellingbee/lib/answer.ts, whose test names this one).
  '{"type":"ok","data":{"result":"won"},"outcome":null,"message":null}'::jsonb,
  'coop: the word that crosses the target reports the win to its caller'
);

select is(
  (select game_ended_outcome from common.games where id = (select id from g)),
  'won',
  'coop: crossing the target rank wins the game'
);

select is(
  (select game_ended_by_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'coop: the win is a real ending, by the word''s submitter'
);

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g)),
  'reached_goal/target',
  'coop: the reason is reached_goal / target (distinguishes it from timeout / stopped)'
);

select is(
  (select (clubpage_info->>'target_rank')::int from common.games where id = (select id from g)),
  3,
  'coop: the ended game''s club line carries target_rank'
);

-- EVERY player wins, including ada who wasn't the one to submit: it's a team.
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g) and final_ranking = 1 and outcome = 'won'),
  2,
  'coop: both players are ranked 1, won — nobody wins a coop game alone'
);

-- ============================================================
-- (3) The game is really over
-- ============================================================

-- A RACE, not a bug: the game can end while a submission is in flight.
select pg_temp.envelope_is(
  spellingbee.submit_word((select id from g), 'cafe', 1, false, false),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN486","message":"Game over"}'::jsonb,
  'coop: no more words after the team wins'
);

-- ============================================================
-- (4) Clock expiry WITH an unreached target → a real loss
-- ============================================================

create temp table club2 on commit drop as
select pg_temp.create_club('Coop timeout', array['ada','bea']) as handle;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (spellingbee.create_game(
  (select handle from club2),
  pg_temp.spellingbee_setup() || '{"target_rank": 6}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop',
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id;

select spellingbee.submit_timeout((select id from g2));

select is(
  (select game_ended_reason || '/' || game_ended_outcome from common.games where id = (select id from g2)),
  'timeout/lost',
  'coop: the clock beating an unreached target is a LOSS, not a neutral stop'
);

-- A player's ending is the win's shape inverted: unranked, lost.
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome
     from common.game_players where game_id = (select id from g2)),
  'unranked/lost',
  'coop: a loss leaves each player unranked, lost'
);

-- ============================================================
-- (5) Clock expiry with NO target → the neutral stop
-- ============================================================

create temp table club3 on commit drop as
select pg_temp.create_club('Coop no target', array['ada','bea']) as handle;

create temp table g3 on commit drop as
select (spellingbee.create_game(
  (select handle from club3),
  pg_temp.spellingbee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop',
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id;

select spellingbee.submit_timeout((select id from g3));

select is(
  (select game_ended_reason || '/' || game_ended_outcome from common.games where id = (select id from g3)),
  'timeout/neutral',
  'coop: with no target there is nothing to fail — expiry is the neutral end'
);

-- ============================================================
-- (6) Manual End with an unreached target → still neutral
-- ============================================================
-- Choosing to stop isn't losing; only the clock running out is.

create temp table club4 on commit drop as
select pg_temp.create_club('Coop manual', array['ada','bea']) as handle;

create temp table g4 on commit drop as
select (spellingbee.create_game(
  (select handle from club4),
  pg_temp.spellingbee_setup() || '{"target_rank": 6}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop',
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id;

select spellingbee.stop_game((select id from g4));

select is(
  (select game_ended_reason || '/' || game_ended_outcome from common.games where id = (select id from g4)),
  'stopped/neutral',
  'coop: manual End is neutral even with a target set and missed'
);

select * from finish();
rollback;
