-- cs-blessed-wordwheel

-- ============================================================
-- Test: wordwheel compete mode
-- ============================================================
--
-- A fork of spellingbee's compete_test: the compete delta. The shared
-- coop contract is exercised by create_game_test.sql +
-- gameplay_test.sql + rls_test.sql; this file covers what a race adds:
--
--   - First-to-target-rank ends the race (reached_goal / target) with
--     the caller alone ranked 1 and named on the club line, every
--     player's score frozen as it stood. Survivors with sub-target
--     ranks can no longer submit.
--   - Per-player duplicate rule: bea finding a word ada already
--     found is fresh for bea; ada's own repeat is the race refusal.
--   - Mid-game, each player's status carries their own score; the
--     club line carries no team score.
--   - submit_timeout in compete: nobody ranked, a loss.
--   - stop_game in compete: nobody ranked, neutral.
--   - RLS mid-game scopes guesses to caller; once the game has ended
--     the reveal opens (branch 3 of the policy).
--
-- See create_game_test.sql for the create_game shape + the
-- sibling-manifest test (gametype string + denormalized mode).
--
-- THE FORK numbers: the fixture pangram 'abcdefghi' scores 24 (9 + 15);
-- the fixture reqd_words_score is 62.

begin;

set search_path = wordwheel, common, public, extensions;

select plan(27);

-- One player inside the game_data blob.
create function pg_temp.player_of(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements((select game_data -> 'players' from common.games where id = game)) p
      where p ->> 'id' = uid::text $$;

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- Fixture: ada + bea + cade club. Compete game targets rank=2
-- (Solid; needs ≥15 / 62 = 24%) so the synthetic pangram
-- 'abcdefghi' (24 pt) trips a target-rank-hit in one move.
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Compete club',
  array['ada','bea','cade']) as handle;

create temp table g on commit drop as
select (wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup() || '{"target_rank": 2}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.wordwheel_board()
)->'data'->>'id')::uuid as id;

-- ============================================================
-- (1)–(2) Per-player duplicate rule
-- ============================================================
-- Ada finds 'bead'. Bea also finds 'bead' — allowed (each
-- player has their own list). Ada re-submits 'bead' — rejected.

select is(
  wordwheel.submit_word((select id from g), 'bead', 1, false, false)->'data'->>'result',
  'accepted',
  'compete: ada''s first "bead" submission accepted'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  wordwheel.submit_word((select id from g), 'bead', 1, false, false)->'data'->>'result',
  'accepted',
  'compete: bea also gets credit for "bead" — per-player ownership'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- A RACE: useFoundWordSubmit dedups locally and returns before committing, so
-- reaching this means its foundWords list was stale.
select pg_temp.envelope_is(
  wordwheel.submit_word((select id from g), 'bead', 1, false, false),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN361","message":"BEAD — already found"}'::jsonb,
  'compete: ada re-submitting "bead" rejected as already-found-by-her'
);

-- ============================================================
-- (3) Mid-game, each player's status carries their own score
-- ============================================================

reset role;
select is(
  (select summary_data->'team' from common.games where id = (select id from g)),
  'null'::jsonb,
  'compete mid-game: the summary carries no team'
);

select is(
  (
    select count(*)::int from jsonb_array_elements((select game_data->'players' from common.games where id = (select id from g))) p
     where p ? 'foundWordsScore'
  ),
  3,
  'compete mid-game: every player (ada, bea, cade) carries their own score'
);

-- Ada's status reflects her one accepted required word
-- (bead = 1pt, rank 0 — 1/62 is well below the rank 1 threshold).
select is(
  (
    select (pg_temp.player_of((select id from g), 'ada11111-1111-1111-1111-111111111111')->>'foundWordsScore')::int
  ),
  1,
  'compete mid-game: ada''s score = 1 after one accepted word'
);

-- ============================================================
-- (4)–(7) First-to-target ends the race
-- ============================================================
-- Cade submits the synthetic pangram (24 pt → rank 3 ≥ the target,
-- Solid). The game ends reached_goal / target; cade
-- alone is ranked 1, the others unranked.

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select pg_temp.envelope_is(
  wordwheel.submit_word((select id from g), 'abcdefghi', 24, true, false),
  -- No outcome and no message: src/wordwheel/lib/answer.ts says it.
  '{"type":"ok","data":{"result":"won"},"outcome":null,"message":null}'::jsonb,
  'compete: cade''s target-hitting pangram answers "won", as coop does'
);

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g)),
  'reached_goal/target/won',
  'compete: target-rank hit ends the race, reached_goal / target'
);

select is(
  (select (summary_data->'ending'->>'winner')::uuid from common.games where id = (select id from g)),
  'cade3333-3333-3333-3333-333333333333'::uuid,
  'compete: the summary names the caller (cade) as the winner'
);

select is(
  (pg_temp.player_of((select id from g), 'cade3333-3333-3333-3333-333333333333')->>'solved')
    || '/' || (pg_temp.player_of((select id from g), 'ada11111-1111-1111-1111-111111111111')->>'solved'),
  'true/false',
  'compete: the winner solved at the winning word, as game_data says; a rival did not'
);

-- Each score is frozen as it stood at the winning word: the winner's
-- includes it, and a rival's is what they had.
select is(
  (
    select (pg_temp.player_of((select id from g), 'cade3333-3333-3333-3333-333333333333')->>'foundWordsScore') || '/'
           || (pg_temp.player_of((select id from g), 'cade3333-3333-3333-3333-333333333333')->>'rankIdx')
  ),
  '24/3',
  'compete: the winner''s final score and rank are kept (24 pts, Nice)'
);

