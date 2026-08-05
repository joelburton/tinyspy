-- ============================================================
-- Test: strands.replay_board (restart this board from scratch)
-- ============================================================
-- The "Restart" game-menu item: the SAME board hunted again, with everything
-- the players did wiped. For strands that is more than the log — the whole hint
-- ECONOMY has to go back to zero, or a replay would start with a bar the first
-- attempt filled, or a hint already ringed on the board.
--
-- This file exists because the economy reset had no coverage at all:
-- terminal_test asserts what a replay does to a TERMINAL game (the log emptied,
-- the game un-terminalled, the solution re-hidden), and those assertions stay
-- there because that is terminal_test's subject and the fixture it already
-- builds. What was missing is this — the mid-game path, and the players rows.
--
-- What this canNOT see: the 2026-08-05 Restart bugs were CLIENT-side (state
-- that outlives the reset because the play surface never unmounts), so pgTAP
-- was green throughout. `e2e/restart-resets.e2e.ts` covers that half.

begin;

set search_path = strands, common, public, extensions;

select plan(9);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Strands Replay', array['ada','bea']) as handle;
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;
select pg_temp.strands_hint_words();

create temp table game on commit drop as
select id from strands.create_game(
  (select handle from club),
  -- hint_cost 2 so two fixture hint words fill the bar and a hint can be cashed.
  pg_temp.strands_setup((select puzzle_id from fix), 5, 2, 4),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');

-- ── Dirty the game: two valid words, then cash the hint they buy ──
select strands.submit_path((select id from game), pg_temp.strands_prefix_path(0, 4));
select strands.submit_path((select id from game), pg_temp.strands_prefix_path(1, 4));
select strands.spend_hint((select id from game));

-- Preconditions — a replay that "passes" against an already-clean game would
-- prove nothing, so the dirty state is asserted before it's wiped.
--
-- `reset role` for the reads: `hint_points` and `active_hint_coords` are NOT in
-- the column grant to `authenticated` (they're a rival's private state, reached
-- only through the players_state view), so asserting on the base table has to be
-- done as superuser. That the raw read is denied is the shield working.
reset role;
select isnt(
  (select count(*) from strands.events where game_id = (select id from game)),
  0::bigint,
  'precondition: the log has rows to clear'
);
select is(
  (select hints_spent from strands.players
    where game_id = (select id from game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1,
  'precondition: a hint has been cashed'
);
select isnt(
  (select active_hint_coords from strands.players
    where game_id = (select id from game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  null,
  'precondition: a hint is showing on the board'
);

-- ── Replay ────────────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select strands.replay_board((select id from game));
reset role;

select is(
  (select count(*) from strands.events where game_id = (select id from game)),
  0::bigint,
  'replay clears the event log — guesses, found words and spent hints alike'
);

-- The economy, per player. COOP shares the pool, so BOTH rows must be zeroed:
-- resetting only the caller's would leave a teammate holding the first
-- attempt's progress.
select is(
  (select count(*) from strands.players
    where game_id = (select id from game)
      and (hint_points <> 0 or hints_spent <> 0 or active_hint_coords is not null)),
  0::bigint,
  'replay zeroes the hint economy on EVERY player row, not just the caller''s'
);
select is(
  (select count(*) from strands.players
    where game_id = (select id from game) and (solved or solved_at is not null)),
  0::bigint,
  'replay clears the per-player finish flags'
);

select is(
  (select play_state from common.games where id = (select id from game)),
  'playing',
  'replay leaves the game playing'
);

-- ── The board itself is untouched: same puzzle, hunted again ──
select isnt(
  (select board from strands.games where id = (select id from game)),
  null,
  'replay keeps the board — a restart re-hunts THIS puzzle, it does not deal a new one'
);

-- ── Access ────────────────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select strands.replay_board(%L) $$, (select id from game)),
  '42501',
  'not playing this game',
  'a non-player cannot restart the club''s game'
);

select * from finish();
rollback;
