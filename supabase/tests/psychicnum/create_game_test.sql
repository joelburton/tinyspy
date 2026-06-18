-- ============================================================
-- Test: psychicnum.create_game(target_club, setup)
-- ============================================================
--
-- Doubles as the pgTAP primer for the psychicnum test suite.
-- See ../tinyspy/create_game_test.sql for the deeper primer
-- (fixture setup, the as_user helper, why we wrap in begin/rollback).
--
-- What we check here:
--   1. unauthenticated callers rejected (42501)
--   2. non-member callers rejected (42501)
--   3. setup validation: out-of-range guesses, missing guesses
--   4. happy path: returns a game id, picks a target in 1..10,
--      sets guesses_remaining = setup.guesses, play_state = 'playing'
--   5. setup column persists the player's choice (for end-of-
--      game review)
--   6. guesses_remaining is initialized from setup.guesses (a
--      non-default test value pins the linkage)
--   7. the call upserts common.club_active_game pointing at it
--   8. a second create in the same club replaces (auto-pauses)
--      the first
--   9. the `target` column is NOT visible to authenticated SELECT
-- ============================================================

begin;

set search_path = psychicnum, common, public, extensions;

select plan(24);

\ir ../_shared/setup.psql

-- ============================================================
-- (1) Unauthenticated callers are rejected
-- ============================================================
-- Clearing request.jwt.claims makes auth.uid() return null inside
-- the RPC body, which trips the "must be authenticated" guard.
-- We set role=postgres for the call itself so that grant-layer
-- enforcement (the function is granted to `authenticated`, not
-- `postgres`) doesn't trip first — we want to land inside the
-- function body and see its own guard.

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select throws_ok(
  $$ select psychicnum.create_game(
       '00000000-0000-0000-0000-000000000000'::uuid,
       '{"guesses": 7, "timer": {"kind": "none"}}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid]
     ) $$,
  '42501',
  'must be authenticated',
  'unauthenticated create_game is rejected'
);

-- ============================================================
-- Build a club for the happy-path tests
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('test club', array['ada','bea']);