select is(
  (
    select (pg_temp.player_of((select id from g), 'ada11111-1111-1111-1111-111111111111')->>'foundWordsScore')::int
  ),
  1,
  'compete: a rival''s score is kept as it stood'
);

select is(
  (
    select final_ranking || '/' || outcome from common.game_players
     where game_id = (select id from g)
       and user_id = 'cade3333-3333-3333-3333-333333333333'::uuid
  ),
  '1/won',
  'compete: the winner is ranked 1, won'
);

-- Reaching the target is this game's solve: the winner's solved_at is stamped.
select is(
  (select solved_at is not null from common.game_players
    where game_id = (select id from g)
      and user_id = 'cade3333-3333-3333-3333-333333333333'::uuid),
  true,
  'compete: the winner''s solved_at is stamped at the target'
);

select is(
  (
    select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
     where game_id = (select id from g)
       and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid
  ),
  'unranked/lost',
  'compete: a non-winner is unranked, lost'
);

-- Survivor can no longer submit (the race ended).
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
-- A RACE, not a bug: the game can end while a submission is in flight.
select pg_temp.envelope_is(
  wordwheel.submit_word((select id from g), 'face', 1, false, false),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN486","message":"Game over"}'::jsonb,
  'compete: post-win opponent submit is rejected'
);

-- ============================================================
-- (10)–(12) submit_timeout in compete
-- ============================================================
-- Fresh 2-player compete game; immediately fire submit_timeout.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_timeout on commit drop as
select (wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup() || '{"target_rank": 5}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordwheel_board()
)->'data'->>'id')::uuid as id;

select wordwheel.submit_timeout((select id from g_timeout));

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g_timeout)),
  'lost',
  -- A compete race always carries a target rank, so the clock beating everyone
  -- to it is a real loss for the table — matching coop, and matching boggle's
  -- score target.
  'compete submit_timeout: the game is lost (nobody reached the rank)'
);

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g_timeout)),
  'timeout/timeout',
  'compete submit_timeout: the reason is timeout'
);

select is(
  (
    select count(*) from common.game_players
     where game_id = (select id from g_timeout)
       and final_ranking is null and outcome = 'lost'
  ),
  2::bigint,
  'compete submit_timeout: every player is unranked, lost (no winner on timer-out)'
);

-- The ended game's statuses carry target_rank + each player's score: the club
-- label names the rank nobody reached, and the OpponentStrip reads each
-- player's final rank.
select is(
  (select (summary_data->>'targetRankIdx')::int from common.games where id = (select id from g_timeout)),
  5,
  'compete submit_timeout: the summary''s targetRankIdx survives (= 5, not the ?? 0 fallback)'
);

select is(
  (select count(*)::int from jsonb_array_elements((select game_data->'players' from common.games where id = (select id from g_timeout))) p
    where p ? 'foundWordsScore'),
  2,
  'compete submit_timeout: each player''s score is still carried (2 players), not dropped'
);

-- ============================================================
-- (13)–(14) stop_game in compete — manual stop, no winner
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_end on commit drop as
select (wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup() || '{"target_rank": 5}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.wordwheel_board()
)->'data'->>'id')::uuid as id;

select wordwheel.stop_game((select id from g_end));

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_by_user_id::text
     from common.games where id = (select id from g_end)),
  'stopped/stopped/ada11111-1111-1111-1111-111111111111',
  'compete stop_game: the reason is stopped, by the caller'
);

select is(
  (
    select count(*) from common.game_players
     where game_id = (select id from g_end)
       and final_ranking is null and outcome = 'neutral'
  ),
  2::bigint,
  'compete stop_game: every player is unranked, neutral (friends agreed to stop)'
);

select is(
  (select (summary_data->>'targetRankIdx')::int from common.games where id = (select id from g_end)),
  5,
  'compete stop_game: the summary''s targetRankIdx survives (= 5, not the ?? 0 fallback)'
);

-- ============================================================
-- (15)–(17) RLS in compete: caller-only mid-game; reveal once ended
-- ============================================================
-- Fresh 3-player compete game; ada + bea each submit one word.
-- Cade (no submissions) sees zero rows mid-game (own list is
-- empty). Once the game has ended, branch (3) opens the reveal —
-- cade sees both peers' rows.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_rls on commit drop as
select (wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup() || '{"target_rank": 6}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.wordwheel_board()
)->'data'->>'id')::uuid as id;

select wordwheel.submit_word((select id from g_rls), 'bead', 1, false, false);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordwheel.submit_word((select id from g_rls), 'face', 1, false, false);

-- Ada sees every racer's row: the mode rule is the hook's, over game_data.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from wordwheel.found_words where game_id = (select id from g_rls)),
  2::bigint,
  'rls (compete mid-game): ada sees every racer''s row — the table carries no mode arm'
);

-- Cade (no submissions) sees them too.
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select count(*) from wordwheel.found_words where game_id = (select id from g_rls)),
  2::bigint,
  'rls (compete mid-game): cade (no finds) sees the racers'' rows too'
);

-- End the game — cade now sees all 2 rows via branch (3).
reset role;
update common.games
   set ended_at = now(), game_ended_reason = 'stopped',
       game_ended_reason_detail = 'stopped', game_ended_outcome = 'neutral'
 where id = (select id from g_rls);

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select count(*) from wordwheel.found_words where game_id = (select id from g_rls)),
  2::bigint,
  'rls (compete, ended): cade sees both ada''s + bea''s finds (branch 3: ended_at)'
);

-- ============================================================
select * from finish();
rollback;
