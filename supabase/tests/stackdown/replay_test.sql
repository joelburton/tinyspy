-- cs-unmet

-- ============================================================
-- Test: stackdown.replay_board (restart this stack from scratch)
-- ============================================================
-- The "Replay board" game-menu item. Resets the working state on the SAME
-- game row — the frozen puzzle (tiles / solution) stays, everything
-- the players did is wiped. Both modes reset ALL players. Available from a
-- finished game OR mid-game; any game player may call it; a non-player is
-- rejected.
--
-- The stackdown-specific bit worth pinning: the club-list TITLE goes back to
-- 'New game'. Coop rewrites it to the cleared words as it plays, so without
-- the reset a replayed game would advertise the previous run's words — and in
-- a game whose whole point is a hidden solution, that spoils the board it
-- just reset.

begin;

set search_path = stackdown, common, public, extensions;

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(14);

-- ── Coop: clear the whole stack, then replay → fully reset ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club1 on commit drop as
select pg_temp.create_club('Stackdown rp1', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select (stackdown.create_game(
  (select handle from club1),
  jsonb_build_object('band', 1, 'timer', jsonb_build_object('kind', 'none')),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;

-- Play the six words in order → coop win. Now there are six submissions, a
-- rewritten title, n_found_words 6, every player solved, and an ended game: the
-- full state a replay must undo. (A hint is taken too, so the cheat log is
-- exercised.)
select stackdown.reveal_next_hint((select id from g1));
select stackdown.submit_word((select id from g1), pg_temp.sd_seq(1));
select stackdown.submit_word((select id from g1), pg_temp.sd_seq(2));
select stackdown.submit_word((select id from g1), pg_temp.sd_seq(3));
select stackdown.submit_word((select id from g1), pg_temp.sd_seq(4));
select stackdown.submit_word((select id from g1), pg_temp.sd_seq(5));
select stackdown.submit_word((select id from g1), pg_temp.sd_seq(6));
reset role;

-- Sanity: the game really did end, and the title carries the solution.
select isnt(
  (select ended_at from common.games where id = (select id from g1)),
  null, 'coop: precondition — a cleared stack has ended the game');
select isnt(
  (select title from common.games where id = (select id from g1)),
  'New game', 'coop: precondition — the title was rewritten to the cleared words');

-- Age the shared clock so the replay's clock-zeroing is observable.
update common.timers set ticks = 99 where game_id = (select id from g1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select stackdown.replay_board((select id from g1));
reset role;

select is(
  (select ended_at from common.games where id = (select id from g1)),
  null, 'coop: replay → ended_at cleared, the game is played again');
select is(
  (select array[game_ended_reason, game_ended_reason_detail, game_ended_outcome,
                game_ended_by_user_id::text]
     from common.games where id = (select id from g1)),
  array[null, null, null, null]::text[], 'coop: replay → the ending''s reason, outcome and who ended it cleared');
select is(
  (select restart_count from common.games where id = (select id from g1)),
  1, 'coop: replay → restart_count up by one');
select is(
  (select (clubpage_info->>'found_words_count')::int from common.games where id = (select id from g1)),
  0, 'coop: replay → the club line''s found_words_count reset to 0');
select is(
  (select title from common.games where id = (select id from g1)),
  'New game', 'coop: replay → the title stops advertising the solution');
select is(
  (select count(*) from stackdown.events where game_id = (select id from g1)),
  0::bigint, 'coop: replay → the submission log is cleared (words AND the hint)');
select is(
  (select count(*) from stackdown.players
     where game_id = (select id from g1)
       and n_found_words = 0),
  2::bigint, 'coop: replay → both players zeroed');
select is(
  (select count(*) from common.game_players
     where game_id = (select id from g1)
       and player_ended_at is null and final_ranking is null and outcome is null
       and solved_at is null),
  2::bigint, 'coop: replay → per-player endings, results and solves cleared');
select is(
  (select ticks from common.timers where game_id = (select id from g1)),
  0, 'coop: replay → the shared clock is zeroed (a timed game restarts full)');

-- ── Compete: a game ended by concessions replays clean too ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club2 on commit drop as
select pg_temp.create_club('Stackdown rp2', array['ada', 'bea']) as handle;
create temp table g2 on commit drop as
select (stackdown.create_game(
  (select handle from club2),
  jsonb_build_object('band', 1, 'timer', jsonb_build_object('kind', 'none')),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;
-- Both concede → the last one out ends it as a collective loss.
select stackdown.submit_word((select id from g2), pg_temp.sd_seq(1));
select stackdown.concede((select id from g2));
reset role;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select stackdown.concede((select id from g2));
reset role;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select stackdown.replay_board((select id from g2));
reset role;

select is(
  (select ended_at from common.games where id = (select id from g2)),
  null, 'compete: replay → ended_at cleared');
select is(
  (select count(*) from common.game_players
     where game_id = (select id from g2)
       and player_ended_at is null and player_ended_reason is null
       and final_ranking is null and outcome is null),
  2::bigint, 'compete: replay → results and the concessions cleared');

-- ── Non-player rejected ─────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
-- 42501 = common._require_game_player's 'not-a-player|'.
select pg_temp.envelope_is(
  stackdown.replay_board((select id from g1)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot replay the board');

select * from finish();
rollback;
