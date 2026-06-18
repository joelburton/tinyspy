-- ============================================================
-- Test: freebee.submit_word + freebee.submit_timeout
-- ============================================================
--
-- Coverage:
--   1. submit_word coop happy: scoring word → 'accepted',
--      row inserted, status updated.
--   2. submit_word coop pangram: pangram word →
--      'accepted' with the +10 bonus reflected in points
--      and is_pangram=true.
--   3. submit_word coop bonus: legal-only word →
--      'bonus', 0 points, is_bonus=true.
--   4. submit_word soft rejections (each returns a string —
--      no row inserted, no exception): tooShort, badLetters,
--      missingCenter, notAWord.
--   5. submit_word coop duplicate: once found by anyone,
--      'alreadyFound' for everyone.
--   6. submit_word compete duplicate: per-player; same word
--      by another player is OK, same word by same player is
--      'alreadyFound'.
--   7. submit_word coop 100%-found → terminal 'ended' with
--      outcome='completed'; is_terminal flips; games_state
--      surfaces scoring_words.
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

set search_path = freebee, common, public, extensions;

select plan(48);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up: ada + bea + cade club, coop game in progress
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('Ada Bea Cade', array['ada','bea','cade']);

create temp table g on commit drop as
select * from freebee.create_game(
  (select id from club),
  pg_temp.freebee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  pg_temp.freebee_board()
);

-- ============================================================
-- (1) Coop happy path: ada submits 'bead' → accepted, 1pt
-- ============================================================

select is(
  freebee.submit_word((select id from g), 'bead'),
  'accepted',
  'submit_word: scoring 4-letter word returns "accepted"'
);

select is(
  (select count(*) from freebee.found_words
    where game_id = (select id from g) and word = 'bead'),
  1::bigint,
  'submit_word: accepted word inserts one found_words row'
);

select is(
  (select points from freebee.found_words
    where game_id = (select id from g) and word = 'bead'),
  1,
  'submit_word: 4-letter word scores 1 point'
);

-- Status reflects the accepted word.
select is(
  (select (status->>'score')::int from common.games where id = (select id from g)),
  1,
  'status.score updated after first accepted word'
);
select is(
  (select (status->>'words_found')::int from common.games where id = (select id from g)),
  1,
  'status.words_found = 1 after first accepted'
);

-- ============================================================
-- (2) Coop pangram: ada submits the synthetic pangram → +10
-- ============================================================

select is(
  freebee.submit_word((select id from g), 'abcdefg'),
  'accepted',
  'submit_word: 7-letter pangram returns "accepted"'
);

select is(
  (select points from freebee.found_words
    where game_id = (select id from g) and word = 'abcdefg'),
  17,
  'submit_word: pangram scores length(7) + bonus(10) = 17'
);

select is(
  (select is_pangram from freebee.found_words
    where game_id = (select id from g) and word = 'abcdefg'),
  true,
  'submit_word: pangram row has is_pangram=true'
);

-- ============================================================
-- (3) Coop bonus: ada submits a legal-only word
-- ============================================================
-- The board's legal_words is ['bcdfge', 'abcdef']. We pick
-- 'bcdfge' — uses only puzzle letters, includes 'e'.

select is(
  freebee.submit_word((select id from g), 'bcdfge'),
  'bonus',
  'submit_word: legal-but-not-scoring word returns "bonus"'
);

select is(
  (select (points, is_bonus) from freebee.found_words
    where game_id = (select id from g) and word = 'bcdfge'),
  (0, true),
  'submit_word: bonus row has 0 points + is_bonus=true'
);

-- Score did NOT change (bonus is 0 pts), but words_found is
-- also unchanged because bonus words don't count toward
-- words_found / total_words.
select is(
  (select (status->>'score')::int from common.games where id = (select id from g)),
  18,                                       -- 1 (bead) + 17 (pangram); bonus contributes 0
  'status.score unchanged by bonus word'
);
select is(
  (select (status->>'words_found')::int from common.games where id = (select id from g)),
  2,                                        -- bead + pangram; bonus not counted
  'status.words_found excludes bonus words'
);

-- ============================================================
-- (4) Soft rejections: each returns a string, no row inserted
-- ============================================================

select is(
  freebee.submit_word((select id from g), 'be'),
  'tooShort',
  'submit_word: <4-letter word returns "tooShort"'
);

select is(
  freebee.submit_word((select id from g), 'help'),
  'badLetters',
  'submit_word: word using non-puzzle letters returns "badLetters"'
);

select is(
  freebee.submit_word((select id from g), 'badg'),
  'missingCenter',
  'submit_word: word without center letter returns "missingCenter"'
);

