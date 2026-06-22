-- ============================================================
-- Test: freebee compete mode (sibling-manifest era)
-- ============================================================
--
-- Coverage for the compete-specific behavior added in the
-- 20260621 freebee_compete migration. The shared coop contract
-- is exercised by create_game_test.sql + gameplay_test.sql +
-- rls_test.sql — this file focuses on the compete delta:
--
--   - First-to-target-rank ends the race with the caller as the
--     winner (status.winner_user_id) and play_state=won_compete.
--     Survivors with sub-target ranks can no longer submit.
--   - Per-player duplicate rule: bea finding a word ada already
--     found is fresh-for-bea (not 'alreadyFound').
--   - Mid-game status carries the leaderboard with per-player
--     score + rank_idx + found_words_count.
--   - submit_timeout in compete: everyone {won: false}, status
--     outcome='timeout'.
--   - end_game in compete: everyone {won: false}, outcome='manual'.
--   - RLS mid-game scopes guesses to caller; post-terminal opens
--     the reveal (branch c of the policy).
--
-- See create_game_test.sql for the create_game shape + the
-- sibling-manifest test (gametype string + denormalized mode).

begin;

set search_path = freebee, common, public, extensions;

select plan(20);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Fixture: ada + bea + cade club. Compete game targets rank=2
-- (Solid; needs ≥12 / 50 = 24%) so the synthetic pangram
-- 'abcdefg' (17 pt) trips a target-rank-hit in one move.
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Compete club',
  array['ada','bea','cade']) as handle;

create temp table g on commit drop as
select * from freebee.create_game(
  (select handle from club),
  pg_temp.freebee_setup() || '{"target_rank": 2}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.freebee_board()
);

-- ============================================================
-- (1)–(2) Per-player duplicate rule
-- ============================================================
-- Ada finds 'bead'. Bea also finds 'bead' — allowed (each
-- player has their own list). Ada re-submits 'bead' — rejected.

select is(
  freebee.submit_word((select id from g), 'bead')->>'result',
  'accepted',
  'compete: ada''s first "bead" submission accepted'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  freebee.submit_word((select id from g), 'bead')->>'result',
  'accepted',
  'compete: bea also gets credit for "bead" — per-player ownership'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  freebee.submit_word((select id from g), 'bead')->>'result',
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
-- (bead = 1pt, rank 0 — 1/50 is well below the rank 1 threshold).
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
-- Cade submits the synthetic pangram (17 pt → rank ≥ 2 = Solid,
-- which is the target). play_state flips to 'won_compete';
-- status.winner_user_id = cade; cade gets {won: true}, others get
-- {won: false}.

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  freebee.submit_word((select id from g), 'abcdefg')->>'result',
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
  format($$ select freebee.submit_word(%L::uuid, 'face') $$, (select id from g)),
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
select * from freebee.create_game(
  (select handle from club),
  pg_temp.freebee_setup() || '{"target_rank": 5}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.freebee_board()
);

select freebee.submit_timeout((select id from g_timeout));

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

-- ============================================================
-- (13)–(14) end_game in compete — manual stop, no winner
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_end on commit drop as
select * from freebee.create_game(
  (select handle from club),
  pg_temp.freebee_setup() || '{"target_rank": 5}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.freebee_board()
);

select freebee.end_game((select id from g_end));

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

-- ============================================================
-- (15)–(17) RLS in compete: caller-only mid-game; reveal on terminal
-- ============================================================
-- Fresh 3-player compete game; ada + bea each submit one word.
-- Cade (no submissions) sees zero rows mid-game (own list is
-- empty). Post-terminal, branch (c) opens the reveal — cade sees
-- both peers' rows.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_rls on commit drop as
select * from freebee.create_game(
  (select handle from club),
  pg_temp.freebee_setup() || '{"target_rank": 6}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.freebee_board()
);

select freebee.submit_word((select id from g_rls), 'bead');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select freebee.submit_word((select id from g_rls), 'face');

-- Ada sees her own one row only.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from freebee.found_words where game_id = (select id from g_rls)),
  1::bigint,
  'rls (compete mid-game): ada sees only her own found_word'
);

-- Cade (no submissions) sees zero.
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select count(*) from freebee.found_words where game_id = (select id from g_rls)),
  0::bigint,
  'rls (compete mid-game): cade (no finds) sees zero rows'
);

-- Flip the game terminal — cade now sees all 2 rows via branch (c).
reset role;
update common.games set is_terminal = true, play_state = 'ended'
 where id = (select id from g_rls);

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select count(*) from freebee.found_words where game_id = (select id from g_rls)),
  2::bigint,
  'rls (compete post-terminal): cade sees both ada''s + bea''s finds (branch c: is_terminal)'
);

-- ============================================================
select * from finish();
rollback;
