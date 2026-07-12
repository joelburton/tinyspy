-- ============================================================
-- Test: wordiply.submit_guess
-- ============================================================
--
-- A fork of wordwheel's gameplay_test, adapted to wordiply's guess model.
-- submit_guess is TRUSTING-COMMIT: the FE validated the word against the
-- board's shipped legal list, so the RPC does NOT consult a dictionary. It
-- gates the live game (playing / player / not conceded / budget), then two
-- FREE guards (word longer than base; word CONTAINS base), then mode-aware
-- dedup, then records + recomputes. An {ok:false} guess records NOTHING and
-- spends NO budget.
--
-- All guesses here are synthetic strings that satisfy the two guards
-- (contain 'ar', longer than 2) — trusting-commit means they need not be
-- real words. With max_word_length 7: length_score(L)=round(100*L/7), so
-- a 7-letter guess scores 100.
--
-- Coverage:
--   1. Coop happy: a valid guess → {ok:true}, one guesses row, status bump.
--   2. Free-guard rejections record NOTHING + spend NO budget:
--      too_short ('ar'), missing_base ('zzzz').
--   3. Dedup: coop dedups across the team; compete per-user (two players
--      CAN submit the same word in compete).
--   4. Budget: the 6th guess raises 'no guesses remaining'.
--   5. A conceded player cannot submit.
--   6. Coop 5th shared guess auto-terminates (ended/complete; scores in status).
--   7. RLS: compete opponent's guesses hidden mid-game, visible at terminal;
--      coop everyone sees all.

begin;

set search_path = wordiply, common, public, extensions;

select plan(23);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up: ada + bea + cade club, coop game in progress
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;

create temp table g on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop',
  pg_temp.wordiply_board()
);

-- ============================================================
-- (1) Coop happy path: ada submits 'arxxxxx' (7 letters, contains 'ar')
-- ============================================================

create temp table first_ret on commit drop as
select wordiply.submit_guess((select id from g), 'arxxxxx') as ret;

select is(
  (select (ret->>'ok')::boolean from first_ret),
  true,
  'submit_guess: a valid guess (contains base, longer) → ok=true'
);

select is(
  (select (ret->>'length')::int from first_ret),
  7,
  'submit_guess: returns the guess length (the one live readout)'
);

select is(
  (select (ret->>'is_terminal')::boolean from first_ret),
  false,
  'submit_guess: not terminal after the first coop guess'
);

select is(
  (select count(*) from wordiply.guesses
    where game_id = (select id from g) and word = 'arxxxxx'),
  1::bigint,
  'submit_guess: accepted guess inserts one guesses row'
);

select is(
  (select (status->>'guesses_used')::int from common.games where id = (select id from g)),
  1,
  'coop status.guesses_used = 1 after the first accepted guess'
);

-- ============================================================
-- (2) Free-guard rejections: record NOTHING, spend NO budget
-- ============================================================

-- too_short: a word not longer than the base ('ar' is exactly base length).
select is(
  wordiply.submit_guess((select id from g), 'ar')->>'reason',
  'too_short',
  'submit_guess: a word not longer than the base → {ok:false, reason:too_short}'
);

-- missing_base: a word that does not contain 'ar'.
select is(
  wordiply.submit_guess((select id from g), 'zzzz')->>'reason',
  'missing_base',
  'submit_guess: a word not containing the base → {ok:false, reason:missing_base}'
);

-- Neither rejection inserted a row (only the one happy-path guess exists).
select is(
  (select count(*) from wordiply.guesses where game_id = (select id from g)),
  1::bigint,
  'free-guard rejections insert NO guesses row'
);

-- ...and neither spent budget: guesses_used is still 1.
select is(
  (select (status->>'guesses_used')::int from common.games where id = (select id from g)),
  1,
  'free-guard rejections do NOT advance guesses_used (no budget spent)'
);

-- ============================================================
-- (3a) Coop dedup: across the whole team
-- ============================================================
-- bea tries the exact word ada already played → duplicate.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  wordiply.submit_guess((select id from g), 'arxxxxx')->>'reason',
  'duplicate',
  'coop dedup: bea cannot re-submit a word ada already played (team-wide)'
);

