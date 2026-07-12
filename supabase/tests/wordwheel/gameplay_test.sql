-- ============================================================
-- Test: wordwheel.submit_word + wordwheel.submit_timeout + end_game
-- ============================================================
--
-- A fork of spellingbee's gameplay_test. submit_word is trusting-commit:
-- the FE validated the word against the board's shipped legal list
-- (required ∪ bonus) and scored it, so the RPC takes (word, points,
-- is_pangram, is_bonus), trusts them, and only enforces the live-game
-- check, dedups, records, and recomputes aggregates / the compete win.
-- It does NOT validate word content (no tooShort/badLetters/
-- missingCenter/notAWord — the "each tile once" isogram rule lives in
-- the edge function, not here). It returns { result, points }
-- (result = pangram / bonus / accepted / alreadyFound) mostly for tests.
--
-- THE FORK numbers: the fixture pangram 'abcdefghi' is a 9-letter word
-- scoring 9 + 15 = 24 (spellingbee's is 7-letter, +10). The fixture
-- required_words_score is 62 across 19 words.
--
-- Coverage mirrors spellingbee's:
--   1. coop happy: required word → 'accepted', row inserted, status updated.
--   2. coop pangram: trusted is_pangram (24 pt) → 'pangram'.
--   3. coop bonus: trusted is_bonus → 'bonus'; 3b bonus+pangram → 'pangram'.
--   4. coop duplicate → 'alreadyFound'; compete duplicate is per-player.
--   5. compete target-rank-hit → terminal 'won_compete'; leaderboard populated.
--   6. hard rejections: post-terminal P0001; non-player 42501.
--   7. coop has NO auto-terminal past required_words_count.
--   8. submit_timeout / end_game terminal transitions + idempotency + auth.
--   9. games_state exposes required_words during play + at terminal.

begin;

set search_path = wordwheel, common, public, extensions;

select plan(45);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up: ada + bea + cade club, coop game in progress
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;

create temp table g on commit drop as
select * from wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop',
  pg_temp.wordwheel_board()
);

-- ============================================================
-- (1) Coop happy path: ada submits 'bead' → accepted, 1pt
-- ============================================================

create temp table bead_ret on commit drop as
select wordwheel.submit_word((select id from g), 'bead', 1, false, false) as ret;
select is(
  (select ret->>'result' from bead_ret),
  'accepted',
  'submit_word: required word (is_bonus/is_pangram false) → "accepted"'
);
select is(
  (select (ret->>'points')::int from bead_ret),
  1,
  'submit_word: return echoes the trusted points (bead = 1)'
);

select is(
  (select count(*) from wordwheel.found_words
    where game_id = (select id from g) and word = 'bead'),
  1::bigint,
  'submit_word: accepted word inserts one found_words row'
);

select is(
  (select points from wordwheel.found_words
    where game_id = (select id from g) and word = 'bead'),
  1,
  'submit_word: row stores the trusted points'
);

select is(
  (select (status->>'found_words_score')::int from common.games where id = (select id from g)),
  1,
  'status.found_words_score updated after first accepted word'
);
select is(
  (select (status->>'found_words_count')::int from common.games where id = (select id from g)),
  1,
  'status.found_words_count = 1 after first accepted'
);

-- ============================================================
-- (2) Coop pangram: ada submits the 9-letter pangram (trusted +15)
-- ============================================================

select is(
  wordwheel.submit_word((select id from g), 'abcdefghi', 24, true, false)->>'result',
  'pangram',
  'submit_word: is_pangram=true → result "pangram"'
);

select is(
  (select points from wordwheel.found_words
    where game_id = (select id from g) and word = 'abcdefghi'),
  24,
  'submit_word: pangram row stores the trusted 24 points (9 + 15)'
);

select is(
  (select is_pangram from wordwheel.found_words
    where game_id = (select id from g) and word = 'abcdefghi'),
  true,
  'submit_word: pangram row has is_pangram=true'
);

-- ============================================================
-- (3) Coop bonus: ada submits a legal-only word (is_bonus true)
-- ============================================================

select is(
  wordwheel.submit_word((select id from g), 'cadge', 5, false, true)->>'result',
  'bonus',
  'submit_word: is_bonus=true → result "bonus"'
);

select is(
  (select (points, is_bonus, is_pangram) from wordwheel.found_words
    where game_id = (select id from g) and word = 'cadge'),
  (5, true, false),
  'submit_word: bonus row stores trusted points (5), is_bonus=true, not a pangram'
);

