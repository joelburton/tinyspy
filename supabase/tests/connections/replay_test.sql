-- ============================================================
-- Test: connections.replay_board (restart this puzzle from scratch)
-- ============================================================
-- The "Replay board" menu item / terminal-row Restart. Resets the working
-- state on the SAME game row — the frozen `board` (categories AND this game's
-- shuffled tileOrder) stays, so it's the same sixteen tiles in the same
-- arrangement solved again, and everything the players did is wiped. Both
-- modes reset ALL players. Available from a finished game OR mid-game; any
-- game player may call it; a non-player is rejected.
--
-- The load-bearing detail: deleting the guess log is ALSO what un-matches the
-- categories. A matched category IS a `result='correct'` guess row (there's no
-- separate "solved" column), so clearing the log rebuilds the board by
-- construction — that's why this test asserts on the guesses count rather than
-- some matched flag.

begin;

set search_path = connections, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql
\ir setup.psql

-- ── Coop: four mistakes → lost, then replay → fully reset ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Conn rp', array['ada','bea']) as handle;
create temp table puzzle on commit drop as
select pg_temp.connections_puzzle() as id;
create temp table g1 on commit drop as
select * from connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop'
);

-- One correct category, then four wrong → out of mistakes → coop loss. That
-- leaves five guess rows, a matched category, mistake_count 4 and a terminal
-- game: the full state a replay must undo.
select connections.submit_guess((select id from g1),
  array['ALPHA','ANGEL','APPLE','ARROW']::text[], 'correct', 0);
select connections.submit_guess((select id from g1),
  array['BANANA','BIRCH','BREAD','CASTLE']::text[], 'wrong', null);
select connections.submit_guess((select id from g1),
  array['BANANA','BIRCH','BREAD','CIRCLE']::text[], 'wrong', null);
select connections.submit_guess((select id from g1),
  array['BANANA','BIRCH','BREAD','CLOUD']::text[], 'wrong', null);
select connections.submit_guess((select id from g1),
  array['BANANA','BIRCH','BREAD','CROWN']::text[], 'wrong', null);
reset role;

select ok((select is_terminal from common.games where id = (select id from g1)),
  'coop: precondition — four mistakes ended the game');
select is((select count(*) from connections.guesses where game_id = (select id from g1)),
  5::bigint, 'coop: precondition — five guesses are logged (one correct)');

update common.timers set ticks = 99 where game_id = (select id from g1);
-- Snapshot the frozen puzzle so the assertion below is a real before/after.
create temp table b1 on commit drop as
select board from connections.games where id = (select id from g1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.replay_board((select id from g1));
reset role;

select is((select play_state from common.games where id = (select id from g1)),
  'playing', 'coop: replay → play_state back to playing');
select ok((select not is_terminal from common.games where id = (select id from g1)),
  'coop: replay → is_terminal cleared');
select is((select count(*) from connections.guesses where game_id = (select id from g1)),
  0::bigint, 'coop: replay → the guess log is cleared (so no category is matched)');
select is(
  (select count(*) from connections.players
    where game_id = (select id from g1) and mistake_count = 0 and matched_count = 0),
  2::bigint, 'coop: replay → both players back to zero mistakes + zero matches');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g1) and result is null and not conceded),
  2::bigint, 'coop: replay → per-player results + concede cleared');
select is((select ticks from common.timers where game_id = (select id from g1)),
  0, 'coop: replay → the shared clock is zeroed');
-- The frozen puzzle is untouched: same tiles, same shuffle.
select is(
  (select board from connections.games where id = (select id from g1)),
  (select board from b1),
  'coop: replay → the board (categories + tileOrder) is left alone');

-- ── Compete: a conceded-terminal game replays clean ─────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete'
);
select connections.concede((select id from g2));
reset role;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select connections.concede((select id from g2));
reset role;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.replay_board((select id from g2));
reset role;

select ok((select not is_terminal from common.games where id = (select id from g2)),
  'compete: replay → is_terminal cleared');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g2) and result is null
      and not conceded and conceded_at is null),
  2::bigint, 'compete: replay → results + concede (incl. conceded_at) cleared');

-- ── Non-player rejected ─────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
-- 42501 = common.require_game_player's 'not playing this game'.
select throws_ok(
  format($$ select connections.replay_board(%L::uuid) $$, (select id from g1)),
  '42501', NULL, 'a non-player cannot replay the board');

select * from finish();
rollback;
