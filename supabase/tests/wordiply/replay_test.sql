-- ============================================================
-- Test: wordiply.replay_board (restart this board from scratch)
-- ============================================================
-- A fork of wordwheel's replay_test. The "Replay board" game-menu item
-- / terminal RestartButton. Clears the guesses log (the game's only
-- working state), un-terminals the row with the same initial status
-- create_game seeds, and zeroes the shared clock. The frozen board
-- (base + max_word_length + the word lists) survives. Any game player
-- may call it, mid-game or post-terminal; a non-player is rejected.
--
-- THE FORK: wordiply has no rank ladder and no target_rank, so the
-- coop status resets to `guesses_used: 0` (not a score/rank pair) and
-- the compete case checks the per-player LEADERBOARD is rebuilt at
-- zero — the mode-branched status that replay_board rebuilds by hand.
--
-- OVERLAP WITH terminal_test §3, on purpose: that file replays a coop
-- game as one of its terminal paths (play_state / guesses wiped /
-- guesses_used / base). This file is the dedicated replay suite every
-- other replay game has, and carries what §3 doesn't reach — the
-- COMPETE branch (the leaderboard rebuild, a hand-written jsonb that
-- nothing else exercises), is_terminal, the shared clock, that the
-- terminal readouts don't survive into the fresh status, and the
-- non-player gate.
--
-- All guesses are synthetic strings that satisfy the two free guards
-- (contain 'ar', longer than it) — wordiply is trusting-commit, so
-- they need not be real words. See setup.psql.

begin;
set search_path = wordiply, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(12);

-- ── Coop: guess, manual-end, then replay → fully reset ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Wire replay', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select * from wordiply.create_game(
  (select handle from club), pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
);

-- Two guesses (7 and 5 letters) + a manual end → guess rows, a non-zero
-- status, and a terminal row: exactly what replay undoes.
select wordiply.submit_guess((select id from g1), 'arxxxxx');
select wordiply.submit_guess((select id from g1), 'arxxx');
select wordiply.end_game((select id from g1));

reset role;
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  true, 'precondition — manually ended game is terminal');
select is(
  (select count(*) from wordiply.guesses where game_id = (select id from g1)),
  2::bigint, 'precondition — the two guesses were recorded');
-- Age the shared clock so the replay's clock-zeroing is observable.
update common.timers set ticks = 99 where game_id = (select id from g1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordiply.replay_board((select id from g1));
reset role;

select is(
  (select play_state from common.games where id = (select id from g1)),
  'playing', 'replay → play_state back to playing');
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  false, 'replay → is_terminal cleared');
select is(
  (select count(*) from wordiply.guesses where game_id = (select id from g1)),
  0::bigint, 'replay → the guesses log is cleared');
select is(
  (select status->>'guesses_used' from common.games where id = (select id from g1)),
  '0', 'replay → status.guesses_used reset to 0');
-- The terminal-only readouts (length score, letter count, the longest word)
-- are written by _finish_coop into status; the rebuilt status must not carry
-- them forward, or a replayed board opens showing the PRIOR attempt's result.
select ok(
  (select status ? 'length_score' from common.games where id = (select id from g1)) is false,
  'replay → the terminal readouts are gone from status, not carried forward');
select is(
  (select ticks from common.timers where game_id = (select id from g1)),
  0, 'replay → the shared clock is zeroed (a timed game restarts full)');
select is(
  (select base || ':' || max_word_length
     from wordiply.games where id = (select id from g1)),
  'ar:7', 'replay → the frozen board survives (same base, run it back)');

-- ── Compete: the rebuilt status carries a zeroed leaderboard ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
);
select wordiply.submit_guess((select id from g2), 'arxxxxx');
select wordiply.replay_board((select id from g2));
reset role;
-- One entry per player, every one back at zero. replay_board rebuilds this
-- from common.game_players rather than reusing create_game's array, so the
-- row count is worth pinning alongside the values.
select is(
  (select count(*) from jsonb_array_elements(
     (select status->'leaderboard' from common.games where id = (select id from g2)))),
  2::bigint, 'compete replay → the leaderboard still has a row per player');
select ok(
  (select bool_and((e->>'guesses_used')::int = 0)
     from jsonb_array_elements(
       (select status->'leaderboard' from common.games where id = (select id from g2))) e),
  'compete replay → every leaderboard entry is back to 0 guesses used');

-- ── Non-player rejected ─────────────────────────────────────
-- 42501 = common.require_game_player's 'not playing this game'.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select wordiply.replay_board(%L::uuid) $$, (select id from g1)),
  '42501', NULL, 'a non-player cannot replay the board');

select * from finish();
rollback;
