-- ============================================================
-- Test: waffle.reveal_answer (give up — show the solution, end the game)
-- ============================================================
-- The "Reveal answer" game-menu item. Fills every player's board with the
-- SOLUTION and ends the game as a neutral give-up (nobody wins). Only valid
-- while the game is in progress; any game player may call it; a second call
-- (game already terminal) and a non-player are both rejected.

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

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select waffle.reveal_answer((select id from g1));
reset role;

select is(
  (select play_state from common.games where id = (select id from g1)),
  'ended', 'coop: reveal → neutral ''ended'' terminal');
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  true, 'coop: reveal → game is terminal');
select is(
  (select count(*) from waffle.players
     where game_id = (select id from g1) and board = 'abcdef.g.hijklmn.o.pqrstu'),
  2::bigint, 'coop: reveal → every board becomes the solution');
select is(
  (select status->>'outcome' from common.games where id = (select id from g1)),
  'revealed', 'coop: reveal → status.outcome tagged ''revealed''');
select is(
  (select count(*) from common.game_players
     where game_id = (select id from g1) and (result->>'won')::boolean = false),
  2::bigint, 'coop: reveal → nobody won');

-- ── Idempotency: revealing an already-finished game is rejected ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select waffle.reveal_answer(%L::uuid) $$, (select id from g1)),
  NULL, NULL, 'reveal on a finished game is rejected (idempotent guard)');
reset role;

-- ── Non-player rejected ─────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select waffle.reveal_answer(%L::uuid) $$, (select id from g1)),
  NULL, NULL, 'a non-player cannot reveal the answer');
reset role;

select * from finish();
rollback;
