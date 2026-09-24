-- cs-blessed-codenamesduet

-- ============================================================
-- Test: row-level security boundaries
-- ============================================================
--
-- The single highest-value security check: a user outside the game's
-- club must not be able to see anything about it, and must not be
-- able to write to its state through any path.
--
-- Three users:
--   ada + bea — play a game together
--   dee       — signed in, but outside the club
--
-- For dee, we check:
--   - SELECTs on every game-scoped table return zero rows
--   - RPCs that mutate the game answer not-ok
--   - direct INSERTs to game tables are refused
--
-- And one positive check: ada (a player) CAN see the games row.
-- Without it, "dee returns 0 rows" wouldn't actually prove RLS is
-- doing anything — it could just be that there's nothing to see.
--
-- See `create_game_test.sql` for the pgTAP primer.
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(7);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- Set up a game in progress that dee is not part of
-- ============================================================

-- ada creates a 2-member club (ada+bea) — dee is signed in
-- but outside it. RLS will hide game rows from dee since she's
-- neither a player nor a member of the club.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada','bea']) as handle;
create temp table g on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;
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
-- Visibility is club-wide: every policy gates on
-- is_club_member(club_handle), which is false for her, hiding the row
-- entirely (no error, empty result — the standard RLS behavior).
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

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
  (select count(*) from events where game_id = (select id from g)),
  0::bigint,
  'dee cannot SELECT events for a club she is not in'
);

-- ============================================================
-- Dee's mutating RPCs are refused.
-- ============================================================
-- The RPCs use common.require_game_player as the auth gate.
-- Since dee isn't in common.game_players for this game, she's rejected there —
-- a FAULT, because create_game seats every player and the FE knows the roster,
-- so a caller without a seat is a broken client rather than a lost race.

select pg_temp.envelope_is(
  submit_clue((select id from g), 'X', 1),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'dee cannot call submit_clue on a game she didn''t play'
);

select pg_temp.envelope_is(
  submit_guess((select id from g), 0),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'dee cannot call submit_guess on a game she didn''t play'
);

-- ============================================================
-- Dee can't write directly to game tables either.
-- ============================================================
-- This is defense-in-depth: supabase/sql/codenamesduet.sql only `grant
-- select`s to the authenticated role on every game table — no
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
