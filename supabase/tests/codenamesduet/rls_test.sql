-- ============================================================
-- Test: row-level security boundaries
-- ============================================================
--
-- The single highest-value security check: a user who is not in a
-- game must not be able to see anything about it, and must not be
-- able to write to its state through any path.
--
-- Three users:
--   ada + bea — play a game together
--   dee       — signed in, but outside the game
--
-- For dee, we check:
--   - SELECTs on every game-scoped table return zero rows
--   - RPCs that mutate the game throw
--   - direct INSERTs to game tables are blocked by RLS
--
-- And one positive check: ada (a player) CAN see the games row.
-- Without it, "dee returns 0 rows" wouldn't actually prove RLS is
-- doing anything — it could just be that there's nothing to see.
--
-- See `create_game_test.sql` for the pgTAP primer.
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(8);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up a game in progress that dee is not part of
-- ============================================================

-- ada creates a 2-member club (ada+bea) — dee is signed in
-- but outside it. RLS will hide game rows from dee since she's
-- neither a player nor a member of the club.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada','bea']) as handle;
create temp table g on commit drop as
select * from codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players());
select submit_clue((select id from g), 'TOOLS', 2);

-- ============================================================
-- Positive baseline: ada CAN see the game
-- ============================================================
-- This sanity check matters — without it, "dee sees zero rows"
-- could just mean no data exists, not that RLS is filtering.

select is(
  (select count(*) from games where id = (select id from g)),
  1::bigint,
  'sanity: ada (a player) sees her own game'
);

-- ============================================================
-- Dee's SELECTs against game-scoped tables must return zero rows.
-- The `is_player_in_game(game_id)` helper used by the RLS policies
-- evaluates false for her, hiding the row entirely (no error,
-- empty result — the standard RLS behavior).
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

-- RLS shape changed: visibility is now club-wide (not
-- player-restricted). Dee is a non-club-member, so she sees nothing
-- from codenamesduet.games / codenamesduet.words / codenamesduet.clues — gated by
-- is_club_member(club_handle), which fails for her.
select is(
  (select count(*) from games where id = (select id from g)),
  0::bigint,
  'dee cannot SELECT a games row for a club she is not in'
);

select is(
  (select count(*) from words where game_id = (select id from g)),
  0::bigint,
  'dee cannot SELECT words for a club she is not in'
);

select is(
  (select count(*) from clues where game_id = (select id from g)),
  0::bigint,
  'dee cannot SELECT clues for a club she is not in'
);

select is(
  (select count(*) from guesses where game_id = (select id from g)),
  0::bigint,
  'dee cannot SELECT guesses for a club she is not in'
);

-- ============================================================
-- Dee's mutating RPCs must throw.
-- ============================================================
-- The RPCs use common.require_game_player as the auth gate.
-- Since dee isn't in common.game_players for this game, she's
-- rejected with 'not playing this game' — different reject path
-- than the old "not a player in this game" message that came
-- from the per-game is_player_in_game helper (now retired).

select throws_ok(
  $$ select submit_clue((select id from g), 'X', 1) $$,
  '42501',
  'not playing this game',
  'dee cannot call submit_clue on a game she didn''t play'
);

select throws_ok(
  $$ select submit_guess((select id from g), 0) $$,
  '42501',
  'not playing this game',
  'dee cannot call submit_guess on a game she didn''t play'
);

-- ============================================================
-- Dee can't write directly to game tables either.
-- ============================================================
-- This is defense-in-depth: the baseline migration only `grant
-- select` to the authenticated role on every game table — no
-- INSERT/UPDATE/DELETE grants. PostgreSQL blocks the write at
-- the grant layer ("permission denied") *before* RLS even gets
-- to evaluate it. The RLS policies are still there as a second
-- guard, but the missing grant is what trips first.
--
-- Net effect either way: all writes have to go through the
-- security-definer RPCs.

select throws_ok(
  $$ insert into words (game_id, position, word)
     values ((select id from g), 0, 'BOGUS') $$,
  '42501',
  'permission denied for table words',
  'direct INSERT into words is blocked (no grant on authenticated)'
);

-- ============================================================
select * from finish();
rollback;
