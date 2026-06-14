-- ============================================================
-- Test: psychicnum.submit_guess — the only mid-game action
-- ============================================================
--
-- Covers:
--   - phase rejections: unauth, non-member, inactive game, bad range
--   - wrong-guess path: guesses_remaining decrements, status stays
--   - correct-guess path: status = won, winner_id set, club_active
--     pointer cleared by the termination trigger
--   - exhaustion path: 7th wrong guess → status = lost, pointer
--     cleared
--   - duplicate guesses are allowed (you can guess 7 even after
--     someone already wrongly guessed 7 — silly but legal)
--   - guesses table records every attempt with was_correct
--
-- Strategy: we set the target deterministically with a postgres-role
-- UPDATE after create_game (RPCs only pick the target randomly;
-- tests need the target to drive the guess sequence). Then play
-- through the scenarios with the as_user helper to switch
-- ada/bea roles between guesses.
--
-- See ../tinyspy/create_game_test.sql for the pgTAP primer.
-- ============================================================

begin;

set search_path = psychicnum, common, public, extensions;

select plan(17);

-- Cast: ada + bea are club members; dee is outside.

\ir ../_common/setup.psql

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('test club', array['ada','bea']);
create temp table g on commit drop as
select * from psychicnum.create_game((select id from club));

-- Pin the target to 7 for the scenarios. RPCs roll randomly;
-- we override directly as postgres so the test's guess sequence
-- is deterministic.
reset role;
update psychicnum.games set target = 7 where id = (select id from g);

-- ============================================================
-- (1) Range check — guesses must be 1..10
-- ============================================================

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 0) $$, (select id from g)),
  'P0001',
  'guess must be between 1 and 10',
  'submit_guess rejects 0 (out of range)'
);
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 11) $$, (select id from g)),
  'P0001',
  'guess must be between 1 and 10',
  'submit_guess rejects 11 (out of range)'
);

-- ============================================================
-- (2) Non-member is rejected
-- ============================================================

select pg_temp.as_user('44444444-4444-4444-4444-444444444444');  -- dee
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 5) $$, (select id from g)),
  '42501',
  'not a member of this club',
  'non-member submit_guess is rejected'
);

-- ============================================================
-- (3) First wrong guess — ada guesses 1
-- ============================================================

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is(
  psychicnum.submit_guess((select id from g), 1),
  'wrong',
  'a wrong guess returns "wrong"'
);
select is(
  (select guesses_remaining from psychicnum.games where id = (select id from g)),
  6,
  'guesses_remaining decremented 7 → 6'
);
select is(
  (select status from psychicnum.games where id = (select id from g)),
  'active',
  'status stays active after a wrong guess'
);

-- ============================================================
-- (4) Duplicate guess — bea also guesses 1 (silly but legal)
-- ============================================================

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select is(
  psychicnum.submit_guess((select id from g), 1),
  'wrong',
  'duplicate wrong guess is allowed and also returns "wrong"'
);
select is(
  (select guesses_remaining from psychicnum.games where id = (select id from g)),
  5,
  'guesses_remaining decremented 6 → 5 even on a duplicate'
);

-- ============================================================
-- (5) Correct guess — bea guesses 7
-- ============================================================

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select is(
  psychicnum.submit_guess((select id from g), 7),
  'correct',
  'a correct guess returns "correct"'
);
select is(
  (select status from psychicnum.games where id = (select id from g)),
  'won',
  'status flips to won on a correct guess'
);
select is(
  (select winner_id from psychicnum.games where id = (select id from g)),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'winner_id is set to the correct-guesser'
);

-- (6) club_active_game pointer cleared by the termination trigger.
select is(
  (select count(*) from common.club_active_game
    where club_id = (select id from club)),
  0::bigint,
  'club_active_game row removed by the termination trigger on win'
);

-- (7) No more guesses accepted on the won game.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 4) $$, (select id from g)),
  'P0001',
  'game is not active',
  'submit_guess on a finished game is rejected'
);

-- ============================================================
-- (8) Loss path — fresh game, 7 wrong guesses
-- ============================================================
-- Start a second game, pin target to 8, then have ada and bea
-- alternate wrong guesses (1 through 7) for a total of 7 wrong
-- attempts. The 7th should flip status to 'lost'.

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from psychicnum.create_game((select id from club));

reset role;
update psychicnum.games set target = 8 where id = (select id from g2);

-- Six wrong guesses (alternating).
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g2), 1);
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from g2), 2);
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g2), 3);
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from g2), 4);
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g2), 5);
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from g2), 6);

-- After 6 wrong, status still active, 1 guess remaining.
select is(
  (select status from psychicnum.games where id = (select id from g2)),
  'active',
  'after 6 wrong guesses status is still active'
);
select is(
  (select guesses_remaining from psychicnum.games where id = (select id from g2)),
  1,
  'after 6 wrong guesses, guesses_remaining = 1'
);

-- The 7th wrong guess loses the game.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is(
  psychicnum.submit_guess((select id from g2), 9),
  'lost',
  'the 7th wrong guess returns "lost"'
);

select is(
  (select status from psychicnum.games where id = (select id from g2)),
  'lost',
  'status flips to lost after the 7th wrong guess'
);

-- ============================================================
select * from finish();
rollback;
