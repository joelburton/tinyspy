-- ============================================================
-- Test: wordwheel COOP target rank (the coop win condition)
-- ============================================================
--
-- Coop used to have no win at all — it only ever reached 'ended', via the clock
-- or the End button. It can now carry the same `setup.target_rank` compete uses,
-- meaning "reach this rank TOGETHER and you win". Absent/null keeps the old
-- open-ended hunt.
--
-- Coverage (the four coop terminals this creates):
--   1. target reached  → play_state 'won',  outcome 'target',  everyone {won:true}
--   2. …and the game is really over: a later submit_word is rejected
--   3. clock expires with a target set + unreached → 'lost', outcome 'timeout'
--   4. clock expires with NO target                → 'ended' (nothing to fail at)
--   5. manual End with a target set + unreached    → 'ended' (stopping ≠ losing)
--
-- The fixture board scores 62 required points, so rank thresholds are
-- Good ≥ 8 / Solid ≥ 15 / Nice ≥ 22 (see setup.psql). The synthetic 24-point
-- nine-letter pangram 'ihgfedcba' therefore crosses Nice (rank 3) in one move.
--
-- See ../codenamesduet/create_game_test.sql for the pgTAP primer.

begin;

set search_path = wordwheel, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Fixture: ada + bea club, coop game targeting rank 3 (Nice)
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Coop target', array['ada','bea']) as handle;

create temp table g on commit drop as
select * from wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup() || '{"target_rank": 3}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordwheel_board()
);

-- ============================================================
-- (1) Below the target: a 1-point word doesn't end anything
-- ============================================================

select is(
  wordwheel.submit_word((select id from g), 'bead', 1, false, false)->>'result',
  'accepted',
  'coop: a sub-target word is accepted and the game continues'
);

select is(
  (select play_state from common.games where id = (select id from g)),
  'playing',
  'coop: still playing below the target rank'
);

-- ============================================================
-- (2) Crossing the target ends the game as a TEAM win
-- ============================================================
-- 1 + 24 = 25 points, past rank 3 (Nice, ≥ 22). Bea plays it, but the win is
-- the team's — coop has no individual result.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  wordwheel.submit_word((select id from g), 'ihgfedcba', 24, true, false)->>'won',
  'true',
  'coop: the word that crosses the target reports the win to its caller'
);

select is(
  (select play_state from common.games where id = (select id from g)),
  'won',
  'coop: crossing the target rank writes play_state = won'
);

select is(
  (select is_terminal from common.games where id = (select id from g)),
  true,
  'coop: the win is a real terminal'
);

select is(
  (select status->>'outcome' from common.games where id = (select id from g)),
  'target',
  'coop: status.outcome = target (distinguishes it from timeout / manual)'
);

select is(
  (select (status->>'target_rank')::int from common.games where id = (select id from g)),
  3,
  'coop: the terminal status re-emits target_rank (end_game replaces status wholesale)'
);

-- EVERY player wins, including bea who wasn't the one to submit: it's a team.
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g) and (result->>'won')::boolean),
  2,
  'coop: both players get {won: true} — nobody wins a coop game alone'
);

-- ============================================================
-- (3) The game is really over
-- ============================================================

select throws_ok(
  format($$ select wordwheel.submit_word(%L, 'cafe', 1, false, false) $$,
         (select id from g)),
  'P0001',
  'game is not in progress',
  'coop: no more words after the team wins'
);

-- ============================================================
-- (4) Clock expiry WITH an unreached target → a real loss
-- ============================================================

create temp table club2 on commit drop as
select common.create_club('Coop timeout', array['ada','bea']) as handle;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from wordwheel.create_game(
  (select handle from club2),
  pg_temp.wordwheel_setup() || '{"target_rank": 6}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop',
  pg_temp.wordwheel_board()
);

select wordwheel.submit_timeout((select id from g2));

select is(
  (select play_state from common.games where id = (select id from g2)),
  'lost',
  'coop: the clock beating an unreached target is a LOSS, not a neutral stop'
);

-- ============================================================
-- (5) Clock expiry with NO target → the neutral stop
-- ============================================================

create temp table club3 on commit drop as
select common.create_club('Coop no target', array['ada','bea']) as handle;

create temp table g3 on commit drop as
select * from wordwheel.create_game(
  (select handle from club3),
  pg_temp.wordwheel_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop',
  pg_temp.wordwheel_board()
);

select wordwheel.submit_timeout((select id from g3));

select is(
  (select play_state from common.games where id = (select id from g3)),
  'ended',
  'coop: with no target there is nothing to fail — expiry is the neutral end'
);

-- ============================================================
-- (6) Manual End with an unreached target → still neutral
-- ============================================================
-- Choosing to stop isn't losing; only the clock running out is.

create temp table club4 on commit drop as
select common.create_club('Coop manual', array['ada','bea']) as handle;

create temp table g4 on commit drop as
select * from wordwheel.create_game(
  (select handle from club4),
  pg_temp.wordwheel_setup() || '{"target_rank": 6}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop',
  pg_temp.wordwheel_board()
);

select wordwheel.end_game((select id from g4));

select is(
  (select play_state from common.games where id = (select id from g4)),
  'ended',
  'coop: manual End is neutral even with a target set and missed'
);

select * from finish();
rollback;
