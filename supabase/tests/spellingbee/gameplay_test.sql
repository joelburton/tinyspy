-- ============================================================
-- Test: spellingbee.submit_word + spellingbee.submit_timeout
-- ============================================================
--
-- submit_word returns jsonb `{ result, points }` (so the FE can show points
-- without re-deriving the point rules). Assertions read `->>'result'`; one capture
-- checks `points` too. A pangram (required OR bonus) reports result 'pangram'.
--
-- Coverage:
--   1. submit_word coop happy: required word → result 'accepted',
--      row inserted, status updated, return carries points.
--   2. submit_word coop pangram: pangram word → result 'pangram'
--      with the +10 bonus reflected in points and is_pangram=true.
--   3. submit_word coop bonus: legal-only word → result 'bonus',
--      is_bonus=true, and scored length-based the SAME as a required
--      word (the bonus-scoring fix — assertion below expects 6 pts,
--      not 0). A legal-only word with 7 distinct letters → 'pangram'.
--   4. submit_word soft rejections (each returns { result, points: 0 } —
--      no row inserted, no exception): tooShort, badLetters,
--      missingCenter, notAWord.
--   5. submit_word coop duplicate: once found by anyone,
--      'alreadyFound' for everyone.
--   6. submit_word compete duplicate: per-player; same word
--      by another player is OK, same word by same player is
--      'alreadyFound'.
--   7. submit_word coop has NO auto-terminal — players can
--      continue past required_words_count (bonus words push score over
--      required_words_score, rank clamps to Genius).
--   8. submit_word compete target-rank-hit → terminal
--      'won_compete'; status.leaderboard populated.
--   9. submit_word hard rejections: post-terminal P0001;
--      non-player 42501.
--  10. submit_timeout: terminal 'ended' outcome='timeout';
--      idempotent on second call (raises 'game is not in
--      progress' P0001).
--
-- See ../tinyspy/create_game_test.sql for the pgTAP primer.

begin;

set search_path = spellingbee, common, public, extensions;

select plan(52);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up: ada + bea + cade club, coop game in progress
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;

create temp table g on commit drop as
select * from spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop',
  pg_temp.spellingbee_board()
);

-- ============================================================
-- (1) Coop happy path: ada submits 'bead' → accepted, 1pt
-- ============================================================

-- Capture the return so we assert both halves of the new { result, points }
-- shape (the rest of the suite just reads ->>'result').
create temp table bead_ret on commit drop as
select spellingbee.submit_word((select id from g), 'bead') as ret;
select is(
  (select ret->>'result' from bead_ret),
  'accepted',
  'submit_word: required 4-letter word returns result "accepted"'
);
select is(
  (select (ret->>'points')::int from bead_ret),
  1,
  'submit_word: return carries points (bead = 1)'
);

select is(
  (select count(*) from spellingbee.found_words
    where game_id = (select id from g) and word = 'bead'),
  1::bigint,
  'submit_word: accepted word inserts one found_words row'
);

select is(
  (select points from spellingbee.found_words
    where game_id = (select id from g) and word = 'bead'),
  1,
  'submit_word: 4-letter word scores 1 point'
);

-- Status reflects the accepted word.
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
-- (2) Coop pangram: ada submits the synthetic pangram → +10
-- ============================================================

select is(
  spellingbee.submit_word((select id from g), 'abcdefg')->>'result',
  'pangram',
  'submit_word: 7-letter pangram returns result "pangram"'
);

select is(
  (select points from spellingbee.found_words
    where game_id = (select id from g) and word = 'abcdefg'),
  17,
  'submit_word: pangram scores length(7) + bonus(10) = 17'
);

select is(
  (select is_pangram from spellingbee.found_words
    where game_id = (select id from g) and word = 'abcdefg'),
  true,
  'submit_word: pangram row has is_pangram=true'
);

-- ============================================================
-- (3) Coop bonus: ada submits a legal-only word
-- ============================================================
-- The board's bonus_words is ['bcdfge', 'abcdef', 'gfedcba'].
-- We pick 'bcdfge' here — uses only puzzle letters, includes 'e',
-- non-pangram (6 distinct letters). 'gfedcba' is exercised
-- separately (3b) as the bonus-pangram path; 'abcdef' is used
-- past-100% in the no-auto-terminal test (10).