-- Score advances WITH the bonus points; count includes all rows.
select is(
  (select (status->>'found_words_score')::int from common.games where id = (select id from g)),
  30,                                       -- 1 (bead) + 24 (pangram) + 5 (bonus)
  'status.found_words_score includes bonus-word points'
);
select is(
  (select (status->>'found_words_count')::int from common.games where id = (select id from g)),
  3,                                        -- bead + pangram + bonus (all counted)
  'status.found_words_count counts ALL submissions incl. bonus (overshoot OK)'
);

-- ── (3b) Bonus pangram: is_bonus AND is_pangram both true ──
select is(
  wordwheel.submit_word((select id from g), 'ihgfedcba', 24, true, true)->>'result',
  'pangram',
  'submit_word: is_pangram wins over is_bonus in the result label ("pangram")'
);

select is(
  (select (points, is_bonus, is_pangram) from wordwheel.found_words
    where game_id = (select id from g) and word = 'ihgfedcba'),
  (24, true, true),
  'submit_word: bonus pangram stores (24, is_bonus=true, is_pangram=true)'
);

-- ============================================================
-- (4) Coop duplicate: once anyone finds 'bead', everyone gets 'alreadyFound'
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  wordwheel.submit_word((select id from g), 'bead', 1, false, false)->>'result',
  'alreadyFound',
  'coop duplicate: bea cannot re-submit a word ada already found'
);

-- ============================================================
-- (5) Hard rejection: dee (outsider) is not a player
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select wordwheel.submit_word(%L::uuid, 'fade', 1, false, false) $$, (select id from g)),
  '42501',
  null,
  'submit_word: non-player (dee, outsider) is rejected with 42501'
);

-- ============================================================
-- (6) Compete duplicate semantics: per-player ownership
-- ============================================================
-- target_rank=2 (Solid; ≥15/62=24%) so the pangram below (→25 pts total,
-- rank 3) trips the target-rank terminal in one move.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table compete_g on commit drop as
select * from wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup() || '{"target_rank": 2}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.wordwheel_board()
);

select is(
  wordwheel.submit_word((select id from compete_g), 'bead', 1, false, false)->>'result',
  'accepted',
  'compete: ada''s first submission of "bead" is accepted'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  wordwheel.submit_word((select id from compete_g), 'bead', 1, false, false)->>'result',
  'accepted',
  'compete: bea ALSO finds "bead" (per-player ownership)'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordwheel.submit_word((select id from compete_g), 'bead', 1, false, false)->>'result',
  'alreadyFound',
  'compete: ada''s SECOND "bead" is "alreadyFound" (same-player rule)'
);

-- ============================================================
-- (7) Compete win: ada submits the pangram → 'won_compete'
-- ============================================================
-- bead (1) + pangram (24) = 25 → rank_idx 3 (Nice) ≥ target_rank 2 → terminal.

select is(
  wordwheel.submit_word((select id from compete_g), 'abcdefghi', 24, true, false)->>'result',
  'pangram',
  'compete: pangram submission that crosses target_rank returns "pangram"'
);

select is(
  (select play_state from common.games where id = (select id from compete_g)),
  'won_compete',
  'compete: play_state flips to "won_compete" when caller hits target_rank'
);

select is(
  (select is_terminal from common.games where id = (select id from compete_g)),
  true,
  'compete: is_terminal=true on the target-rank-hit transition'
);

select is(
  (select status->>'winner_user_id' from common.games where id = (select id from compete_g)),
  'ada11111-1111-1111-1111-111111111111',
  'compete: status.winner_user_id = caller who triggered the rank hit'
);

-- ============================================================
-- (8) Post-terminal submission is rejected with P0001
-- ============================================================

select throws_ok(
  format($$ select wordwheel.submit_word(%L::uuid, 'face', 1, false, false) $$, (select id from compete_g)),
  'P0001',
  'game is not in progress',
  'post-terminal submit_word raises P0001'
);

-- ============================================================
-- (9) Coop has NO auto-terminal — players keep going past required_words_count
-- ============================================================
-- Bulk-insert the rest of the required set directly, drop one, and re-submit it
-- via the RPC to exercise the aggregate recount at the count-complete boundary.

reset role;
insert into wordwheel.found_words (game_id, user_id, word, points, is_pangram, is_bonus)
  select
    (select id from g),
    'ada11111-1111-1111-1111-111111111111'::uuid,
    sw->>'word',
    (sw->>'points')::int,
    (sw->>'is_pangram')::boolean,
    false
  from jsonb_array_elements(pg_temp.wordwheel_board()->'required_words') sw
  where sw->>'word' not in ('bead', 'abcdefghi')
    and not exists (
      select 1 from wordwheel.found_words fw
      where fw.game_id = (select id from g)
        and fw.word = sw->>'word'
    );