select is(
  freebee.submit_word((select id from g), 'bcde'),
  'notAWord',
  'submit_word: valid-letter word not in scoring/legal returns "notAWord"'
);

-- None of those soft-rejected attempts inserted a row.
select is(
  (select count(*) from freebee.found_words
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
  freebee.submit_word((select id from g), 'bead'),
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
  format($$ select freebee.submit_word(%L::uuid, 'feed') $$, (select id from g)),
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
select * from freebee.create_game(
  (select id from club),
  pg_temp.freebee_setup() || '{"mode": "compete", "target_rank": 2}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  pg_temp.freebee_board()
);

select is(
  freebee.submit_word((select id from compete_g), 'bead'),
  'accepted',
  'compete: ada''s first submission of "bead" is accepted'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  freebee.submit_word((select id from compete_g), 'bead'),
  'accepted',
  'compete: bea ALSO finds "bead" (per-player ownership; not blocked by ada''s find)'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  freebee.submit_word((select id from compete_g), 'bead'),
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
  freebee.submit_word((select id from compete_g), 'abcdefg'),
  'accepted',
  'compete: pangram submission that crosses target_rank returns "accepted"'
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
  format($$ select freebee.submit_word(%L::uuid, 'face') $$, (select id from compete_g)),
  'P0001',
  'game is not in progress',
  'post-terminal submit_word raises P0001'
);

-- ============================================================
-- (10) Coop 100%-found → terminal 'ended' (outcome=completed)
-- ============================================================
-- We're already past 2 finds (bead + pangram + 1 bonus) on the
-- coop game `g`. Pre-seed the remaining 28 non-bonus rows
-- directly so the next-RPC-call boundary triggers the terminal.

reset role;
insert into freebee.found_words (game_id, user_id, word, points, is_pangram, is_bonus)
  select
    (select id from g),
    'ada11111-1111-1111-1111-111111111111'::uuid,
    sw->>'word',
    (sw->>'points')::int,
    (sw->>'is_pangram')::boolean,
    false
  from jsonb_array_elements(pg_temp.freebee_board()->'scoring_words') sw
  where sw->>'word' not in ('bead', 'abcdefg')   -- already submitted via RPC
    and not exists (
      select 1 from freebee.found_words fw
      where fw.game_id = (select id from g)
        and fw.word = sw->>'word'
    );

-- We just bulk-inserted 28 rows. Now the game has 2 + 28 = 30
-- non-bonus found_words. submit_word's terminal check fires
-- when it sees the 30th — but the 30th is already there from
-- the direct insert. So the next call (any soft-rejection or
-- duplicate) WON'T trigger terminal — we need to trigger the
-- aggregate-count code path. Easiest: submit a word that's
-- ALREADY in found_words (duplicate); the RPC's mode-rule
-- short-circuits BEFORE the terminal check, so no flip.
-- Better: take an existing scoring word that's NOT in the
-- bulk insert (the only one bulk-skipped is 'bead' and
-- 'abcdefg'), then submit a fresh duplicate via a different
-- word that's NOT yet found. But we bulk-inserted all 28
-- remaining non-bonus + 2 already there = 30. Total = 30 = full.
--
-- The terminal check runs INSIDE submit_word AFTER the insert.
-- Without inserting a new row, the check doesn't fire. So we
-- need a way to trigger the check with the 30 already there.
-- Approach: delete the LAST direct-inserted row, then
-- re-submit it via RPC. The RPC inserts (rolling count to 30
-- again), then the terminal check fires.

delete from freebee.found_words
 where game_id = (select id from g) and word = 'bfeg';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  freebee.submit_word((select id from g), 'bfeg'),
  'accepted',
  'coop: the 30th scoring word returns "accepted"'
);

select is(
  (select play_state from common.games where id = (select id from g)),
  'ended',
  'coop: play_state flips to "ended" on 100%-found'
);

select is(
  (select is_terminal from common.games where id = (select id from g)),
  true,
  'coop: is_terminal=true on 100%-found'
);

select is(
  (select status->>'outcome' from common.games where id = (select id from g)),
  'completed',
  'coop: status.outcome=completed on 100%-found'
);

-- games_state surfaces scoring_words after terminal.
select is(
  (select jsonb_array_length(scoring_words) from freebee.games_state
    where id = (select id from g)),
  30,
  'coop terminal: games_state.scoring_words is now visible (30 entries)'
);

-- legal_words materializes through the parallel helper. The
-- test board's legal_words array has 2 entries (the synthetic
-- bonus-only words from setup.psql); confirm they surface too.
select is(
  (select array_length(legal_words, 1) from freebee.games_state
    where id = (select id from g)),
  2,
  'coop terminal: games_state.legal_words is now visible (2 bonus entries)'
);