select is(
  spellingbee.submit_word((select id from g), 'bcdfge')->>'result',
  'bonus',
  'submit_word: legal-but-not-required word returns "bonus"'
);

-- Bonus words score the same as required words per spellingbee-ws:
-- length-based (1 pt for 4-letter, length pts for ≥5) + pangram
-- bonus when 7 distinct letters. 'bcdfge' is 6 distinct letters,
-- length 6 → 6 pts, not a pangram.
select is(
  (select (points, is_bonus, is_pangram) from spellingbee.found_words
    where game_id = (select id from g) and word = 'bcdfge'),
  (6, true, false),
  'submit_word: bonus row scores length-based (6 pts), is_bonus=true, not a pangram'
);

-- Score advances WITH the bonus points. found_words_count counts ALL
-- accepted submissions (required + bonus), matching spellingbee-ws's
-- "found.length" stat — the display can overshoot required_words_count
-- when the team finds bonus extras.
select is(
  (select (status->>'found_words_score')::int from common.games where id = (select id from g)),
  24,                                       -- 1 (bead) + 17 (pangram) + 6 (bonus)
  'status.found_words_score includes bonus-word points'
);
select is(
  (select (status->>'found_words_count')::int from common.games where id = (select id from g)),
  3,                                        -- bead + pangram + bonus (all counted)
  'status.found_words_count counts ALL submissions incl. bonus (overshoot OK)'
);

-- ============================================================
-- (3b) Bonus pangram: legal-only word with 7 distinct letters
-- ============================================================
-- 'gfedcba' (synthetic, in bonus_words via the fixture) uses
-- all 7 puzzle letters. Per spellingbee-ws's point rules, the +10 pangram
-- bonus applies regardless of whether the word is in the required
-- or bonus set — pangram-ness comes from the WORD's distinct
-- letter count, not from the precomputed required-entry flag.

select is(
  spellingbee.submit_word((select id from g), 'gfedcba')->>'result',
  'pangram',
  'submit_word: legal-only 7-distinct-letter word returns "pangram" (bonus pangram)'
);

select is(
  (select (points, is_bonus, is_pangram) from spellingbee.found_words
    where game_id = (select id from g) and word = 'gfedcba'),
  (17, true, true),
  'submit_word: bonus pangram scores length(7)+pangram(10) = 17, is_pangram=true'
);

-- ============================================================
-- (4) Soft rejections: each returns a string, no row inserted
-- ============================================================

select is(
  spellingbee.submit_word((select id from g), 'be')->>'result',
  'tooShort',
  'submit_word: <4-letter word returns "tooShort"'
);

select is(
  spellingbee.submit_word((select id from g), 'help')->>'result',
  'badLetters',
  'submit_word: word using non-puzzle letters returns "badLetters"'
);

select is(
  spellingbee.submit_word((select id from g), 'badg')->>'result',
  'missingCenter',
  'submit_word: word without center letter returns "missingCenter"'
);

select is(
  spellingbee.submit_word((select id from g), 'bcde')->>'result',
  'notAWord',
  'submit_word: valid-letter word not in required/legal returns "notAWord"'
);

-- None of those soft-rejected attempts inserted a row.
select is(
  (select count(*) from spellingbee.found_words
    where game_id = (select id from g)
      and word in ('be', 'help', 'badg', 'bcde')),
  0::bigint,
  'soft rejections do not insert found_words rows'
);

-- ============================================================
-- (5) Coop duplicate: once anyone finds 'bead', everyone
-- attempting it gets 'alreadyFound'
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  spellingbee.submit_word((select id from g), 'bead')->>'result',
  'alreadyFound',
  'coop duplicate: bea cannot re-submit a word ada already found'
);

-- ============================================================
-- (6) Hard rejection: cade isn't in this game's player list
-- ============================================================
-- Wait — cade IS in player_user_ids from setup. Let's use dee
-- (the outsider) for this assertion.

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select spellingbee.submit_word(%L::uuid, 'feed') $$, (select id from g)),
  '42501',
  null,
  'submit_word: non-player (dee, outsider) is rejected with 42501'
);

