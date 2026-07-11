-- ============================================================
-- Test: spellingbee.replay_board (restart this board from scratch)
-- ============================================================
-- The "Replay board" game-menu item / terminal RestartButton. Clears the
-- found-words log (the game's only working state), un-terminals the row
-- with the same initial status create_game seeds, and zeroes the shared
-- clock. The frozen board (letters + word lists) survives. Any game
-- player may call it, mid-game or post-terminal; a non-player is rejected.

begin;
set search_path = spellingbee, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(10);

-- ── Coop: find words, manual-end, then replay → fully reset ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Bee replay', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select * from spellingbee.create_game(
  (select handle from club), pg_temp.spellingbee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.spellingbee_board()
);

-- Two finds ('bead' from the fixture required list; the pangram) + a manual
-- end → found rows, a non-zero status, and a terminal row: what replay undoes.
select spellingbee.submit_word((select id from g1), 'bead', 1, false, false);
select spellingbee.submit_word((select id from g1), 'abcdefg', 17, true, false);
select spellingbee.end_game((select id from g1));

reset role;
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  true, 'precondition — manually ended game is terminal');
-- Age the shared clock so the replay's clock-zeroing is observable.
update common.timers set ticks = 99 where game_id = (select id from g1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select spellingbee.replay_board((select id from g1));
reset role;

select is(
  (select play_state from common.games where id = (select id from g1)),
  'playing', 'replay → play_state back to playing');
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  false, 'replay → is_terminal cleared');
select is(
  (select count(*) from spellingbee.found_words where game_id = (select id from g1)),
  0::bigint, 'replay → the found-words log is cleared');
select is(
  (select status->>'found_words_score' from common.games where id = (select id from g1)),
  '0', 'replay → status.found_words_score reset to 0');
select is(
  (select status->>'rank_idx' from common.games where id = (select id from g1)),
  '0', 'replay → status.rank_idx reset to 0');
select is(
  (select ticks from common.timers where game_id = (select id from g1)),
  0, 'replay → the shared clock is zeroed (a timed game restarts full)');
select is(
  (select outer_letters from spellingbee.games where id = (select id from g1))::text,
  'abcdfg', 'replay → the frozen board survives (same letters, run it back)');

-- ── Compete: the reset status carries the frozen target_rank ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup() || '{"target_rank": 3}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.spellingbee_board()
);
select spellingbee.submit_word((select id from g2), 'bead', 1, false, false);
select spellingbee.replay_board((select id from g2));
reset role;
select is(
  (select status->>'target_rank' from common.games where id = (select id from g2)),
  '3', 'compete replay → target_rank survives in the fresh status');

-- ── Non-player rejected ─────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select spellingbee.replay_board(%L::uuid) $$, (select id from g1)),
  NULL, NULL, 'a non-player cannot replay the board');

select * from finish();
rollback;
