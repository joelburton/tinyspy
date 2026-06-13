-- ============================================================
-- Test: lobby RPCs (create_game, join_game)
-- ============================================================
--
-- This is the tutorial file: it explains pgTAP as we go. The other
-- test files in this directory assume you've read this one.
--
-- ------------------------------------------------------------
-- What is pgTAP?
-- ------------------------------------------------------------
-- pgTAP is a Postgres extension that adds TAP-format assertion
-- functions (`ok`, `is`, `throws_ok`, `results_eq`, etc.) to SQL.
-- It's the canonical way to test plpgsql functions in-database —
-- the alternative would be hitting the API from JavaScript, which
-- can't easily inspect internal state.
--
-- Each test file follows this shape:
--
--     begin;                            -- isolate the test
--     create extension if not exists pgtap with schema extensions;
--     set search_path = public, extensions;
--     select plan(N);                   -- declare the assertion count
--     ...assertions...                  -- ok / is / throws_ok / etc.
--     select * from finish();           -- summary; fails if N didn't match
--     rollback;                         -- discard all changes
--
-- The BEGIN/ROLLBACK pair means each test file leaves the database
-- exactly as it found it — no fixtures to clean up.
--
-- ------------------------------------------------------------
-- Simulating an authenticated user
-- ------------------------------------------------------------
-- Our RPCs call `auth.uid()` to identify the caller. `auth.uid()`
-- reads the `sub` claim from `request.jwt.claims`, which PostgREST
-- normally sets per request. In tests we set it ourselves.
--
-- We also switch to the `authenticated` Postgres role so that
-- policies declared `to authenticated` actually match. Without it,
-- RLS rejects everything.
--
-- Both are done by the local helper `pg_temp.as_user(uid)` below.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;
-- Tests target tinyspy's RPCs/tables; `common` is included so cross-schema
-- references to common.profiles resolve unqualified; `public` and
-- `extensions` are kept for gen_random_uuid and pgtap helpers.
set search_path = tinyspy, common, public, extensions;

-- Eight assertions in this file. pgTAP fails the run if this count
-- doesn't match the actual number of assertion calls below.
select plan(8);

-- ============================================================
-- Fixtures
-- ============================================================

-- Insert two fake users directly into auth.users (bypassing the magic-
-- link flow). The handle_new_user trigger fires on insert and creates
-- the matching common.profiles row for each, so game_players FKs will
-- resolve later.

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'alice@test.local',
   now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'bob@test.local',
   now(), now(), now());

-- Helper: "log in as <uid>" for the rest of the transaction.
-- Sets both halves of the auth simulation in one call.
create function pg_temp.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true                              -- local = scope to this transaction
  );
  -- SET LOCAL ROLE doesn't survive across function calls, so use set_config
  -- which does. (The two are equivalent forms of the same underlying
  -- session variable.)
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ============================================================
-- Test 1: create_game requires authentication
-- ============================================================
-- We call create_game with no JWT and expect SQLSTATE 42501
-- ("insufficient_privilege"), which is what the RPC raises when
-- auth.uid() returns null.
--
-- `throws_ok(query, sqlstate, expected_message, description)` is the
-- pgTAP form of "this query should fail with this specific error".
-- (The 3-arg form treats the third arg as the expected message — easy
-- gotcha. Pass the description in the 4-arg slot when you want one.)

-- At top-level SQL we need `select`, not `perform` (the latter is
-- plpgsql-only). Discard the return value with WHERE false.
select set_config('request.jwt.claims', '', true)
     , set_config('role', 'postgres', true)
  where false;

select throws_ok(
  $$ select create_game() $$,
  '42501',
  'must be authenticated',
  'create_game raises 42501 when there is no authenticated user'
);

-- ============================================================
-- Test 2: alice creates a game
-- ============================================================
-- After this, the game state is captured in a temp table so the
-- subsequent assertions can reference it. Temp tables persist
-- across role changes within the same transaction.

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');

create temp table created on commit drop as
select * from create_game();

-- `is(actual, expected, description)` checks equality (with proper
-- null handling — unlike SQL `=` which returns null on null operands).
select is(
  (select count(*) from created),
  1::bigint,
  'create_game returns exactly one (id, join_code) row'
);

-- `isnt(actual, expected, description)` is the inverse.
select isnt(
  (select id from created)::text,
  null,
  'returned game id is non-null'
);

-- `matches(actual, regex, description)` checks a regex match.
-- generate_join_code uses an unambiguous alphabet that excludes O, 0,
-- I, 1, L — so the code is exactly six characters from that set.
select matches(
  (select join_code from created),
  '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$',
  'join_code is six chars from the unambiguous alphabet'
);

-- Alice (the creator) should now occupy seat A.
select is(
  (select seat from game_players
   where game_id = (select id from created)
     and user_id = auth.uid()),
  'A',
  'creator is placed in seat A'
);

-- ============================================================
-- Test 3: bob joins
-- ============================================================

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');

-- join_game returns the game id. We compare against the id alice got.
select is(
  (select join_game((select join_code from created))),
  (select id from created),
  'join_game returns the game id for a new joiner'
);

-- And bob is in seat B.
select is(
  (select seat from game_players
   where game_id = (select id from created)
     and user_id = auth.uid()),
  'B',
  'joiner is placed in seat B'
);

-- ============================================================
-- Test 4: join_game is idempotent for an existing player
-- ============================================================
-- This is the "I refreshed the browser" case: I already have a seat,
-- I shouldn't get an error, I should get my game id back.

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');

select is(
  (select join_game((select join_code from created))),
  (select id from created),
  'join_game is idempotent for an existing player (rejoin)'
);

-- ============================================================
-- Wrap-up
-- ============================================================
-- finish() emits the TAP summary line. Without it, pgTAP would
-- consider the test incomplete and fail the run.

select * from finish();
rollback;