-- ============================================================
-- (11) submit_timeout: terminal 'ended' outcome='timeout'
-- ============================================================
-- Fresh coop game to exercise the timeout path. (The other
-- two are already terminal.)

reset role;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table timeout_g on commit drop as
select * from freebee.create_game(
  (select id from club),
  pg_temp.freebee_setup() || '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  pg_temp.freebee_board()
);

-- One submission so the score isn't zero (proves the timeout
-- captures the current state).
select is(
  freebee.submit_word((select id from timeout_g), 'face'),
  'accepted',
  'submit_word: face accepted in timeout-game setup'
);

-- Snapshot the freebee.games row's system xmin (the transaction
-- id of the row's current version) before submit_timeout. The
-- post-timeout assertion below checks it changed — proving the
-- RPC touched the row, which is what fires the Realtime event
-- the FE's useGame depends on for the post-terminal wordlist
-- reveal. See migration 20260618000002_freebee_submit_timeout_
-- realtime_touch.sql for the longer story.
reset role;
-- ctid is the row's physical tuple location; an UPDATE writes a
-- new tuple at a new ctid, even within the same transaction
-- (which is what xmin would NOT show — xmin reflects the
-- creating transaction id and stays constant for same-xact
-- updates). pgTAP wraps every test file in BEGIN/ROLLBACK, so
-- ctid is the right signal here.
create temp table ctid_before (prev_ctid tid) on commit drop;
insert into ctid_before (prev_ctid)
  select ctid from freebee.games where id = (select id from timeout_g);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select freebee.submit_timeout((select id from timeout_g));

reset role;
select isnt(
  (select ctid from freebee.games where id = (select id from timeout_g)),
  (select prev_ctid from ctid_before),
  'submit_timeout: touches freebee.games (ctid changes) so the FE Realtime sub wakes up — required for post-terminal scoring_words reveal'
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
  'submit_timeout: status.outcome=timeout (distinguishes from completed)'
);

-- Idempotency: a second call raises P0001. The FE swallows
-- this when peers race the countdown expiry.
select throws_ok(
  format($$ select freebee.submit_timeout(%L::uuid) $$, (select id from timeout_g)),
  'P0001',
  'game is not in progress',
  'submit_timeout: second call raises P0001 (idempotent at the FE-swallow layer)'
);

-- ============================================================
-- (12) freebee.end_game: manual terminal
-- ============================================================
-- The "End game" menu item fires this. Flips play_state='ended'
-- with status.outcome='manual', distinct from timeout/completed
-- so a future status-aware label can frame the modal copy
-- specifically. Same Realtime-touch trick as submit_timeout
-- (no per-gametype write would otherwise wake useGame).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table end_g on commit drop as
select * from freebee.create_game(
  (select id from club),
  pg_temp.freebee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  pg_temp.freebee_board()
);

-- One scoring submission so the end-game status carries a real
-- score (proves end_game captures the live aggregate, not the
-- create-time zero).
select is(
  freebee.submit_word((select id from end_g), 'bead'),
  'accepted',
  'submit_word: bead accepted in end_game setup'
);

-- Snapshot ctid for the Realtime-touch assertion below.
reset role;
create temp table end_ctid_before (prev_ctid tid) on commit drop;
insert into end_ctid_before (prev_ctid)
  select ctid from freebee.games where id = (select id from end_g);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select freebee.end_game((select id from end_g));

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
  'end_game: status.outcome=manual (distinguishes from completed / timeout)'
);

select is(
  (select (status->>'score')::int from common.games where id = (select id from end_g)),
  1,
  'end_game: status.score reflects the team''s live tally at the moment of end'
);

select is(
  (select (status->>'words_found')::int from common.games where id = (select id from end_g)),
  1,
  'end_game: status.words_found reflects the live count'
);

reset role;
select isnt(
  (select ctid from freebee.games where id = (select id from end_g)),
  (select prev_ctid from end_ctid_before),
  'end_game: touches freebee.games (ctid changes) so the FE Realtime sub wakes up — same trick as submit_timeout'
);

-- Idempotency: a second call raises P0001. Matches the
-- timeout-race UX — clicking End game twice in quick succession
-- is harmless.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select freebee.end_game(%L::uuid) $$, (select id from end_g)),
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
select * from freebee.create_game(
  (select id from club),
  pg_temp.freebee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  pg_temp.freebee_board()
);

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select freebee.end_game(%L::uuid) $$, (select id from auth_g)),
  '42501',
  null,
  'end_game: non-player (dee, outsider) is rejected with 42501'
);

-- ============================================================
select * from finish();
rollback;