-- ============================================================
-- (7) Compete duplicate semantics: per-player ownership
-- ============================================================
-- Separate compete game in the same club. ada finds 'bead';
-- bea ALSO finds 'bead' (allowed); ada tries 'bead' again
-- (rejected).
--
-- target_rank=2 (Solid; needs ≥12 / 50 = 24%) is chosen so the
-- single pangram submission below (17 points) trips the
-- target-rank-hit terminal in one move — no bulk inserts
-- needed.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table compete_g on commit drop as
select * from spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup() || '{"target_rank": 2}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.spellingbee_board()
);

select is(
  spellingbee.submit_word((select id from compete_g), 'bead')->>'result',
  'accepted',
  'compete: ada''s first submission of "bead" is accepted'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  spellingbee.submit_word((select id from compete_g), 'bead')->>'result',
  'accepted',
  'compete: bea ALSO finds "bead" (per-player ownership; not blocked by ada''s find)'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  spellingbee.submit_word((select id from compete_g), 'bead')->>'result',
  'alreadyFound',
  'compete: ada''s SECOND submission of "bead" is "alreadyFound" (same-player rule)'
);

-- ============================================================
-- (8) Compete win: ada submits the pangram → 'won_compete'
-- ============================================================
-- target_rank=2 (Solid) needs ≥12 / 50 = 24%. After bead (1pt)
-- + pangram (17pt) = 18pt → rank_idx=3 (Nice), which is ≥
-- target_rank=2, triggering the terminal flip.

select is(
  spellingbee.submit_word((select id from compete_g), 'abcdefg')->>'result',
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
-- (9) Post-terminal submission is rejected with P0001
-- ============================================================

select throws_ok(
  format($$ select spellingbee.submit_word(%L::uuid, 'face') $$, (select id from compete_g)),
  'P0001',
  'game is not in progress',
  'post-terminal submit_word raises P0001'
);

-- ============================================================
-- (10) Coop has NO auto-terminal — players keep going past
--      required_words_count; only timer / manual end terminate
-- ============================================================
-- spellingbee-ws's coop loop never auto-ends on "all required words
-- found" (sessions.js submitWord has no such check). This port
-- matches: players who exhaust the required set keep finding
-- bonus words; the rank stays at Genius; the Words counter
-- overshoots Y. Terminal comes from timer or the End-game menu
-- item only.
--
-- Sanity: bulk-insert the rest of the required set and verify
-- play_state stays 'playing' — no auto-flip.

reset role;
insert into spellingbee.found_words (game_id, user_id, word, points, is_pangram, is_bonus)
  select
    (select id from g),
    'ada11111-1111-1111-1111-111111111111'::uuid,
    sw->>'word',
    (sw->>'points')::int,
    (sw->>'is_pangram')::boolean,
    false
  from jsonb_array_elements(pg_temp.spellingbee_board()->'required_words') sw
  where sw->>'word' not in ('bead', 'abcdefg')
    and not exists (
      select 1 from spellingbee.found_words fw
      where fw.game_id = (select id from g)
        and fw.word = sw->>'word'
    );

-- Drop one and re-submit via RPC to exercise the aggregate
-- recount + status-write path with the count at required_words_count.
delete from spellingbee.found_words
 where game_id = (select id from g) and word = 'bfeg';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  spellingbee.submit_word((select id from g), 'bfeg')->>'result',
  'accepted',
  'coop: 30th required word returns "accepted"'
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

-- A bonus word ALSO submits successfully past 100% — the
-- score climbs above required_words_score, and the rank clamps to
-- Genius (max=6). 'abcdef' is in bonus_words (per setup.psql)
-- and hasn't been submitted yet in this test file.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  spellingbee.submit_word((select id from g), 'abcdef')->>'result',
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
-- (10b) submit_timeout: terminal 'ended' outcome='timeout'
-- ============================================================
-- Fresh coop game to exercise the timeout path. (The other
-- two are already terminal.)

reset role;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table timeout_g on commit drop as
select * from spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup() || '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop',
  pg_temp.spellingbee_board()
);

-- One submission so the score isn't zero (proves the timeout
-- captures the current state).
select is(
  spellingbee.submit_word((select id from timeout_g), 'face')->>'result',
  'accepted',
  'submit_word: face accepted in timeout-game setup'
);

