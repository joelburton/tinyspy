-- ============================================================
-- Test: wordwheel compete mode (sibling-manifest era)
-- ============================================================
--
-- A fork of spellingbee's compete_test. Coverage for the compete-
-- specific behavior. The shared coop contract is exercised by
-- create_game_test.sql + gameplay_test.sql + rls_test.sql — this file
-- focuses on the compete delta:
--
--   - First-to-target-rank ends the race with the caller as the
--     winner (status.winner_user_id) and play_state=won_compete.
--   - Per-player duplicate rule: bea finding a word ada already
--     found is fresh-for-bea (not 'alreadyFound').
--   - Mid-game status carries the leaderboard with per-player
--     score + rank_idx + found_words_count.
--   - submit_timeout in compete: everyone {won: false}, outcome='timeout'.
--   - end_game in compete: everyone {won: false}, outcome='manual'.
--   - RLS mid-game scopes finds to caller; post-terminal opens the reveal.
--
-- THE FORK numbers: the fixture pangram 'abcdefghi' scores 24 (9 + 15).
-- fixture required_words_score = 62.

begin;

set search_path = wordwheel, common, public, extensions;

select plan(23);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Fixture: ada + bea + cade club. Compete game targets rank=2
-- (Solid; needs ≥15 / 62 = 24%) so the synthetic pangram
-- 'abcdefghi' (24 pt) trips a target-rank-hit in one move.
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Compete club',
  array['ada','bea','cade']) as handle;

create temp table g on commit drop as
select * from wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup() || '{"target_rank": 2}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.wordwheel_board()
);

-- ============================================================
-- (1)–(2) Per-player duplicate rule
-- ============================================================

select is(
  wordwheel.submit_word((select id from g), 'bead', 1, false, false)->>'result',
  'accepted',
  'compete: ada''s first "bead" submission accepted'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  wordwheel.submit_word((select id from g), 'bead', 1, false, false)->>'result',
  'accepted',
  'compete: bea also gets credit for "bead" — per-player ownership'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordwheel.submit_word((select id from g), 'bead', 1, false, false)->>'result',
  'alreadyFound',
  'compete: ada re-submitting "bead" rejected as already-found-by-her'
);

-- ============================================================
-- (3) Mid-game status carries the leaderboard
-- ============================================================

reset role;
select is(
  (select jsonb_typeof(status->'leaderboard') from common.games where id = (select id from g)),
  'array',
  'compete mid-game: status.leaderboard is a jsonb array'
);

select is(
  (
    select jsonb_array_length(status->'leaderboard')
      from common.games where id = (select id from g)
  ),
  3,
  'compete mid-game: leaderboard has one entry per player (ada, bea, cade)'
);

-- Ada's leaderboard entry reflects her one accepted required word
-- (bead = 1pt, rank 0 — 1/62 is well below the rank 1 threshold).
select is(
  (
    select (entry->>'found_words_score')::int
      from common.games cg,
           jsonb_array_elements(cg.status->'leaderboard') entry
     where cg.id = (select id from g)
       and (entry->>'user_id')::uuid =
           'ada11111-1111-1111-1111-111111111111'::uuid
  ),
  1,
  'compete mid-game: ada''s leaderboard score = 1 after one accepted word'
);

-- ============================================================
-- (4)–(7) First-to-target ends the race
-- ============================================================
-- Cade submits the synthetic pangram (24 pt → rank 3 ≥ target 2).
-- play_state flips to 'won_compete'; status.winner_user_id = cade;
-- cade gets {won: true}, others get {won: false}.

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  wordwheel.submit_word((select id from g), 'abcdefghi', 24, true, false)->>'result',
  'pangram',
  'compete: cade''s target-hitting pangram returns "pangram"'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'won_compete',
  'compete: target-rank hit flips play_state to won_compete'
);

select is(
  (select (status->>'winner_user_id')::uuid from common.games where id = (select id from g)),
  'cade3333-3333-3333-3333-333333333333'::uuid,
  'compete: status.winner_user_id = caller (cade)'
);

select is(
  (
    select (result->>'won')::boolean from common.game_players
     where game_id = (select id from g)
       and user_id = 'cade3333-3333-3333-3333-333333333333'::uuid
  ),
  true,
  'compete: winner''s game_players.result = {won: true}'
);

