-- ============================================================
-- Test: ending a waffle game leaves the players' boards alone
-- ============================================================
-- Seeing the answer is a DISPLAY decision, top to bottom: the solution
-- unshields at terminal via the ordinary is_terminal gate, the FE swaps what it
-- DRAWS when a player asks (locally — docs/ui.md → Terminal results), and
-- `waffle.players.board` is never rewritten by any of it.
--
-- That last clause is what this file pins, and it has been false twice over.
-- The mid-game give-up (`waffle.reveal_answer`, removed 2026-08-03) overwrote
-- every board with the solution, which rewrote HISTORY too — the turn-history
-- viewer then replayed swaps against a board nobody had played. Nothing
-- rewrites them now, which is also why hiding the answer again brings back the
-- board the players actually finished with.
--
-- (Named for what it asserts, not for the reveal: as of 2026-08-15 there is no
-- reveal RPC or flag to test. Was reveal_test.sql.)

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(7);

-- ── Coop: reveal from an in-progress game → answer board + neutral terminal ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club1 on commit drop as
select common.create_club('Waffle rv1', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select * from waffle.create_game(
  (select handle from club1), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board()
);
reset role;

-- Precondition: fresh game is in progress, and boards start as the SCRAMBLE
-- (not the solution) — so the reveal has something to change.
select is(
  (select play_state from common.games where id = (select id from g1)),
  'playing', 'coop: precondition — new game is in progress');
select is(
  (select count(*) from waffle.players
     where game_id = (select id from g1) and board = 'bacdef.g.hijklmn.o.pqrstu'),
  2::bigint, 'coop: precondition — both boards start as the scramble');

-- End it for everyone (the manual end any player can fire).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select waffle.end_game((select id from g1));
reset role;

select is(
  (select play_state from common.games where id = (select id from g1)),
  'ended', 'end → neutral ''ended'' terminal');
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  true, 'end → game is terminal');
select is(
  (select count(*) from waffle.players
     where game_id = (select id from g1) and board = 'bacdef.g.hijklmn.o.pqrstu'),
  2::bigint, 'end → the players'' boards are UNTOUCHED (nothing rewrites them)');
select is(
  (select count(*) from common.game_players
     where game_id = (select id from g1) and (result->>'won')::boolean = false),
  2::bigint, 'manual end → nobody won');

-- The solution is readable now (the is_terminal gate lifted) — which is what
-- makes the FE's local swap possible without any server round trip.
select isnt(
  (select solution from waffle.games_state where id = (select id from g1)),
  null, 'terminal → the solution unshields (is_terminal gate)');

select * from finish();
rollback;