-- ============================================================
-- (4) Budget: the team's 6th guess raises 'no guesses remaining'
-- ============================================================
-- One guess exists (ada's). Add three more (guesses 2..4), then bea's fifth
-- auto-terminates the game — so instead we prove the budget ceiling by
-- filling to five directly and asserting the 6th throws. Fill guesses 2..5
-- directly (bypassing the auto-terminal branch by inserting), then the RPC's
-- 6th must throw.

reset role;
insert into wordiply.guesses (game_id, user_id, word, length, guess_index)
select (select id from g),
       'ada11111-1111-1111-1111-111111111111'::uuid,
       w, char_length(w), gi
  from (values ('arb', 2), ('arc', 3), ('ard', 4), ('are', 5)) t(w, gi);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select wordiply.submit_guess(%L::uuid, 'arfff') $$, (select id from g)),
  'P0001',
  'no guesses remaining',
  'coop: the 6th shared guess raises "no guesses remaining"'
);

-- ============================================================
-- (5) A conceded player cannot submit (compete game)
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cg on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.wordiply_board()
);

-- ada concedes, then tries to submit.
select wordiply.concede((select id from cg));
select throws_ok(
  format($$ select wordiply.submit_guess(%L::uuid, 'arxx') $$, (select id from cg)),
  'P0001',
  'you have conceded',
  'a conceded player cannot submit a guess'
);

-- ============================================================
-- (3b) Compete dedup is per-user: two players CAN submit the same word
-- ============================================================
-- bea + cade each play 'arbc' — both accepted (per-player ownership).

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (wordiply.submit_guess((select id from cg), 'arbc')->>'ok')::boolean,
  true,
  'compete: bea''s first "arbc" is accepted'
);

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (wordiply.submit_guess((select id from cg), 'arbc')->>'ok')::boolean,
  true,
  'compete: cade ALSO plays "arbc" — per-player ownership, not a duplicate'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  wordiply.submit_guess((select id from cg), 'arbc')->>'reason',
  'duplicate',
  'compete: bea''s SECOND "arbc" is a duplicate (same-player rule)'
);

-- ============================================================
-- (6) Coop 5th shared guess auto-terminates (ended/complete + scores)
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table term_g on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
);

-- Four shared guesses (ada), longest 7 → length_score 100.
select wordiply.submit_guess((select id from term_g), 'arxxxxx');  -- 7
select wordiply.submit_guess((select id from term_g), 'arxxx');    -- 5
select wordiply.submit_guess((select id from term_g), 'arxx');     -- 4
select wordiply.submit_guess((select id from term_g), 'arx');      -- 3

-- The 5th shared guess (bea) auto-terminates.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
create temp table fifth on commit drop as
select wordiply.submit_guess((select id from term_g), 'arw') as ret;  -- 3

select is(
  (select (ret->>'is_terminal')::boolean from fifth),
  true,
  'coop: the 5th shared guess reports is_terminal=true'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from term_g)),
  'ended',
  'coop 5th guess: play_state flips to "ended"'
);

select is(
  (select status->>'outcome' from common.games where id = (select id from term_g)),
  'complete',
  'coop 5th guess: status.outcome = "complete"'
);

select is(
  (select (status->>'length_score')::int from common.games where id = (select id from term_g)),
  100,
  'coop terminal: status.length_score = 100 (longest 7 / max 7)'
);

select is(
  (select (status->>'letter_count')::int from common.games where id = (select id from term_g)),
  22,                                       -- 7 + 5 + 4 + 3 + 3
  'coop terminal: status.letter_count = sum of all guess lengths'
);

-- ============================================================
-- (7) RLS: compete opponent's guesses hidden mid-game, visible at terminal
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table rls_g on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.wordiply_board()
);

select wordiply.submit_guess((select id from rls_g), 'arxx');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess((select id from rls_g), 'arbb');

-- cade (no guesses) sees zero mid-game (own list empty; can't see peers).
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select count(*) from wordiply.guesses where game_id = (select id from rls_g)),
  0::bigint,
  'rls (compete mid-game): cade (no guesses) sees zero rows'
);

-- Flip terminal → branch (3) opens the reveal; cade sees both peers' rows.
reset role;
update common.games set is_terminal = true, play_state = 'ended'
 where id = (select id from rls_g);

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select count(*) from wordiply.guesses where game_id = (select id from rls_g)),
  2::bigint,
  'rls (compete post-terminal): cade sees both ada''s + bea''s guesses'
);

-- Coop: everyone sees all guesses mid-game (branch 1). Reuse term_g, which
-- is terminal now, so build a fresh coop game and cross-read.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table coop_rls on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
);
select wordiply.submit_guess((select id from coop_rls), 'arxx');

-- bea sees ada's guess mid-game (coop is shared).
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from wordiply.guesses where game_id = (select id from coop_rls)),
  1::bigint,
  'rls (coop mid-game): bea sees ada''s guess (coop is a shared board)'
);

-- ============================================================
select * from finish();
rollback;
