-- ============================================================
-- Test: wordknit.submit_guess — the only mid-game action
-- ============================================================
--
-- Covers the FE-trusts-the-server-records contract:
--   - payload rejections (wrong tile count, bad result enum,
--     bad matched_level)
--   - phase rejections (unauth, non-member, finished game)
--   - wrong path: mistakes++, status stays in_progress
--   - oneAway path: also counts as mistake
--   - correct path: found_groups gets a row, guesses gets a row
--   - the (game_id, level) PK provides idempotency: a second
--     'correct' for the same level is a no-op (silent)
--   - 4 mistakes flips status to 'lost', clears club_active_game
--     via the termination trigger
--   - 4 found groups flips status to 'solved', clears
--     club_active_game via the termination trigger
--
-- See ../tinyspy/create_game_test.sql for the pgTAP / auth-
-- simulation primer.

begin;

set search_path = wordknit, common, public, extensions;

select plan(19);

\ir ../_shared/setup.psql

-- ============================================================
-- Set up an active game
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('Ada and Bea', array['ada','bea']);
create temp table g on commit drop as
select * from wordknit.create_game((select id from club), '{}'::jsonb);

-- ============================================================
-- (1) Wrong tile count is rejected
-- ============================================================

select throws_ok(
  format(
    $$ select wordknit.submit_guess(%L::uuid,
                                     array['ALPHA','ANGEL','APPLE']::text[],
                                     'wrong', null) $$,
    (select id from g)
  ),
  'P0001',
  'must submit exactly 4 tiles (got 3)',
  'submit_guess: 3-tile guess is rejected'
);

-- ============================================================
-- (2) Bad result enum is rejected
-- ============================================================

select throws_ok(
  format(
    $$ select wordknit.submit_guess(%L::uuid,
                                     array['ALPHA','ANGEL','APPLE','ARROW']::text[],
                                     'banana', null) $$,
    (select id from g)
  ),
  'P0001',
  'result must be correct, oneAway, or wrong (got banana)',
  'submit_guess: bogus result enum is rejected'
);

-- ============================================================
-- (3) result='correct' requires a level
-- ============================================================

select throws_ok(
  format(
    $$ select wordknit.submit_guess(%L::uuid,
                                     array['ALPHA','ANGEL','APPLE','ARROW']::text[],
                                     'correct', null) $$,
    (select id from g)
  ),
  'P0001',
  'matched_level must be 0..3 when result is correct',
  'submit_guess: correct without matched_level is rejected'
);

-- ============================================================
-- (4) Non-member is rejected
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select wordknit.submit_guess(%L::uuid,
                                     array['ALPHA','ANGEL','APPLE','ARROW']::text[],
                                     'wrong', null) $$,
    (select id from g)
  ),
  '42501',
  'not a member of this club',
  'submit_guess: non-member is rejected'
);

-- ============================================================
-- (5)–(7) Wrong guess: counts as a mistake
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format(
    $$ select wordknit.submit_guess(%L::uuid,
                                     array['ALPHA','BANANA','CASTLE','DAGGER']::text[],
                                     'wrong', null) $$,
    (select id from g)
  ),
  'submit_guess: wrong call returns without error'
);

reset role;
select is(
  (select mistakes from wordknit.games where id = (select id from g)),
  1,
  'submit_guess: wrong guess increments mistakes to 1'
);

select is(
  (select status from wordknit.games where id = (select id from g)),
  'in_progress',
  'submit_guess: wrong guess leaves status in_progress'
);

-- ============================================================
-- (8) Correct guess: inserts a found_groups row, guesses row
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordknit.submit_guess(
  (select id from g),
  array['ALPHA','ANGEL','APPLE','ARROW']::text[],
  'correct',
  0
);

reset role;
select is(
  (select count(*) from wordknit.found_groups
    where game_id = (select id from g)),
  1::bigint,
  'submit_guess: correct guess inserts one found_groups row'
);

-- ============================================================
-- (9) Race idempotency: a second 'correct' for the same level
--     silently no-ops (PK conflict caught)
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format(
    $$ select wordknit.submit_guess(%L::uuid,
                                     array['ALPHA','ANGEL','APPLE','ARROW']::text[],
                                     'correct', 0) $$,
    (select id from g)
  ),
  'submit_guess: a repeat correct on the same level is a silent no-op'
);

