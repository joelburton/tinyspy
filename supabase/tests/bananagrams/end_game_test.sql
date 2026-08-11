-- ============================================================
-- Test: bananagrams.end_game(target_game)
-- ============================================================
-- The whole-table manual stop — the uniform neutral terminal every other
-- gametype has, added to bananagrams in the 2026-08-01 status-line pass.
--
-- It is NOT concede's twin, and the difference is the point: conceding is a
-- real LOSS for the conceder while everyone else races on, and it takes every
-- player doing it to close a game the group has simply lost interest in.
-- end_game is the table agreeing there's no result — nobody wins, nobody
-- loses, one click.
--
-- Covers:
--   1. Any player may end a live game → play_state 'ended', terminal,
--      status.outcome 'manual', EVERY player {"won": false}
--   2. A player who had already conceded stays conceded (their own quit is
--      still theirs) but is likewise recorded not-won
--   3. Idempotency: ending an already-terminal game raises P0001
--   4. Non-players are rejected
-- ============================================================

begin;

set search_path = bananagrams, common, public, extensions;

select plan(9);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea']) as handle;

create temp table g1 on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- ─── (1) Either player can stop the table ────────────────────
-- bea, not the creator: End is a group action, not the starter's privilege.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format($$ select bananagrams.end_game(%L::uuid) $$, (select id from g1)),
  'any game player may end the game');

reset role;
select is(
  (select play_state from common.games where id = (select id from g1)),
  'ended', 'play_state is the uniform neutral "ended"');
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  true, 'the game is terminal');
select is(
  (select status->>'outcome' from common.games where id = (select id from g1)),
  'manual', 'status.outcome is manual');
-- Nobody wins a manual end — not even the player with the fullest board.
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g1) and (result->>'won')::boolean = false),
  2::bigint, 'every player is recorded {"won": false} — there is no winner');

-- ─── (2) Idempotent ──────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select bananagrams.end_game(%L::uuid) $$, (select id from g1)),
  'P0001', 'game-not-in-play|',
  'ending an already-terminal game is rejected');

-- ─── (3) A conceded player stays conceded ────────────────────
-- Ending the table says nothing about the quit that came before it.
create temp table g2 on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
);
select bananagrams.concede((select id from g2));   -- ada drops out; bea races on
reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'playing', 'precondition — one concede does not end the race');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select bananagrams.end_game((select id from g2));
reset role;
select is(
  (select conceded from common.game_players
    where game_id = (select id from g2) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'the earlier conceder is still flagged conceded');

-- ─── (4) Non-player rejected ─────────────────────────────────
create temp table g3 on commit drop as
select * from bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 144, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid]
);
-- The temp table is owned by the creating role; dee reads it inside the
-- throws_ok argument, so grant it (same as the other suites' fixtures).
reset role;
grant select on g3 to authenticated;
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select bananagrams.end_game(%L::uuid) $$, (select id from g3)),
  '42501', null, 'a non-player cannot end the game');

select * from finish();
rollback;
