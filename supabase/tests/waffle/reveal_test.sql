-- ============================================================
-- Test: waffle's half of the terminal reveal
-- ============================================================
-- The mid-game give-up (`waffle.reveal_answer`) was removed 2026-08-03 —
-- waffle now works like every other game: End the game, THEN Reveal, where
-- Reveal is the common `common.reveal_solution` (covered by
-- common/reveal_solution_test.sql). What's waffle-SPECIFIC, and what this file
-- pins, is that revealing is now purely a DISPLAY decision:
--
--   - the solution unshields at terminal via the ordinary is_terminal gate;
--   - the players' BOARDS are left exactly as they built them. The old give-up
--     overwrote every `waffle.players.board` with the solution, which also
--     rewrote history — the turn-history viewer replayed swaps against a board
--     nobody had played. Nothing rewrites them now; the FE swaps what it DRAWS.

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(9);

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

-- End it for everyone (the manual end any player can fire), then ask.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select waffle.end_game((select id from g1));
select common.reveal_solution((select id from g1));
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
  2::bigint, 'reveal → the players'' boards are UNTOUCHED (display-only)');
select is(
  (select solution_revealed from common.games where id = (select id from g1)),
  true, 'reveal → the shared solution_revealed flag is set');
select is(
  (select count(*) from common.game_players
     where game_id = (select id from g1) and (result->>'won')::boolean = false),
  2::bigint, 'manual end → nobody won');

-- ── Idempotent: a second ask (or a peer's) is a no-op, not an error ──
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format($$ select common.reveal_solution(%L::uuid) $$, (select id from g1)),
  'a second reveal is a no-op');
reset role;

-- ── Non-player rejected ─────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select common.reveal_solution(%L::uuid) $$, (select id from g1)),
  '42501', 'not playing this game',
  'a non-player cannot reveal the answer');
reset role;

select * from finish();
rollback;