-- ============================================================
-- (2) Non-member callers are rejected
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');  -- dee, outsider
select throws_ok(
  format(
    $$ select psychicnum.create_game(%L::uuid, '{"guesses": 7, "timer": {"kind": "none"}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  '42501',
  'not a member of this club',
  'non-member create_game is rejected'
);

-- ============================================================
-- (3) Config validation
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select throws_ok(
  format(
    $$ select psychicnum.create_game(%L::uuid, '{"guesses": 4, "timer": {"kind": "none"}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  'P0001',
  'setup.guesses must be 3, 5, 7, or 9 (got 4)',
  'create_game: setup.guesses outside {3,5,7,9} is rejected'
);

select throws_ok(
  format(
    $$ select psychicnum.create_game(%L::uuid, '{}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  'P0001',
  'setup.guesses is required',
  'create_game: missing setup.guesses is rejected'
);

-- ============================================================
-- (3.5) Timer shape validation (via common.validate_timer)
-- ============================================================
-- The shared validator's full case grid is exercised in
-- wordknit's create_game_test. Here we only spot-check that this
-- gametype's create_game actually wires the helper up — one
-- missing-timer, one bad-kind, one missing-seconds, one
-- countup-accepted. The point is "the call is hooked up," not
-- "re-test every branch of validate_timer."

select throws_ok(
  format(
    $$ select psychicnum.create_game(%L::uuid, '{"guesses": 7}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  'P0001',
  'setup.timer is required',
  'create_game: missing setup.timer is rejected'
);

select throws_ok(
  format(
    $$ select psychicnum.create_game(%L::uuid, '{"guesses": 7, "timer": {"kind": "fast"}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  'P0001',
  'setup.timer.kind must be none, countup, or countdown (got fast)',
  'create_game: bogus timer.kind is rejected'
);

select throws_ok(
  format(
    $$ select psychicnum.create_game(%L::uuid, '{"guesses": 7, "timer": {"kind": "countdown"}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  'P0001',
  'setup.timer.seconds is required for countdown',
  'create_game: countdown without seconds is rejected'
);

select throws_ok(
  format(
    $$ select psychicnum.create_game(%L::uuid, '{"guesses": 7, "timer": {"kind": "countdown", "seconds": 0}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  'P0001',
  'setup.timer.seconds must be 1..3600 (got 0)',
  'create_game: countdown with seconds=0 is rejected'
);

select lives_ok(
  format(
    $$ select psychicnum.create_game(%L::uuid, '{"guesses": 7, "timer": {"kind": "countup"}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  'create_game: timer.kind=countup is accepted (no seconds needed)'
);

-- ============================================================
-- (4) Happy path — ada creates a game with the default-ish 7
-- ============================================================

create temp table g on commit drop as
select * from psychicnum.create_game(
  (select id from club),
  '{"guesses": 7, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]
);

select is(
  (select count(*) from g),
  1::bigint,
  'create_game returns one (id) row'
);

-- Reset to postgres to read the `target` column for assertions —
-- authenticated callers can't see target (verified in test 11
-- below). The other column reads are fine either way.
reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'playing',
  'newly-created game has play_state = playing'
);
select is(
  (select guesses_remaining from psychicnum.games where id = (select id from g)),
  7,
  'newly-created game starts with 7 guesses remaining (setup-driven)'
);
select ok(
  (select target between 1 and 10 from psychicnum.games where id = (select id from g)),
  'target is in the 1..10 range'
);

-- (5) common.games.is_current_view=true for this game, gametype 'psychicnum'.
select is(
  (select id from common.games
    where club_id = (select id from club) and is_current_view = true),
  (select id from g),
  'common.games row for this game has is_current_view=true'
);
select is(
  (select gametype from common.games
    where club_id = (select id from club) and is_current_view = true),
  'psychicnum',
  'current-view common.games row has gametype = psychicnum'
);

-- Title = the target number as text (psychicnum is a toy game,
-- target IS revealed via title — by design; the column-level
-- grant on psychicnum.games.target stays for educational value).
select is(
  (select title::int between 1 and 10 from common.games
    where id = (select id from g)),
  true,
  'create_game: title is the target as text (1..10)'
);

-- ============================================================
-- (6) A second create in the same club auto-pauses the first
-- ============================================================
-- The partial unique index on (club_id) where is_current_view=true
-- forces common.create_game to clear the prior current-view row before
-- inserting the new one. The first game's common.games.play_state
-- stays 'playing' — "suspended" is purely a derived club-level
-- state (is_current_view=false AND ended_at IS NULL).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from psychicnum.create_game(
  (select id from club),
  '{"guesses": 7, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]
);

select is(
  (select id from common.games
    where club_id = (select id from club) and is_current_view = true),
  (select id from g2),
  'second create_game: new game is the club''s current-view one'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'playing',
  'first game still has play_state = playing (paused is a club-level state, not a row state)'
);

-- ============================================================
-- (7) Config column persists + guesses_remaining is linked to it
-- ============================================================
-- Use a non-default value (5) so the assertion proves the link
-- (without varying, "guesses_remaining = 7" could just be the
-- old hardcoded default leaking through). setup column also
-- captures the original intent for end-of-game review.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select * from psychicnum.create_game(
  (select id from club),
  '{"guesses": 5, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]
);

reset role;
select is(
  (select guesses_remaining from psychicnum.games where id = (select id from g3)),
  5,
  'guesses_remaining is initialized from setup.guesses'
);
select is(
  (select setup->>'guesses' from common.games where id = (select id from g3)),
  '5',
  'setup column persists the starting guesses value'
);

-- ============================================================
-- (8) target is hidden from authenticated SELECT
-- ============================================================
-- The column-level grant on psychicnum.games includes id, club_id,
-- guesses_remaining, winner_id, created_at — but NOT target.
-- (Play state now lives on common.games, not here.) Selecting target
-- as the authenticated role should raise SQLSTATE 42501
-- ("permission denied for column").

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select target from psychicnum.games where id = %L $$, (select id from g)),
  '42501',
  null,  -- the exact message includes the column name; just match the code
  'authenticated SELECT of target column is denied (column-level grant)'
);

-- ============================================================
-- (9) Saved-defaults auto-save in clubs_gametypes
-- ============================================================
-- psychicnum saves the whole setup ({guesses, timer}) — every
-- field is a per-club preference. Verify both fields round-trip
-- through clubs_gametypes.default_setup.
--
-- Looked up by the FE's setup dialog on open and merged under
-- the manifest's static defaults — so the next dialog seeds
-- with the same guesses-budget and timer the friends picked.
--
-- The third happy-path call (`g`, with guesses=5) is the most
-- recent successful create for this club + gametype, so its
-- setup is what's saved. (RLS-wise we read as postgres to
-- bypass the test-club lookup; the contract is at the m2m
-- level, not on the read side.)

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select (default_setup->>'guesses')::int from common.clubs_gametypes
    where club_id = (select id from club) and gametype = 'psychicnum'),
  5,
  'saved defaults: psychicnum saves guesses verbatim'
);

select is(
  (select default_setup->'timer'->>'kind' from common.clubs_gametypes
    where club_id = (select id from club) and gametype = 'psychicnum'),
  'none',
  'saved defaults: psychicnum saves timer.kind verbatim'
);

-- ============================================================
-- Player-count upper bound: 7+ entries rejected with P0001
-- ============================================================
-- Mirrors the [1, 6] cap declared on src/psychicnum/manifest.ts.
-- The count check fires before any membership check, so 5 random
-- UUIDs alongside ada+bea is enough to trip it without needing a
-- 7-member club.

select throws_ok(
  format(
    $$ select psychicnum.create_game(%L::uuid,
                                     '{"guesses": 7, "timer": {"kind": "none"}}'::jsonb,
                                     array[
                                       'ada11111-1111-1111-1111-111111111111'::uuid,
                                       'bea22222-2222-2222-2222-222222222222'::uuid,
                                       gen_random_uuid(),
                                       gen_random_uuid(),
                                       gen_random_uuid(),
                                       gen_random_uuid(),
                                       gen_random_uuid()
                                     ]) $$,
    (select id from club)
  ),
  'P0001',
  null,
  'create_game: rejects player_user_ids with > 6 entries (max 6)'
);

-- ============================================================
select * from finish();
rollback;
