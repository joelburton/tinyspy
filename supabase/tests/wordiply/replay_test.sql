-- cs-unmet

-- ============================================================
-- Test: wordiply.replay_board (restart this board from scratch)
-- ============================================================
-- The "Replay board" game-menu item / the ended game's RestartButton.
-- Clears the events log (the game's only working state), and
-- common._reset_game undoes the ending: ended_at and the reason pair, each
-- player's ending, ranking and outcome, the shared clock; restart_count goes
-- up. The statuses are rewritten at zero. The frozen board (base +
-- max_word_length + the word lists) survives. Any game player may call it,
-- mid-game or after the end; a non-player is rejected.
--
-- OVERLAP WITH terminal_test §3, on purpose: that file replays a coop
-- game as one of its ending paths (ended_at / guesses wiped /
-- guesses_used / base). This file is the dedicated replay suite every
-- other replay game has, and carries what §3 doesn't reach — the COMPETE
-- branch (a racer's ending and ranking undone), restart_count, the shared
-- clock, that the ended-only scores don't survive into the fresh
-- statuses, and the non-player gate.
--
-- All guesses are synthetic strings that satisfy the two free rules
-- (contain 'ar', longer than it) — wordiply is trusting-commit, so
-- they need not be real words. See setup.psql.

begin;
set search_path = wordiply, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(16);

-- ── Coop: guess, Stop, then replay → fully reset ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wire replay', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select (wordiply.create_game(
  (select handle from club), pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;

-- Two guesses (7 and 5 letters) + a Stop → event rows, non-zero statuses,
-- and an ended game: exactly what replay undoes.
select wordiply.submit_guess((select id from g1), 'arxxxxx');
select wordiply.submit_guess((select id from g1), 'arxxx');
select wordiply.stop_game((select id from g1));

reset role;
select isnt(
  (select ended_at from common.games where id = (select id from g1)),
  null, 'precondition — the stopped game has ended');
select is(
  (select count(*) from wordiply.events where game_id = (select id from g1)),
  2::bigint, 'precondition — the two guesses were recorded');
-- Age the shared clock so the replay's clock-zeroing is observable.
update common.timers set ticks = 99 where game_id = (select id from g1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordiply.replay_board((select id from g1)),
  '{"type":"ok","data":{"result":"replayed"}}'::jsonb,
  'replay_board answers replayed');
reset role;

select is(
  (select ended_at from common.games where id = (select id from g1)),
  null, 'replay → ended_at cleared: the game is playing');
select is(
  (select array[game_ended_reason, game_ended_reason_detail, game_ended_outcome,
                game_ended_by_user_id::text]
     from common.games where id = (select id from g1)),
  array[null, null, null, null]::text[], 'replay → the ending is cleared');
select is(
  (select restart_count from common.games where id = (select id from g1)),
  1, 'replay → restart_count goes up');
select is(
  (select count(*) from wordiply.events where game_id = (select id from g1)),
  0::bigint, 'replay → the events log is cleared');
select is(
  (select clubpage_info->>'guesses_used' from common.games where id = (select id from g1)),
  '0', 'replay → clubpage_info.guesses_used reset to 0');
-- The ended-only scores (length score, letter count) are written once the
-- game has ended; the rewritten statuses must not carry them forward, or a
-- replayed board opens showing the PRIOR attempt's result.
select is(
  (select clubpage_info->'length_score' from common.games where id = (select id from g1)),
  'null'::jsonb,
  'replay → the ended-only scores are null again, not carried forward');
select is(
  (select ticks from common.timers where game_id = (select id from g1)),
  0, 'replay → the shared clock is zeroed (a timed game restarts full)');
select is(
  (select base || ':' || max_word_length
     from wordiply.games where game_id = (select id from g1)),
  'ar:7', 'replay → the frozen board survives (same base, run it back)');

-- ── Compete: a racer's ending and the ranking are undone ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id;
-- ada plays all five (ending her own race); bea concedes, which ends the
-- race with ada ranked first.
select wordiply.submit_guess((select id from g2), 'arxxxxx');
select wordiply.submit_guess((select id from g2), 'arxxxx');
select wordiply.submit_guess((select id from g2), 'arxxx');
select wordiply.submit_guess((select id from g2), 'arxx');
select wordiply.submit_guess((select id from g2), 'arx');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.concede((select id from g2));
reset role;
select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from g2)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won', 'precondition — the race ended with ada ranked first');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.replay_board((select id from g2));
reset role;
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g2)
      and (player_ended_at is not null or player_ended_reason is not null
           or final_ranking is not null or outcome is not null)),
  0::bigint,
  'compete replay → every player''s ending, ranking and outcome are cleared');
select ok(
  (select bool_and((player_status->>'guesses_used')::int = 0
                   and player_status->'player_ended_reason' = 'null'::jsonb)
     from common.game_players where game_id = (select id from g2)),
  'compete replay → every player_status is back to 0 guesses used, not ended');
select is(
  (select clubpage_info->'winner_user_id' from common.games where id = (select id from g2)),
  'null'::jsonb,
  'compete replay → the winner is gone from clubpage_info');

-- ── Non-player rejected ─────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  wordiply.replay_board((select id from g1)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot replay the board');

select * from finish();
rollback;
