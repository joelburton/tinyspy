-- ============================================================
-- Test: boggle.replay_board (restart this board from scratch)
-- ============================================================
-- The "Replay board" game-menu item / terminal RestartButton
-- (spellingbee's twin). Clears the found-words log (the game's only
-- working state), un-terminals the row with the same initial status
-- create_game seeds, and zeroes the shared clock. The frozen board
-- (faces + word lists) survives. Any game player may call it, mid-game
-- or post-terminal; a non-player is rejected.

begin;
set search_path = boggle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(9);

-- ── Coop: find a word, manual-end, then replay → fully reset ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Boggle replay', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select * from boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.boggle_board()
);

-- A find + a manual end → a found row, a non-zero status, a terminal row:
-- the state a replay must undo.
select boggle.submit_word((select id from g1), 'cat', 1, false);
select boggle.end_game((select id from g1));

reset role;
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  true, 'precondition — manually ended game is terminal');
-- Age the shared clock so the replay's clock-zeroing is observable.
update common.timers set ticks = 99 where game_id = (select id from g1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select boggle.replay_board((select id from g1));
reset role;

select is(
  (select play_state from common.games where id = (select id from g1)),
  'playing', 'replay → play_state back to playing');
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  false, 'replay → is_terminal cleared');
select is(
  (select count(*) from boggle.found_words where game_id = (select id from g1)),
  0::bigint, 'replay → the found-words log is cleared');
select is(
  (select status->>'score' from common.games where id = (select id from g1)),
  '0', 'replay → status.score reset to 0');
select is(
  (select ticks from common.timers where game_id = (select id from g1)),
  0, 'replay → the shared clock is zeroed (a timed game restarts full)');
select is(
  (select board from boggle.games where id = (select id from g1)),
  'CATRSEXOTMPLNGDB', 'replay → the frozen board survives (same faces, run it back)');

-- ── Compete: the reset status carries the fresh empty leaderboard ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.boggle_board()
);
select boggle.submit_word((select id from g2), 'cat', 1, false);
select boggle.replay_board((select id from g2));
reset role;
select is(
  (select status->'leaderboard' from common.games where id = (select id from g2))::text,
  '[]', 'compete replay → the leaderboard resets to empty');

-- ── Non-player rejected ─────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select boggle.replay_board(%L::uuid) $$, (select id from g1)),
  NULL, NULL, 'a non-player cannot replay the board');

select * from finish();
rollback;
