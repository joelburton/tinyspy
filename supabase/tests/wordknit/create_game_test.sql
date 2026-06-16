-- ============================================================
-- Test: wordknit.create_game(target_club, setup)
-- ============================================================
--
-- Doubles as the pgTAP primer for the wordknit suite. See
-- ../tinyspy/create_game_test.sql for the deeper primer
-- (personas + as_user, why we begin/rollback).
--
-- Coverage:
--   - rejection: not authenticated
--   - rejection: caller is not a member of the target club
--   - rejection: bad setup.timer shapes (missing, bad kind,
--     missing seconds, out-of-range seconds)
--   - acceptance: timer.kind in {none, countup}
--   - happy path: returns one row, status='in_progress',
--     mistake_count=0, setup persists, board hardcoded with 4
--     categories × 4 tiles each, tile order is a shuffle of all
--     16 tiles, the common.games row is_active=true
--   - The board.categories and board.tileOrder shape is what
--     the FE expects to read directly (FE-knows-the-answer
--     model).

begin;

set search_path = wordknit, common, public, extensions;

select plan(20);

\ir ../_shared/setup.psql

-- ============================================================
-- Set up a club so happy-path assertions have somewhere to land
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('Ada and Bea', array['ada','bea']);

-- ============================================================
-- (1) Unauthenticated callers are rejected
-- ============================================================

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select throws_ok(
  format(
    $$ select wordknit.create_game(%L::uuid, '{"timer":{"kind":"countdown","seconds":600}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  '42501',
  'must be authenticated',
  'create_game: not authenticated raises 42501'
);

-- ============================================================
-- (2) Non-member callers are rejected
-- ============================================================
-- dee is signed in but outside ada+bea's club.

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select wordknit.create_game(%L::uuid, '{"timer":{"kind":"countdown","seconds":600}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  '42501',
  'not a member of this club',
  'create_game: non-member is rejected'
);

-- ============================================================
-- Setup-shape validation
-- ============================================================
-- Missing-vs-bad split so each rejection has its own clean
-- message. The dialog never produces these payloads in
-- practice (the form defaults are valid), but we still want
-- explicit server-side gating per the friends-trust-model
-- principle: validate shape, trust contents.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- timer field missing entirely
select throws_ok(
  format(
    $$ select wordknit.create_game(%L::uuid, '{}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  'P0001',
  'setup.timer is required',
  'create_game: missing setup.timer is rejected'
);

-- timer.kind is bogus
select throws_ok(
  format(
    $$ select wordknit.create_game(%L::uuid, '{"timer":{"kind":"fast"}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  'P0001',
  'setup.timer.kind must be none, countup, or countdown (got fast)',
  'create_game: bogus timer.kind is rejected'
);

-- countdown without seconds
select throws_ok(
  format(
    $$ select wordknit.create_game(%L::uuid, '{"timer":{"kind":"countdown"}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  'P0001',
  'setup.timer.seconds is required for countdown',
  'create_game: countdown without seconds is rejected'
);

-- countdown with 0 seconds (below min)
select throws_ok(
  format(
    $$ select wordknit.create_game(%L::uuid, '{"timer":{"kind":"countdown","seconds":0}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  'P0001',
  'setup.timer.seconds must be 1..3600 (got 0)',
  'create_game: countdown with seconds=0 is rejected'
);

-- countdown with 3601 seconds (above max — Joel's 60-min cap)
select throws_ok(
  format(
    $$ select wordknit.create_game(%L::uuid, '{"timer":{"kind":"countdown","seconds":3601}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  'P0001',
  'setup.timer.seconds must be 1..3600 (got 3601)',
  'create_game: countdown over 60min is rejected'
);

-- 'none' is accepted (no seconds needed)
select lives_ok(
  format(
    $$ select wordknit.create_game(%L::uuid, '{"timer":{"kind":"none"}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  'create_game: timer.kind=none is accepted'
);

-- 'countup' is accepted (no seconds needed)
select lives_ok(
  format(
    $$ select wordknit.create_game(%L::uuid, '{"timer":{"kind":"countup"}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]) $$,
    (select id from club)
  ),
  'create_game: timer.kind=countup is accepted'
);

-- ============================================================
-- (3)–(11) Happy path: ada creates a game
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table created on commit drop as
select * from wordknit.create_game((select id from club), '{"timer":{"kind":"countdown","seconds":600}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]);

select is(
  (select count(*) from created),
  1::bigint,
  'create_game: returns exactly one (id) row'
);

-- Reset to postgres for column reads that don't depend on RLS —
-- the rest of the assertions all check server-side state.
reset role;

select is(
  (select status from wordknit.games where id = (select id from created)),
  'in_progress',
  'create_game: new game starts in in_progress status'
);

select is(
  (select mistake_count from wordknit.games where id = (select id from created)),
  0,
  'create_game: new game starts with mistake_count = 0'
);

-- board.categories is hardcoded with 4 entries. We sample the
-- shape by asserting there are exactly 4 categories with 4
-- tiles each.
select is(
  (select jsonb_array_length(board->'categories')
     from wordknit.games where id = (select id from created)),
  4,
  'create_game: board.categories has exactly 4 categories'
);

select is(
  (
    -- Sum of tiles across all 4 categories should be 16.
    select sum(jsonb_array_length(c->'tiles'))::int
      from wordknit.games gm,
           jsonb_array_elements(gm.board->'categories') c
     where gm.id = (select id from created)
  ),
  16,
  'create_game: board.categories tiles sum to 16'
);

-- tileOrder is a 16-element array. Validates that the FE has the
-- shuffled-display-order field it expects to render from.
select is(
  (select jsonb_array_length(board->'tileOrder')
     from wordknit.games where id = (select id from created)),
  16,
  'create_game: board.tileOrder has 16 entries'
);

-- Sanity check: tileOrder is a permutation of the category
-- tiles. (Walks both sets, sorted, and asserts equality.)
select is(
  (select array(
     select e from
       (select jsonb_array_elements_text(board->'tileOrder') as e
          from wordknit.games where id = (select id from created)) t
      order by e
   )),
  (select array(
     select e from
       (select jsonb_array_elements_text(c->'tiles') as e
          from wordknit.games gm,
               jsonb_array_elements(gm.board->'categories') c
         where gm.id = (select id from created)) t
      order by e
   )),
  'create_game: tileOrder is exactly a permutation of the category tiles'
);

-- setup is persisted as-given on common.games.setup. End-of-game
-- review surfaces (a "this game was played with a 10-minute timer"
-- badge, etc.) read this column.
select is(
  (select setup from common.games where id = (select id from created)),
  '{"timer":{"kind":"countdown","seconds":600}}'::jsonb,
  'create_game: common.games.setup persists the passed-in jsonb'
);

-- This new game is the club's active one (is_active=true). The
-- partial unique index on (club_id) where is_active = true
-- guarantees at most one such row per club, so the bare query
-- without LIMIT 1 is safe.
select is(
  (select id from common.games
    where club_id = (select id from club) and is_active = true),
  (select id from created),
  'create_game: common.games row is the club''s active game'
);

select is(
  (select gametype from common.games
    where club_id = (select id from club) and is_active = true),
  'wordknit',
  'create_game: active common.games row has gametype = wordknit'
);

-- Title = first 4 tiles alphabetically, joined by ", ". For the
-- POC's hardcoded board (A/B/C/D words) this is always the four
-- A-tiles. The rule survives unchanged when real puzzles arrive.
select is(
  (select title from common.games where id = (select id from created)),
  'ALPHA, ANGEL, APPLE, ARROW',
  'create_game: title is first 4 tiles alphabetically (POC board)'
);

-- ============================================================
select * from finish();
rollback;
