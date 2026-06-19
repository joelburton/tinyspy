-- ============================================================
-- Test: wordknit.club_game_status view
-- ============================================================
--
-- The view powers the calendar widget in the setup form. For each
-- club's wordknit games, it returns `(game_id, club_handle, play_state,
-- is_terminal, nyt_date)` so the FE can color a calendar square
-- by status: won (green), lost (red), or in-progress (yellow).
--
-- Properties to pin:
--   1. shape — returns the five columns named
--   2. RLS — a club member sees their own rows; a non-member
--      sees zero. Inherited from the underlying wordknit.games
--      + common.games RLS via security_invoker.
--   3. NULL-nyt_date puzzles are filtered out (the view is for a
--      DATE-anchored calendar; undated puzzles have no square to
--      color).
--   4. is_terminal + play_state propagate from common.games.
--
-- See ../tinyspy/create_game_test.sql for the pgTAP primer.

begin;

set search_path = wordknit, common, public, extensions;

select plan(8);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up: ada+bea's club, one game in progress on the fixture
-- puzzle (which has nyt_date='1900-01-01').
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

create temp table puzzle on commit drop as
select pg_temp.wordknit_puzzle() as id;

create temp table g on commit drop as
select * from wordknit.create_game(
  (select handle from club),
  pg_temp.wordknit_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop'
);

-- ============================================================
-- (1) Shape: the view returns the five expected columns
-- ============================================================
-- A real test reads from it and checks each column's value.

select is(
  (select club_handle from wordknit.club_game_status
    where game_id = (select id from g)),
  (select handle from club),
  'club_game_status: club_handle propagates from common.games'
);

select is(
  (select nyt_date::text from wordknit.club_game_status
    where game_id = (select id from g)),
  '1900-01-01',
  'club_game_status: nyt_date propagates from wordknit.puzzles'
);

-- New game starts in 'playing' (non-terminal). The view should
-- carry that state straight through.
select is(
  (select play_state from wordknit.club_game_status
    where game_id = (select id from g)),
  'playing',
  'club_game_status: play_state propagates from common.games'
);

select is(
  (select is_terminal from wordknit.club_game_status
    where game_id = (select id from g)),
  false,
  'club_game_status: is_terminal propagates from common.games'
);

-- ============================================================
-- (2) Terminal-state propagation
-- ============================================================
-- End the game with play_state='solved'; the view should reflect
-- both fields on the next read.

reset role;
select set_config('request.jwt.claims', '', true);

select common.end_game(
  (select id from g),
  'solved',
  '{"outcome": "solved", "matched_count": 4, "mistake_count": 0}'::jsonb,
  format(
    '{"%s": {"won": true}, "%s": {"won": true}}',
    'ada11111-1111-1111-1111-111111111111',
    'bea22222-2222-2222-2222-222222222222'
  )::jsonb
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select play_state from wordknit.club_game_status
    where game_id = (select id from g)),
  'solved',
  'club_game_status: terminal play_state is visible after end_game'
);

select is(
  (select is_terminal from wordknit.club_game_status
    where game_id = (select id from g)),
  true,
  'club_game_status: is_terminal flips to true after end_game'
);

-- ============================================================
-- (3) RLS — dee (non-member) sees zero rows
-- ============================================================
-- security_invoker=true on the view, plus underlying RLS on
-- both wordknit.games and common.games, both gating on club
-- membership. The view inherits both.

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

select is(
  (select count(*)::int from wordknit.club_game_status
    where club_handle = (select handle from club)),
  0,
  'club_game_status: non-member sees zero rows (RLS via underlying tables)'
);

-- ============================================================
-- (4) NULL-nyt_date puzzles are excluded
-- ============================================================
-- The view's WHERE clause includes `nyt_date is not null`.
-- Insert a second puzzle with NULL date, create a game using
-- it, and verify the view doesn't surface the row.
--
-- (Inserting + creating as postgres bypasses RLS for this test-
-- only setup. The point of the test is the view's filter, not
-- the auth path; the auth path is covered in (3).)

reset role;
select set_config('request.jwt.claims', '', true);

-- Insert directly as postgres (the import-script uses
-- service_role, which is fine here too — we just need a row).
insert into wordknit.puzzles (source_id, nyt_date, categories) values (
  'TEST-NULL-DATE',
  null,
  $cats$[
    {"rank":0,"name":"x","tiles":["A1","A2","A3","A4"]},
    {"rank":1,"name":"y","tiles":["B1","B2","B3","B4"]},
    {"rank":2,"name":"z","tiles":["C1","C2","C3","C4"]},
    {"rank":3,"name":"w","tiles":["D1","D2","D3","D4"]}
  ]$cats$::jsonb
);

-- Use create_game to make a game from the null-dated puzzle.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from wordknit.create_game(
  (select handle from club),
  pg_temp.wordknit_setup(
    (select id from wordknit.puzzles where source_id = 'TEST-NULL-DATE')
  ),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop'
);

select is(
  (select count(*)::int from wordknit.club_game_status
    where game_id = (select id from g2)),
  0,
  'club_game_status: rows whose puzzle has nyt_date IS NULL are excluded from the calendar view'
);

-- ============================================================
select * from finish();
rollback;