select is(
  (
    select (result->>'won')::boolean from common.game_players
     where game_id = (select id from g)
       and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid
  ),
  false,
  'compete: non-winner''s game_players.result = {won: false}'
);

-- Survivor can no longer submit (the race ended).
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select wordwheel.submit_word(%L::uuid, 'face', 1, false, false) $$, (select id from g)),
  'P0001',
  'game is not in progress',
  'compete: post-win opponent submit is rejected'
);

-- ============================================================
-- (10)–(12) submit_timeout in compete
-- ============================================================
-- Fresh 2-player compete game; immediately fire submit_timeout.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_timeout on commit drop as
select * from wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup() || '{"target_rank": 5}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordwheel_board()
);

select wordwheel.submit_timeout((select id from g_timeout));

reset role;
select is(
  (select play_state from common.games where id = (select id from g_timeout)),
  'ended',
  'compete submit_timeout: play_state = ended'
);

select is(
  (select (status->>'outcome') from common.games where id = (select id from g_timeout)),
  'timeout',
  'compete submit_timeout: status.outcome = timeout'
);

select is(
  (
    select count(*) from common.game_players
     where game_id = (select id from g_timeout)
       and (result->>'won') = 'false'
  ),
  2::bigint,
  'compete submit_timeout: every player gets {won: false} (no winner on timer-out)'
);

-- The terminal status must still carry target_rank + the leaderboard array —
-- common.end_game replaces status wholesale, so dropping them would make the
-- club label read "no winner at Start" and the OpponentStrip "Lost at Start".
select is(
  (select (status->>'target_rank')::int from common.games where id = (select id from g_timeout)),
  5,
  'compete submit_timeout: status.target_rank survives (= 5, not the ?? 0 fallback)'
);

select is(
  (select jsonb_array_length(status->'leaderboard') from common.games where id = (select id from g_timeout)),
  2,
  'compete submit_timeout: status.leaderboard is the per-player array (2 entries), not dropped'
);

-- ============================================================
-- (13)–(14) end_game in compete — manual stop, no winner
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_end on commit drop as
select * from wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup() || '{"target_rank": 5}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordwheel_board()
);

select wordwheel.end_game((select id from g_end));

reset role;
select is(
  (select (status->>'outcome') from common.games where id = (select id from g_end)),
  'manual',
  'compete end_game: status.outcome = manual'
);

select is(
  (
    select count(*) from common.game_players
     where game_id = (select id from g_end)
       and (result->>'won') = 'false'
  ),
  2::bigint,
  'compete end_game: every player gets {won: false} (friends agreed to stop)'
);

select is(
  (select (status->>'target_rank')::int from common.games where id = (select id from g_end)),
  5,
  'compete end_game: status.target_rank survives (= 5, not the ?? 0 fallback)'
);

-- ============================================================
-- (15)–(17) RLS in compete: caller-only mid-game; reveal on terminal
-- ============================================================
-- Fresh 3-player compete game; ada + bea each submit one word.
-- Cade (no submissions) sees zero rows mid-game (own list is empty).
-- Post-terminal, branch (c) opens the reveal — cade sees both peers' rows.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_rls on commit drop as
select * from wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup() || '{"target_rank": 6}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.wordwheel_board()
);

select wordwheel.submit_word((select id from g_rls), 'bead', 1, false, false);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordwheel.submit_word((select id from g_rls), 'face', 1, false, false);

-- Ada sees her own one row only.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from wordwheel.found_words where game_id = (select id from g_rls)),
  1::bigint,
  'rls (compete mid-game): ada sees only her own found_word'
);

-- Cade (no submissions) sees zero.
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select count(*) from wordwheel.found_words where game_id = (select id from g_rls)),
  0::bigint,
  'rls (compete mid-game): cade (no finds) sees zero rows'
);

-- Flip the game terminal — cade now sees all 2 rows via branch (c).
reset role;
update common.games set is_terminal = true, play_state = 'ended'
 where id = (select id from g_rls);

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select count(*) from wordwheel.found_words where game_id = (select id from g_rls)),
  2::bigint,
  'rls (compete post-terminal): cade sees both ada''s + bea''s finds (branch c: is_terminal)'
);

-- ============================================================
select * from finish();
rollback;
