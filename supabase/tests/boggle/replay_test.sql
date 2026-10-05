-- cs-unmet

-- ============================================================
-- Test: boggle.replay_board (restart this board from scratch)
-- ============================================================
-- The "Replay board" game-menu item / end-of-game RestartButton
-- (spellingbee's twin). Clears the found-words log (the game's only
-- working state), clears the ending (common._reset_game), rebuilds the
-- page blobs as create_game writes them, and zeroes the shared timer. The
-- frozen board (faces + word lists) survives. Any game player may call
-- it, mid-game or after the end; a non-player is rejected.

begin;
set search_path = boggle, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(9);

-- ── Coop: find a word, manual-end, then replay → fully reset ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Boggle replay', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select (boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.boggle_board()
)->'data'->>'id')::uuid as id;

-- A find + a manual end → a found row, a non-zero score, an ended game:
-- the state a replay must undo.
select boggle.submit_word((select id from g1), 'cat', 1, false);
select boggle.stop_game((select id from g1));

reset role;
select isnt(
  (select ended_at from common.games where id = (select id from g1)),
  null, 'precondition — the manually stopped game has ended');
-- Age the shared timer so the replay's timer-zeroing is observable.
update common.timers set ticks = 99 where game_id = (select id from g1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select boggle.replay_board((select id from g1));
reset role;

select is(
  (select ended_at from common.games where id = (select id from g1)),
  null, 'replay → ended_at cleared, the game is played again');
select is(
  (select array[game_ended_reason, game_ended_reason_detail, game_ended_outcome,
                game_ended_by_user_id::text]
     from common.games where id = (select id from g1)),
  array[null, null, null, null]::text[], 'replay → the ending''s reason, outcome and who ended it cleared');
select is(
  (select count(*) from boggle.found_words where game_id = (select id from g1)),
  0::bigint, 'replay → the found-words log is cleared');
select is(
  (select game_data->'team'->>'foundWordsScore' from common.games where id = (select id from g1)),
  '0', 'replay → the team''s score in the page blob is back to 0');
select is(
  (select ticks from common.timers where game_id = (select id from g1)),
  0, 'replay → the shared timer is zeroed (a timed game restarts full)');
select is(
  (select board from boggle.games where game_id = (select id from g1)),
  'CATRSEXOTMPLNGDB', 'replay → the frozen board survives (same faces, run it back)');

-- ── Compete: each racer's score is back to zero ───────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.boggle_board()
)->'data'->>'id')::uuid as id;
select boggle.submit_word((select id from g2), 'cat', 1, false);
select boggle.replay_board((select id from g2));
reset role;
select is(
  (select p->>'foundReqdWordsScore'
     from common.games cg, jsonb_array_elements(cg.game_data->'players') p
    where cg.id = (select id from g2) and p->>'id' = 'ada11111-1111-1111-1111-111111111111'),
  '0', 'compete replay → the racer''s score resets to 0');

-- ── Non-player rejected ─────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
-- 42501 = common._require_game_player's 'not-a-player|'.
select pg_temp.envelope_is(
  boggle.replay_board((select id from g1)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot replay the board');

select * from finish();
rollback;