-- Snapshot the spellingbee.games row's system xmin (the transaction
-- id of the row's current version) before submit_timeout. The
-- post-timeout assertion below checks it changed — proving the
-- RPC touched the row, which is what fires the Realtime event
-- the FE's useGame depends on for the post-terminal wordlist
-- reveal. See the "realtime touch" notes in migration
-- 20260617000000_spellingbee.sql for the longer story.
reset role;
-- ctid is the row's physical tuple location; an UPDATE writes a
-- new tuple at a new ctid, even within the same transaction
-- (which is what xmin would NOT show — xmin reflects the
-- creating transaction id and stays constant for same-xact
-- updates). pgTAP wraps every test file in BEGIN/ROLLBACK, so
-- ctid is the right signal here.
create temp table ctid_before (prev_ctid tid) on commit drop;
insert into ctid_before (prev_ctid)
  select ctid from spellingbee.games where id = (select id from timeout_g);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select spellingbee.submit_timeout((select id from timeout_g));

reset role;
select isnt(
  (select ctid from spellingbee.games where id = (select id from timeout_g)),
  (select prev_ctid from ctid_before),
  'submit_timeout: touches spellingbee.games (ctid changes) so the FE Realtime sub wakes up — required for post-terminal required_words reveal'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

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

-- Idempotency: a second call raises P0001. The FE swallows
-- this when peers race the countdown expiry.
select throws_ok(
  format($$ select spellingbee.submit_timeout(%L::uuid) $$, (select id from timeout_g)),
  'P0001',
  'game is not in progress',
  'submit_timeout: second call raises P0001 (idempotent at the FE-swallow layer)'
);

-- Post-terminal: games_state surfaces the hidden required_words
-- answer key via the _required_words_for helper's CASE-on-
-- is_terminal gate. Previously asserted in the now-removed
-- 100%-found block; the conditional-reveal is mode-agnostic
-- (any terminal opens it), so the timeout-terminated game
-- exercises it the same way. (bonus_words is never revealed.)
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select jsonb_array_length(required_words) from spellingbee.games_state
    where id = (select id from timeout_g)),
  30,
  'post-terminal: games_state.required_words materializes (30 required entries)'
);

-- ============================================================
-- (12) spellingbee.end_game: manual terminal
-- ============================================================
-- The "End game" menu item fires this. Flips play_state='ended'
-- with status.outcome='manual', distinct from timeout/completed
-- so a future status-aware label can frame the modal copy
-- specifically. Same Realtime-touch trick as submit_timeout
-- (no per-gametype write would otherwise wake useGame).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table end_g on commit drop as
select * from spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop',
  pg_temp.spellingbee_board()
);

-- One required submission so the end-game status carries a real
-- score (proves end_game captures the live aggregate, not the
-- create-time zero).
select is(
  spellingbee.submit_word((select id from end_g), 'bead')->>'result',
  'accepted',
  'submit_word: bead accepted in end_game setup'
);

-- Snapshot ctid for the Realtime-touch assertion below.
reset role;
create temp table end_ctid_before (prev_ctid tid) on commit drop;
insert into end_ctid_before (prev_ctid)
  select ctid from spellingbee.games where id = (select id from end_g);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select spellingbee.end_game((select id from end_g));

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

reset role;
select isnt(
  (select ctid from spellingbee.games where id = (select id from end_g)),
  (select prev_ctid from end_ctid_before),
  'end_game: touches spellingbee.games (ctid changes) so the FE Realtime sub wakes up — same trick as submit_timeout'
);

-- Idempotency: a second call raises P0001. Matches the
-- timeout-race UX — clicking End game twice in quick succession
-- is harmless.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select spellingbee.end_game(%L::uuid) $$, (select id from end_g)),
  'P0001',
  'game is not in progress',
  'end_game: second call raises P0001 (idempotent at the FE-swallow layer)'
);

-- Auth: dee (outsider) cannot call end_game even though it's a
-- "just stop the game" action. The require_game_player gate
-- treats it the same as submit_word — a club outsider can't
-- end a game they're not in.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

-- Fresh game for the auth assertion (the previous one is
-- terminal and would short-circuit on play_state).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table auth_g on commit drop as
select * from spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop',
  pg_temp.spellingbee_board()
);

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select spellingbee.end_game(%L::uuid) $$, (select id from auth_g)),
  '42501',
  null,
  'end_game: non-player (dee, outsider) is rejected with 42501'
);

-- ============================================================
select * from finish();
rollback;