delete from wordwheel.found_words
 where game_id = (select id from g) and word = 'iced';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordwheel.submit_word((select id from g), 'iced', 1, false, false)->>'result',
  'accepted',
  'coop: the last required word returns "accepted"'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'playing',
  'coop: play_state STAYS "playing" past 100%-found (no auto-terminal)'
);

select is(
  (select is_terminal from common.games where id = (select id from g)),
  false,
  'coop: is_terminal stays false past 100%-found'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordwheel.submit_word((select id from g), 'gibed', 5, false, true)->>'result',
  'bonus',
  'coop: bonus word accepted after the required set is exhausted'
);

reset role;
select is(
  (select (status->>'found_words_score')::int > (status->>'required_words_score')::int
     from common.games where id = (select id from g)),
  true,
  'coop: status.score can exceed required_words_score once bonus words are found'
);

select is(
  (select (status->>'rank_idx')::int from common.games where id = (select id from g)),
  6,
  'coop: status.rank_idx clamps at 6 (Genius) past required_words_score'
);

-- ============================================================
-- (10) submit_timeout: terminal 'ended' outcome='timeout'
-- ============================================================

reset role;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table timeout_g on commit drop as
select * from wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup() || '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop',
  pg_temp.wordwheel_board()
);

-- One submission so the score isn't zero (proves the timeout captures state).
select is(
  wordwheel.submit_word((select id from timeout_g), 'face', 1, false, false)->>'result',
  'accepted',
  'submit_word: face accepted in timeout-game setup'
);

select wordwheel.submit_timeout((select id from timeout_g));

select is(
  (select play_state from common.games where id = (select id from timeout_g)),
  'ended',
  'submit_timeout: play_state flips to "ended"'
);

select is(
  (select is_terminal from common.games where id = (select id from timeout_g)),
  true,
  'submit_timeout: is_terminal=true'
);

select is(
  (select status->>'outcome' from common.games where id = (select id from timeout_g)),
  'timeout',
  'submit_timeout: status.outcome=timeout'
);

-- Idempotency: a second call raises P0001 (peers racing the countdown).
select throws_ok(
  format($$ select wordwheel.submit_timeout(%L::uuid) $$, (select id from timeout_g)),
  'P0001',
  'game is not in progress',
  'submit_timeout: second call raises P0001 (idempotent at the FE-swallow layer)'
);

-- games_state exposes the full required-words list (un-gated: available during
-- play AND at terminal — the FE ships it from game start).
select is(
  (select jsonb_array_length(required_words) from wordwheel.games_state
    where id = (select id from timeout_g)),
  19,
  'games_state.required_words is exposed (19 required entries)'
);

-- ============================================================
-- (11) wordwheel.end_game: manual terminal
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table end_g on commit drop as
select * from wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop',
  pg_temp.wordwheel_board()
);

-- One required submission so end_game captures a real live aggregate.
select is(
  wordwheel.submit_word((select id from end_g), 'bead', 1, false, false)->>'result',
  'accepted',
  'submit_word: bead accepted in end_game setup'
);

select wordwheel.end_game((select id from end_g));

select is(
  (select play_state from common.games where id = (select id from end_g)),
  'ended',
  'end_game: play_state flips to "ended"'
);

select is(
  (select is_terminal from common.games where id = (select id from end_g)),
  true,
  'end_game: is_terminal=true'
);

select is(
  (select status->>'outcome' from common.games where id = (select id from end_g)),
  'manual',
  'end_game: status.outcome=manual (distinguishes from timeout)'
);

select is(
  (select (status->>'found_words_score')::int from common.games where id = (select id from end_g)),
  1,
  'end_game: status.score reflects the team''s live tally at the moment of end'
);

select is(
  (select (status->>'found_words_count')::int from common.games where id = (select id from end_g)),
  1,
  'end_game: status.found_words_count reflects the live count'
);

-- Idempotency: a second call raises P0001.
select throws_ok(
  format($$ select wordwheel.end_game(%L::uuid) $$, (select id from end_g)),
  'P0001',
  'game is not in progress',
  'end_game: second call raises P0001 (idempotent at the FE-swallow layer)'
);

-- Auth: dee (outsider) cannot end a game they're not in. Fresh game (the previous
-- one is terminal and would short-circuit on play_state).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table auth_g on commit drop as
select * from wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop',
  pg_temp.wordwheel_board()
);

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select wordwheel.end_game(%L::uuid) $$, (select id from auth_g)),
  '42501',
  null,
  'end_game: non-player (dee, outsider) is rejected with 42501'
);

-- ============================================================
select * from finish();
rollback;
