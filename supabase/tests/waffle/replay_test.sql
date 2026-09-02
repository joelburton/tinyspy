-- cs-unmet

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
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(19);

-- ── Coop: solve, then replay → fully reset + un-terminal ────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club1 on commit drop as
select pg_temp.create_club('Waffle rp1', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select (waffle.create_game(
  (select handle from club1), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board()
)->'data'->>'id')::uuid as id;

-- Solve it: the fixture scramble is one swap (cells 0,1) from solved →
-- coop win. Now there's a swap-log row, swaps_used=1, solved=true, and the
-- game is terminal — the full state a replay must undo.
select waffle.submit_swap((select id from g1), 0, 1);

reset role;
-- Sanity: we really did reach terminal + logged a swap before replaying.
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  true, 'coop: precondition — solved game is terminal');
select is(
  (select title from common.games where id = (select id from g1)),
  'ABCDE-AFINQ-CGKOS',
  'coop: precondition — the title was rewritten to the solved words');

-- Age the shared clock (as if a timed game had been running a while) so the
-- replay's clock-zeroing is observable.
update common.timers set ticks = 99 where game_id = (select id from g1);

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
select is(
  (select ticks from common.timers where game_id = (select id from g1)),
  0, 'coop: replay → the shared clock is zeroed (a timed game restarts full)');
-- The title must stop advertising words the players no longer have — a
-- replayed board reads exactly like a freshly created one.
select is(
  (select title from common.games where id = (select id from g1)),
  'New game', 'coop: replay → the title stops advertising the solved words');

-- ── Compete: solve + concede → terminal, then replay resets all ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club2 on commit drop as
select pg_temp.create_club('Waffle rp2', array['ada', 'bea']) as handle;
create temp table g2 on commit drop as
select (waffle.create_game(
  (select handle from club2), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.waffle_board()
)->'data'->>'id')::uuid as id;

-- ada solves her own board; bea concedes → all players done → terminal
-- (ada wins on swaps; bea recorded conceded + a loss).
select waffle.submit_swap((select id from g2), 0, 1);
reset role;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select waffle.concede((select id from g2));
reset role;

-- Compete holds the placeholder for the whole race (its correct words would
-- leak the solution to a trailing racer) and fills in at the terminal reveal.
select is(
  (select title from common.games where id = (select id from g2)),
  'ABCDE-AFINQ-CGKOS',
  'compete: precondition — ending the race names the game after the puzzle');

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
select is(
  (select title from common.games where id = (select id from g2)),
  'New compete', 'compete: replay → the title stops advertising the solution');

-- ── Non-player rejected ─────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  waffle.replay_board((select id from g1)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot replay the board');
reset role;

-- ── A game DELETED out from under the page ──────────────────
-- The reason `replay_board` looks for its own row BEFORE the membership gate,
-- and the one assertion that pins the order. `common.delete_game` is granted to
-- any club member for any game in the club, so this is an ordinary thing to
-- lose a race with — a friend tidying the list while you have the game open.
--
-- It takes waffle.games, common.games and every game_players row together (all
-- cascaded), so a gate-first replay_board would find no membership either and
-- answer "You are not in this game" — true of the rows, false of the player,
-- and no help at all. PN485 says the thing that actually happened.
--
-- **This covers all sixteen games**, not just waffle: they share one raise
-- (`common._raise_game_deleted`) under one code, and `gameDeletedFirst.test.ts`
-- is what checks the other fifteen put it in the same place.
delete from common.games where id = (select id from g1);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  waffle.replay_board((select id from g1)),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'a game deleted under the page says so, rather than disowning the player');
reset role;

select * from finish();
rollback;