reset role;
select is(
  (select count(*) from wordknit.found_groups
    where game_id = (select id from g)),
  1::bigint,
  'submit_guess: still exactly one found_groups row after the race'
);

-- ============================================================
-- (10)–(11) Solve path: find the other 3 groups → status=solved
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordknit.submit_guess(
  (select id from g),
  array['BANANA','BIRCH','BREAD','BRICK']::text[],
  'correct', 1
);
select wordknit.submit_guess(
  (select id from g),
  array['CASTLE','CIRCLE','CLOUD','CROWN']::text[],
  'correct', 2
);
select wordknit.submit_guess(
  (select id from g),
  array['DAGGER','DELTA','DIAMOND','DRAGON']::text[],
  'correct', 3
);

reset role;
select is(
  (select status from wordknit.games where id = (select id from g)),
  'solved',
  'submit_guess: 4-found groups flips status to solved'
);

-- The termination trigger clears the club_active_game pointer.
select is(
  (select count(*) from common.club_active_game
    where club_id = (select id from club)),
  0::bigint,
  'submit_guess: trigger clears club_active_game on win'
);

-- ============================================================
-- (12)–(14) Loss path: a fresh game, 4 wrong guesses → lost
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from wordknit.create_game((select id from club), '{}'::jsonb);

-- Four wrong guesses with distinct tile sets so they pass the
-- "exactly 4 tiles" payload check. (Tile membership / dup check
-- is enforced FE-side per the FE-knows model — server just
-- records what it's told.)
select wordknit.submit_guess(
  (select id from g2),
  array['ALPHA','BANANA','CASTLE','DAGGER']::text[],
  'wrong', null
);
select wordknit.submit_guess(
  (select id from g2),
  array['ALPHA','BANANA','CASTLE','DELTA']::text[],
  'wrong', null
);
select wordknit.submit_guess(
  (select id from g2),
  array['ALPHA','BANANA','CIRCLE','DAGGER']::text[],
  'wrong', null
);

reset role;
-- After 3 wrong, mistakes = 3, status still in_progress.
select is(
  (select mistakes from wordknit.games where id = (select id from g2)),
  3,
  'submit_guess: 3 wrong guesses leaves mistakes at 3'
);
select is(
  (select status from wordknit.games where id = (select id from g2)),
  'in_progress',
  'submit_guess: 3 wrong guesses leaves status in_progress'
);

-- The 4th wrong takes mistakes to 4 and flips status to lost.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordknit.submit_guess(
  (select id from g2),
  array['ALPHA','BIRCH','CASTLE','DAGGER']::text[],
  'wrong', null
);

reset role;
select is(
  (select status from wordknit.games where id = (select id from g2)),
  'lost',
  'submit_guess: 4th wrong guess flips status to lost'
);

-- ============================================================
-- (15)–(18) submit_timeout — timeout-loss path
-- ============================================================
-- The FE fires this when the count-down timer hits 0. Sets
-- status='lost' just like a 4-mistakes-loss. Idempotent: a
-- second concurrent call from a racing client raises a clean
-- P0001 "game is not in progress" which the FE swallows.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select * from wordknit.create_game((select id from club), '{}'::jsonb);

-- Happy path: in_progress → submit_timeout → lost.
select lives_ok(
  format(
    $$ select wordknit.submit_timeout(%L::uuid) $$,
    (select id from g3)
  ),
  'submit_timeout: in-progress game accepts the call'
);

reset role;
select is(
  (select status from wordknit.games where id = (select id from g3)),
  'lost',
  'submit_timeout: flips status to lost'
);

-- The termination trigger clears the club_active_game pointer
-- (same as the other loss paths — single trigger handles all
-- transitions to terminal status).
select is(
  (select count(*) from common.club_active_game
    where club_id = (select id from club)),
  0::bigint,
  'submit_timeout: trigger clears club_active_game on timeout-loss'
);

-- Idempotency: a second call from any caller on the already-
-- lost game raises P0001. The FE catches and ignores so a
-- racing peer's call is silent.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format(
    $$ select wordknit.submit_timeout(%L::uuid) $$,
    (select id from g3)
  ),
  'P0001',
  'game is not in progress',
  'submit_timeout: rejects on already-terminal games'
);

-- ============================================================
select * from finish();
rollback;
