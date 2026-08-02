-- ============================================================
-- Test: stackdown.replay_board (restart this stack from scratch)
-- ============================================================
-- The "Replay board" game-menu item. Resets the working state on the SAME
-- game row — the frozen puzzle (tiles / solution / band) stays, everything
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
\ir setup.psql

select plan(14);

-- ── Coop: clear the whole stack, then replay → fully reset ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club1 on commit drop as
select common.create_club('Stackdown rp1', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select * from stackdown.create_game(
  (select handle from club1),
  jsonb_build_object('band', 1, 'timer', jsonb_build_object('kind', 'none')),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);

-- Play the six words in order → coop win. Now there are six submissions, a
-- rewritten title, found_count 6, solved, and a terminal game: the full state
-- a replay must undo. (A hint is taken too, so the cheat log is exercised.)
select stackdown.reveal_next_hint((select id from g1));
select stackdown.submit_word((select id from g1), pg_temp.sd_seq(1));
select stackdown.submit_word((select id from g1), pg_temp.sd_seq(2));
select stackdown.submit_word((select id from g1), pg_temp.sd_seq(3));
select stackdown.submit_word((select id from g1), pg_temp.sd_seq(4));
select stackdown.submit_word((select id from g1), pg_temp.sd_seq(5));
select stackdown.submit_word((select id from g1), pg_temp.sd_seq(6));
reset role;

-- Sanity: we really did reach terminal, and the title carries the solution.
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  true, 'coop: precondition — a cleared stack is terminal');
select isnt(
  (select title from common.games where id = (select id from g1)),
  'New game', 'coop: precondition — the title was rewritten to the cleared words');

-- Age the shared clock so the replay's clock-zeroing is observable.
update common.timers set ticks = 99 where game_id = (select id from g1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select stackdown.replay_board((select id from g1));
reset role;

select is(
  (select play_state from common.games where id = (select id from g1)),
  'playing', 'coop: replay → play_state back to playing');
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  false, 'coop: replay → is_terminal cleared');
select is(
  (select ended_at from common.games where id = (select id from g1)),
  null, 'coop: replay → ended_at cleared');
select is(
  (select (status->>'found_words_count')::int from common.games where id = (select id from g1)),
  0, 'coop: replay → status.found reset to 0');
select is(
  (select title from common.games where id = (select id from g1)),
  'New game', 'coop: replay → the title stops advertising the solution');
select is(
  (select count(*) from stackdown.submissions where game_id = (select id from g1)),
  0::bigint, 'coop: replay → the submission log is cleared (words AND the hint)');
select is(
  (select count(*) from stackdown.players
     where game_id = (select id from g1)
       and found_count = 0 and solved = false and solved_at is null),
  2::bigint, 'coop: replay → both players zeroed + unsolved');
select is(
  (select count(*) from common.game_players
     where game_id = (select id from g1) and result is null and not conceded),
  2::bigint, 'coop: replay → per-player results + concede cleared');
select is(
  (select ticks from common.timers where game_id = (select id from g1)),
  0, 'coop: replay → the shared clock is zeroed (a timed game restarts full)');

-- ── Compete: a concede-terminal game replays clean too ──────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club2 on commit drop as
select common.create_club('Stackdown rp2', array['ada', 'bea']) as handle;
create temp table g2 on commit drop as
select * from stackdown.create_game(
  (select handle from club2),
  jsonb_build_object('band', 1, 'timer', jsonb_build_object('kind', 'none')),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);
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
  (select is_terminal from common.games where id = (select id from g2)),
  false, 'compete: replay → is_terminal cleared');
select is(
  (select count(*) from common.game_players
     where game_id = (select id from g2) and result is null
       and not conceded and conceded_at is null),
  2::bigint, 'compete: replay → results + concede (incl. conceded_at) cleared');

-- ── Non-player rejected ─────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select stackdown.replay_board(%L::uuid) $$, (select id from g1)),
  NULL, NULL, 'a non-player cannot replay the board');

select * from finish();
rollback;
