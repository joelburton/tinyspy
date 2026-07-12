-- ============================================================
-- Test: wordiply terminal transitions (end_game / submit_timeout /
--        replay_board / concede)
-- ============================================================
--
-- Covers the non-submit terminal paths (submit_guess's own auto-terminal is
-- in gameplay_test / winner_test):
--   1. Coop end_game → ended/manual with the team scores in status.
--   2. Coop submit_timeout → ended/timeout.
--   3. replay_board wipes guesses, un-terminals the row, reseeds status.
--   4. Concede (compete): the caller is flagged conceded; the last racer's
--      concede ends the game as a collective loss.
--
-- Guesses are synthetic strings containing 'ar', longer than the base
-- (trusting-commit). max_word_length 7 → length_score(7)=100.

begin;

set search_path = wordiply, common, public, extensions;

select plan(15);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;

-- ============================================================
-- (1) Coop end_game → ended/manual + team scores
-- ============================================================

create temp table end_g on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
);

-- Two guesses (longest 7) so end_game captures a real live aggregate.
select wordiply.submit_guess((select id from end_g), 'arxxxxx');  -- 7
select wordiply.submit_guess((select id from end_g), 'arxx');     -- 4

select wordiply.end_game((select id from end_g));

reset role;
select is(
  (select play_state from common.games where id = (select id from end_g)),
  'ended',
  'coop end_game: play_state flips to "ended"'
);

select is(
  (select status->>'outcome' from common.games where id = (select id from end_g)),
  'manual',
  'coop end_game: status.outcome = "manual"'
);

select is(
  (select (status->>'length_score')::int from common.games where id = (select id from end_g)),
  100,
  'coop end_game: status.length_score = team longest (7) / max (7) = 100'
);

select is(
  (select (status->>'letter_count')::int from common.games where id = (select id from end_g)),
  11,                                       -- 7 + 4
  'coop end_game: status.letter_count = sum of the team''s guess lengths'
);

select is(
  (select (status->>'guesses_used')::int from common.games where id = (select id from end_g)),
  2,
  'coop end_game: status.guesses_used = the team''s live count'
);

-- Idempotency: a second call raises P0001 (FE swallows it).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select wordiply.end_game(%L::uuid) $$, (select id from end_g)),
  'P0001',
  'game is not in progress',
  'coop end_game: a second call raises P0001'
);

-- ============================================================
-- (2) Coop submit_timeout → ended/timeout
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table to_g on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup_timed(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
);
select wordiply.submit_guess((select id from to_g), 'arxxx');   -- 5
select wordiply.submit_timeout((select id from to_g));

reset role;
select is(
  (select play_state from common.games where id = (select id from to_g)),
  'ended',
  'coop submit_timeout: play_state flips to "ended"'
);

select is(
  (select status->>'outcome' from common.games where id = (select id from to_g)),
  'timeout',
  'coop submit_timeout: status.outcome = "timeout"'
);

-- ============================================================
-- (3) replay_board wipes guesses, un-terminals, reseeds status
-- ============================================================
-- Reuse end_g (terminal, has 2 guesses). Replay must clear the guesses log,
-- flip back to playing, and reseed the zeroed coop status.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordiply.replay_board((select id from end_g));

reset role;
select is(
  (select play_state from common.games where id = (select id from end_g)),
  'playing',
  'replay_board: play_state back to "playing"'
);

select is(
  (select count(*) from wordiply.guesses where game_id = (select id from end_g)),
  0::bigint,
  'replay_board: the guesses log is wiped'
);

select is(
  (select (status->>'guesses_used')::int from common.games where id = (select id from end_g)),
  0,
  'replay_board: status reseeded to the zeroed coop shape (guesses_used = 0)'
);

-- The frozen board survives (same base — run it back).
select is(
  (select base from wordiply.games where id = (select id from end_g)),
  'ar',
  'replay_board: the frozen board survives (same base)'
);

-- ============================================================
-- (4) Concede (compete): flag set; last racer's concede ends the game
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table con_g on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordiply_board()
);

-- ada concedes → flagged, game continues (bea still races).
select wordiply.concede((select id from con_g));
reset role;
select is(
  (
    select conceded from common.game_players
     where game_id = (select id from con_g)
       and user_id = 'ada11111-1111-1111-1111-111111111111'
  ),
  true,
  'concede: the conceder is flagged conceded'
);
select is(
  (select is_terminal from common.games where id = (select id from con_g)),
  false,
  'concede: the game continues while bea still races'
);

-- bea (the last racer) concedes → the game ends as a collective loss.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.concede((select id from con_g));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select is_terminal from common.games where id = (select id from con_g)),
  true,
  'concede: the last racer conceding ends the game'
);

-- ============================================================
select * from finish();
rollback;
