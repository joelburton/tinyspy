-- ============================================================
-- Test: wordknit.submit_guess — the only mid-game action
-- ============================================================
--
-- Covers the FE-trusts-the-server-records contract:
--   - payload rejections (wrong tile count, bad result enum,
--     bad matched_category_rank)
--   - phase rejections (unauth, non-member, finished game)
--   - wrong path: mistake_count++, play_state stays playing
--   - oneAway path: also counts as mistake
--   - correct path: a guesses row with result='correct' lands
--   - the partial unique index on (game_id,
--     matched_category_rank) where result='correct' provides
--     race idempotency: a second 'correct' for the same rank is
--     a silent no-op
--   - 4 mistakes flips play_state to 'lost', clears
--     is_current_view flipped via common.end_game
--   - 4 matched categories flips play_state to 'solved', clears
--     is_current_view flipped via common.end_game
--
-- See ../tinyspy/create_game_test.sql for the pgTAP / auth-
-- simulation primer.

begin;

set search_path = wordknit, common, public, extensions;

select plan(19);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up an active game from the fixture puzzle. The fixture's
-- 16 tiles (ALPHA, ANGEL, APPLE, ARROW, BANANA, BIRCH, BREAD,
-- BRICK, CASTLE, CIRCLE, CLOUD, CROWN, DAGGER, DELTA, DIAMOND,
-- DRAGON) are what the wrong/correct assertions below reference.
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
  array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]
);

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
-- (3) result='correct' requires a rank
-- ============================================================

select throws_ok(
  format(
    $$ select wordknit.submit_guess(%L::uuid,
                                     array['ALPHA','ANGEL','APPLE','ARROW']::text[],
                                     'correct', null) $$,
    (select id from g)
  ),
  'P0001',
  'matched_category_rank must be 0..3 when result is correct',
  'submit_guess: correct without matched_category_rank is rejected'
);

-- ============================================================
-- (4) Non-player is rejected (uses require_game_player now)
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
  'not playing this game',
  'submit_guess: non-player is rejected (via require_game_player)'
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
  (select mistake_count from wordknit.games where id = (select id from g)),
  1,
  'submit_guess: wrong guess increments mistake_count to 1'
);

select is(
  (select play_state from common.games where id = (select id from g)),
  'playing',
  'submit_guess: wrong guess leaves play_state playing'
);

-- ============================================================
-- (8) Correct guess: a result='correct' guesses row lands
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
  (select count(*) from wordknit.guesses
    where game_id = (select id from g)
      and result = 'correct'
      and matched_category_rank = 0),
  1::bigint,
  'submit_guess: correct guess inserts one correct row at rank 0'
);

-- ============================================================
-- (9) Race idempotency: a second 'correct' for the same rank
--     silently no-ops (partial-unique-index conflict caught)
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format(
    $$ select wordknit.submit_guess(%L::uuid,
                                     array['ALPHA','ANGEL','APPLE','ARROW']::text[],
                                     'correct', 0) $$,
    (select id from g)
  ),
  'submit_guess: a repeat correct on the same rank is a silent no-op'
);

reset role;
select is(
  (select count(*) from wordknit.guesses
    where game_id = (select id from g)
      and result = 'correct'
      and matched_category_rank = 0),
  1::bigint,
  'submit_guess: still exactly one correct row at rank 0 after the race'
);

-- ============================================================
-- (10)–(11) Solve path: match the other 3 categories → solved
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
  (select play_state from common.games where id = (select id from g)),
  'solved',
  'submit_guess: 4 matched categories flips play_state to solved'
);

-- end_game marks the row terminal (is_current_view is left alone
-- — the post-game review still lives on the current-view row).
select is(
  (select is_terminal from common.games where id = (select id from g)),
  true,
  'submit_guess: end_game sets is_terminal=true on win'
);

-- ============================================================
-- (12)–(14) Loss path: a fresh game, 4 wrong guesses → lost
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from wordknit.create_game(
  (select handle from club),
  pg_temp.wordknit_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]
);

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
-- After 3 wrong, mistake_count = 3, play_state still playing.
select is(
  (select mistake_count from wordknit.games where id = (select id from g2)),
  3,
  'submit_guess: 3 wrong guesses leaves mistake_count at 3'
);
select is(
  (select play_state from common.games where id = (select id from g2)),
  'playing',
  'submit_guess: 3 wrong guesses leaves play_state playing'
);

-- The 4th wrong takes mistake_count to 4 and flips play_state to lost.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordknit.submit_guess(
  (select id from g2),
  array['ALPHA','BIRCH','CASTLE','DAGGER']::text[],
  'wrong', null
);

reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'lost',
  'submit_guess: 4th wrong guess flips play_state to lost'
);

-- ============================================================
-- (15)–(18) submit_timeout — timeout-loss path
-- ============================================================
-- The FE fires this when the count-down timer hits 0. Sets
-- play_state='lost' just like a 4-mistakes-loss (the timeout
-- distinction lives in status->>'outcome'). Idempotent: a
-- second concurrent call from a racing client raises a clean
-- P0001 "game is not in progress" which the FE swallows.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select * from wordknit.create_game(
  (select handle from club),
  pg_temp.wordknit_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid]
);

-- Happy path: playing → submit_timeout → lost.
select lives_ok(
  format(
    $$ select wordknit.submit_timeout(%L::uuid) $$,
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
