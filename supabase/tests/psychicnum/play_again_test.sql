-- ============================================================
-- Test: psychicnum.play_again
-- ============================================================
--
-- Mirrors the tinyspy play_again contract:
--   - rejects if the previous game is still active
--   - rejects if the caller isn't a club member
--   - creates a fresh game in the same club, sets it as active
--   - is idempotent: a second caller from the same prev_game
--     gets back the same successor id (no duplicate games)
--
-- See ../tinyspy/create_game_test.sql for the pgTAP primer.
-- ============================================================

begin;

set search_path = psychicnum, common, public, extensions;

select plan(7);

-- Cast: ada + bea are club members; dee is outside.

\ir ../_shared/setup.psql

-- ============================================================
-- Set up a finished game so play_again has something to act on
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('test club', array['ada','bea']);
create temp table prev on commit drop as
select * from psychicnum.create_game((select id from club));

-- (1) While the game is still active, play_again rejects.
select throws_ok(
  format($$ select psychicnum.play_again(%L::uuid) $$, (select id from prev)),
  'P0001',
  'previous game has not ended',
  'play_again rejects while the previous game is still active'
);

-- End the game: pin target to 5, ada guesses 5.
reset role;
update psychicnum.games set target = 5 where id = (select id from prev);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from prev), 5);

-- ============================================================
-- play_again, take 1: ada creates the successor
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table next on commit drop as
select * from psychicnum.play_again((select id from prev));

select is(
  (select count(*) from next),
  1::bigint,
  'play_again returns one (id) row'
);

select is(
  (select next_game_id from psychicnum.games where id = (select id from prev)),
  (select id from next),
  'previous game now points to its successor via next_game_id'
);

-- ============================================================
-- play_again, take 2: bea's idempotent call from the same prev
-- ============================================================
-- Whichever player clicks first creates; a later caller from the
-- same prev_game gets back the same id.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
create temp table bob_result on commit drop as
select * from psychicnum.play_again((select id from prev));

select is(
  (select id from bob_result),
  (select id from next),
  'play_again is idempotent — second caller gets the same successor id'
);

-- ============================================================
-- Successor sanity + club_active pointer
-- ============================================================

reset role;
select is(
  (select status from psychicnum.games where id = (select id from next)),
  'active',
  'successor game starts in active state'
);

select is(
  (select game_id from common.club_active_game
    where club_id = (select id from club)),
  (select id from next),
  'play_again upserts club_active_game to point at the successor'
);

-- ============================================================
-- (Dee) — non-member is rejected
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select psychicnum.play_again(%L::uuid) $$, (select id from prev)),
  '42501',
  'not a member of this club',
  'play_again rejects a non-member'
);

-- ============================================================
select * from finish();
rollback;
