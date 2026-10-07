-- cs-unmet

-- ============================================================
-- Test: strands.replay_board (restart this board from scratch)
-- ============================================================
-- The "Restart" game-menu item: the SAME board hunted again, with everything
-- the players did wiped. For strands that is more than the log — the whole hint
-- ECONOMY has to go back to zero, or a replay would start with a bar the first
-- attempt filled, or a hint already ringed on the board.
--
-- ending_test asserts what a replay does to an ENDED game (the log emptied,
-- the ending cleared, the solution re-hidden); this is the mid-game path, and
-- the players rows. What a Restart does on the client is
-- `e2e/restart-resets.e2e.ts`'s.

begin;

set search_path = strands, common, public, extensions;

select plan(9);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Strands Replay', array['ada','bea']) as handle;
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;
select pg_temp.strands_hint_words();

create temp table game on commit drop as
select (strands.create_game(
  (select handle from club),
  -- hint_cost 2 so two fixture hint words fill the bar and a hint can be cashed.
  pg_temp.strands_setup((select puzzle_id from fix), 5, 2, 4),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;

-- ── Dirty the game: two hint words, then cash the hint they buy ──
select strands.submit_path((select id from game), pg_temp.strands_prefix_path(0, 4));
select strands.submit_path((select id from game), pg_temp.strands_prefix_path(1, 4));
select strands.spend_hint((select id from game));

-- Preconditions — a replay that "passes" against an already-clean game would
-- prove nothing, so the dirty state is asserted before it's wiped.
reset role;
select isnt(
  (select count(*) from strands.events where game_id = (select id from game)),
  0::bigint,
  'precondition: the log has rows to clear'
);
select is(
  (select n_hints_used from strands.players
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
      and (hint_points <> 0 or n_hints_used <> 0 or active_hint_coords is not null)),
  0::bigint,
  'replay zeroes the hint economy on EVERY player row, not just the caller''s'
);
select is(
  (select count(*) from common.game_players
    where game_id = (select id from game)
      and (solved_at is not null or player_ended_at is not null)),
  0::bigint,
  'replay clears the per-player finish flags'
);

select is(
  (select ended_at from common.games where id = (select id from game)),
  null,
  'replay leaves the game playing'
);

-- ── The board itself is untouched: same puzzle, hunted again ──
select isnt(
  (select board from strands.games where game_id = (select id from game)),
  null,
  'replay keeps the board — a restart re-hunts THIS puzzle, it does not deal a new one'
);

-- ── Access ────────────────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  strands.replay_board((select id from game)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot restart the club''s game');

select * from finish();
rollback;
