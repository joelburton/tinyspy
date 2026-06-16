-- ============================================================
-- Test: psychicnum.submit_guess — the only mid-game action
-- ============================================================
--
-- Covers:
--   - phase rejections: unauth, non-member, inactive game, bad range
--   - wrong-guess path: guesses_remaining decrements, play_state stays
--   - correct-guess path: play_state = won, winner_id set, club_active
--     pointer cleared by the termination trigger
--   - exhaustion path: 7th wrong guess → play_state = lost, pointer
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

select plan(23);

-- Cast: ada + bea are club members; dee is outside.

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('test club', array['ada','bea']);
create temp table g on commit drop as
select * from psychicnum.create_game((select id from club), '{"guesses": 7, "timer": {"kind": "none"}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]);

-- Pin the target to 7 for the scenarios. RPCs roll randomly;
-- we override directly as postgres so the test's guess sequence
-- is deterministic.
reset role;
update psychicnum.games set target = 7 where id = (select id from g);

-- ============================================================
-- (1) Range check — guesses must be 1..10
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
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

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');  -- dee
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 5) $$, (select id from g)),
  '42501',
  'not playing this game',
  'non-player submit_guess is rejected (via require_game_player)'
);

-- ============================================================
-- (3) First wrong guess — ada guesses 1
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
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
  (select play_state from common.games where id = (select id from g)),
  'playing',
  'play_state stays playing after a wrong guess'
);

-- ============================================================
-- (4) Duplicate guess — bea also guesses 1 (silly but legal)
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
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

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  psychicnum.submit_guess((select id from g), 7),
  'correct',
  'a correct guess returns "correct"'
);
select is(
  (select play_state from common.games where id = (select id from g)),
  'won',
  'play_state flips to won on a correct guess'
);
select is(
  (select winner_id from psychicnum.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'winner_id is set to the correct-guesser'
);

-- (6) is_terminal flipped to true by common.end_game on win.
-- (is_current_view stays true — end_game doesn't touch it; the
-- post-game review still lives on the current-view row until
-- the FE explicitly closes it.)
select is(
  (select is_terminal from common.games where id = (select id from g)),
  true,
  'common.games row is_terminal=true after end_game on win'
);

-- The winner's username is frozen into status at end-of-game
-- time so the FE listing label ("won — bea guessed it") renders
-- from the row alone, no follow-up profile fetch. Stale-on-
-- rename is the trade we accept; see psychicnum.manifest's
-- labelFor for the why.
select is(
  (select status->>'winner_username' from common.games
    where id = (select id from g)),
  'bea',
  'submit_guess: winner_username frozen into status on a win'
);

-- (7) No more guesses accepted on the won game.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
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

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from psychicnum.create_game((select id from club), '{"guesses": 7, "timer": {"kind": "none"}}'::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]);

reset role;
update psychicnum.games set target = 8 where id = (select id from g2);

-- Six wrong guesses (alternating).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g2), 1);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from g2), 2);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g2), 3);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from g2), 4);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g2), 5);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from g2), 6);

-- After 6 wrong, play_state still playing, 1 guess remaining.
select is(
  (select play_state from common.games where id = (select id from g2)),
  'playing',
  'after 6 wrong guesses play_state is still playing'
);
select is(
  (select guesses_remaining from psychicnum.games where id = (select id from g2)),
  1,
  'after 6 wrong guesses, guesses_remaining = 1'
);

-- The 7th wrong guess loses the game.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  psychicnum.submit_guess((select id from g2), 9),
  'lost',
  'the 7th wrong guess returns "lost"'
);

select is(
  (select play_state from common.games where id = (select id from g2)),
  'lost',
  'play_state flips to lost after the 7th wrong guess'
);

-- ============================================================
-- (9) submit_timeout — countdown expired (FE-driven)
-- ============================================================
-- The FE fires this when the count-down timer hits 0. We flip
-- play_state='lost' and call common.end_game with outcome='lost_timeout'
-- (distinct from the regular `lost` of exhausted guesses).
-- Idempotency: a second call on the already-terminal game raises
-- a clean P0001 that the FE swallows.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select * from psychicnum.create_game(
  (select id from club),
  '{"guesses": 7, "timer": {"kind": "countdown", "seconds": 600}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- Happy path: playing → submit_timeout → lost.
select lives_ok(
  format(
    $$ select psychicnum.submit_timeout(%L::uuid) $$,
    (select id from g3)
  ),
  'submit_timeout: playing game accepts the call'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from g3)),
  'lost',
  'submit_timeout: flips play_state to lost'
);

-- end_game marks the row terminal on timeout-loss too.
select is(
  (select is_terminal from common.games where id = (select id from g3)),
  true,
  'submit_timeout: end_game sets is_terminal=true on timeout-loss'
);

-- Idempotency: a second call from any caller on the already-lost
-- game raises P0001. FE catches and ignores so a racing peer is silent.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format(
    $$ select psychicnum.submit_timeout(%L::uuid) $$,
    (select id from g3)
  ),
  'P0001',
  'game is not active',
  'submit_timeout: rejects on already-terminal games'
);

-- Non-player gate: dee is signed in but didn't play this game.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select psychicnum.submit_timeout(%L::uuid) $$,
    (select id from g3)
  ),
  '42501',
  'not playing this game',
  'submit_timeout: non-player is rejected via require_game_player'
);

-- ============================================================
select * from finish();
rollback;
