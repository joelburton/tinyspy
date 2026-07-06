-- ============================================================
-- Test: waffle.replay_board (restart this board from scratch)
-- ============================================================
-- The "Replay board" game-menu item. Resets the working state to the
-- original scramble on the SAME game row — the frozen puzzle stays,
-- everything the players did is wiped. Both modes reset ALL players.
-- Available from a finished game OR mid-game; any game player may call
-- it; a non-player is rejected.

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(13);

-- ── Coop: solve, then replay → fully reset + un-terminal ────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club1 on commit drop as
select common.create_club('Waffle rp1', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select * from waffle.create_game(
  (select handle from club1), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board()
);

-- Solve it: the fixture scramble is one swap (cells 0,1) from solved →
-- coop win. Now there's a swap-log row, swaps_used=1, solved=true, and the
-- game is terminal — the full state a replay must undo.
select waffle.submit_swap((select id from g1), 0, 1);

reset role;
-- Sanity: we really did reach terminal + logged a swap before replaying.
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  true, 'coop: precondition — solved game is terminal');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select waffle.replay_board((select id from g1));
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
  (select (status->>'swaps_used')::int from common.games where id = (select id from g1)),
  0, 'coop: replay → status.swaps_used reset to 0');
select is(
  (select count(*) from waffle.swaps where game_id = (select id from g1)),
  0::bigint, 'coop: replay → the swap log is cleared');
select is(
  (select count(*) from waffle.players
     where game_id = (select id from g1)
       and board = 'bacdef.g.hijklmn.o.pqrstu'
       and swaps_used = 0 and solved = false and solved_at is null),
  2::bigint, 'coop: replay → both players back to the scramble, unsolved');
select is(
  (select count(*) from common.game_players
     where game_id = (select id from g1) and result is null and not conceded),
  2::bigint, 'coop: replay → per-player results + concede cleared');

-- ── Compete: solve + concede → terminal, then replay resets all ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club2 on commit drop as
select common.create_club('Waffle rp2', array['ada', 'bea']) as handle;
create temp table g2 on commit drop as
select * from waffle.create_game(
  (select handle from club2), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.waffle_board()
);

-- ada solves her own board; bea concedes → all players done → terminal
-- (ada wins on swaps; bea recorded conceded + a loss).
select waffle.submit_swap((select id from g2), 0, 1);
reset role;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select waffle.concede((select id from g2));
reset role;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select waffle.replay_board((select id from g2));
reset role;

select is(
  (select is_terminal from common.games where id = (select id from g2)),
  false, 'compete: replay → is_terminal cleared');
select is(
  (select play_state from common.games where id = (select id from g2)),
  'playing', 'compete: replay → play_state back to playing');
select is(
  (select count(*) from waffle.players
     where game_id = (select id from g2)
       and board = 'bacdef.g.hijklmn.o.pqrstu'
       and swaps_used = 0 and solved = false),
  2::bigint, 'compete: replay → every player back to the scramble');
select is(
  (select count(*) from common.game_players
     where game_id = (select id from g2) and result is null
       and not conceded and conceded_at is null),
  2::bigint, 'compete: replay → results + concede (incl. conceded_at) cleared');

-- ── Non-player rejected ─────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select waffle.replay_board(%L::uuid) $$, (select id from g1)),
  NULL, NULL, 'a non-player cannot replay the board');

select * from finish();
rollback;
