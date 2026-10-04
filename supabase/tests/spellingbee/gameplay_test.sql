-- cs-blessed-spellingbee

-- ============================================================
-- Test: spellingbee.submit_word + spellingbee.submit_timeout + stop_game
-- ============================================================
--
-- submit_word is trusting-commit: the FE validated the word against the board's
-- shipped legal list and scored it, so the RPC takes (word, points, is_pangram,
-- is_bonus), trusts them, and only enforces the live-game check, dedups, records,
-- and recomputes aggregates / the compete win. It does NOT validate word content
-- (too short, a letter off the hive, the center missing, not a word). Its `ok`
-- is { result, points }, result = pangram / bonus / accepted / won; a duplicate
-- is a race not-ok.
--
-- Coverage, by section:
--   1. coop happy: required word → 'accepted', row inserted, the blobs rewritten.
--   2. coop pangram: trusted is_pangram → 'pangram', points as given.
--   3. coop bonus: trusted is_bonus → 'bonus', scored as given;
--      3b a bonus word with is_pangram=true → 'pangram'.
--   4. coop duplicate → the race refusal.
--   5. a non-player is refused.
--   6. compete duplicate is per-player.
--   7. compete target-rank hit → 'won', reached_goal / target, the winner named.
--   8. a submit after the end is the game-over race.
--   9. coop has NO automatic ending past n_reqd_words.
--  10. submit_timeout: ended, reason 'timeout', idempotent, the blobs
--      rewritten, and game_data still carrying the words.
--  11. stop_game: ended, reason 'stopped', the live tally, idempotent, the
--      blobs rewritten, and a non-player refused.
--  12. a word into a game deleted under it is the shared race (PN485).
--
-- See ../codenamesduet/create_game_test.sql for the pgTAP primer.

begin;

set search_path = spellingbee, common, public, extensions;

select plan(50);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- Set up: ada + bea + cade club, coop game in progress
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;

create temp table g on commit drop as
select (spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop',
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id;

-- ============================================================
-- (1) Coop happy path: ada submits 'bead' → accepted, 1pt
-- ============================================================

-- Capture the return so we assert both halves of the { result, points } shape.
create temp table bead_ret on commit drop as
select spellingbee.submit_word((select id from g), 'bead', 1, false, false) as ret;
select is(
  (select ret->'data'->>'result' from bead_ret),
  'accepted',
  'submit_word: required word (is_bonus/is_pangram false) → "accepted"'
);
select is(
  (select (ret->'data'->>'points')::int from bead_ret),
  1,
  'submit_word: return echoes the trusted points (bead = 1)'
);
-- No outcome and no message: the frontend says what a word is worth
-- (src/spellingbee/lib/answer.ts, whose test names this file).
select is((select ret->>'outcome' from bead_ret), null::text,
  'submit_word: an accepted word carries no outcome');
select is((select ret->>'message' from bead_ret), null::text,
  'submit_word: an accepted word carries no message');

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
  'submit_word: row stores the trusted points'
);

-- The summary reflects the accepted word.
select is(
  (select (summary_data->'team'->>'foundWordsScore')::int from common.games where id = (select id from g)),
  1,
  'summary_data team score updated after first accepted word'
);
select is(
  (select (summary_data->'team'->>'nFoundWords')::int from common.games where id = (select id from g)),
  1,
  'summary_data team count = 1 after first accepted'
);

-- ============================================================
-- (2) Coop pangram: ada submits the pangram (trusted +10)
-- ============================================================

select is(
  spellingbee.submit_word((select id from g), 'abcdefg', 17, true, false)->'data'->>'result',
  'pangram',
  'submit_word: is_pangram=true → result "pangram"'
);

select is(
  (select points from spellingbee.found_words
    where game_id = (select id from g) and word = 'abcdefg'),
  17,
  'submit_word: pangram row stores the trusted 17 points'
);

select is(
  (select is_pangram from spellingbee.found_words
    where game_id = (select id from g) and word = 'abcdefg'),
  true,
  'submit_word: pangram row has is_pangram=true'
);

-- ============================================================
-- (3) Coop bonus: ada submits a legal-only word (is_bonus true)
-- ============================================================

select is(
  spellingbee.submit_word((select id from g), 'bcdfge', 6, false, true)->'data'->>'result',
  'bonus',
  'submit_word: is_bonus=true → result "bonus"'
);

select is(
  (select (points, is_bonus, is_pangram) from spellingbee.found_words
    where game_id = (select id from g) and word = 'bcdfge'),
  (6, true, false),
  'submit_word: bonus row stores trusted points (6), is_bonus=true, not a pangram'
);

-- Score advances WITH the bonus points; count includes all rows.
select is(
  (select (summary_data->'team'->>'foundWordsScore')::int from common.games where id = (select id from g)),
  24,                                       -- 1 (bead) + 17 (pangram) + 6 (bonus)
  'summary_data team score includes bonus-word points'
);
select is(
  (select (summary_data->'team'->>'nFoundWords')::int from common.games where id = (select id from g)),
  3,                                        -- bead + pangram + bonus (all counted)
  'summary_data team count counts ALL submissions incl. bonus (overshoot OK)'
);

-- ── (3b) Bonus pangram: is_bonus AND is_pangram both true ──
select is(
  spellingbee.submit_word((select id from g), 'gfedcba', 17, true, true)->'data'->>'result',
  'pangram',
  'submit_word: is_pangram wins over is_bonus in the result label ("pangram")'
);

select is(
  (select (points, is_bonus, is_pangram) from spellingbee.found_words
    where game_id = (select id from g) and word = 'gfedcba'),
  (17, true, true),
  'submit_word: bonus pangram stores (17, is_bonus=true, is_pangram=true)'
);

-- ============================================================
-- (4) Coop duplicate: once anyone finds 'bead', it is already found for everyone
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
-- A RACE: useFoundWordSubmit dedups locally and returns before committing, so
-- reaching this means its foundWords list was stale.
select pg_temp.envelope_is(
  spellingbee.submit_word((select id from g), 'bead', 1, false, false),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN360","message":"BEAD — already found"}'::jsonb,
  'coop duplicate: bea cannot re-submit a word ada already found'
);

-- ============================================================
-- (5) Hard rejection: dee (outsider) is not a player
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  spellingbee.submit_word((select id from g), 'feed', 1, false, false),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN253"}'::jsonb,
  'submit_word: non-player (dee, outsider) is rejected'
);

-- ============================================================
-- (6) Compete duplicate semantics: per-player ownership
-- ============================================================
-- target_rank=2 (Solid; ≥12/50=24%) so the pangram below (→18 pts, rank 3) trips
-- the target-rank ending in one move.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table compete_g on commit drop as
select (spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup() || '{"target_rank": 2}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id;

select is(
  spellingbee.submit_word((select id from compete_g), 'bead', 1, false, false)->'data'->>'result',
  'accepted',
  'compete: ada''s first submission of "bead" is accepted'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  spellingbee.submit_word((select id from compete_g), 'bead', 1, false, false)->'data'->>'result',
  'accepted',
  'compete: bea ALSO finds "bead" (per-player ownership)'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- A RACE: useFoundWordSubmit dedups locally and returns before committing, so
-- reaching this means its foundWords list was stale.
select pg_temp.envelope_is(
  spellingbee.submit_word((select id from compete_g), 'bead', 1, false, false),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN360","message":"BEAD — already found"}'::jsonb,
  'compete: ada''s SECOND "bead" is the already-found race (same-player rule)'
);

-- ============================================================
-- (7) Compete win: ada submits the pangram → reached_goal / target
-- ============================================================
-- bead (1) + pangram (17) = 18 → rank_idx 3 (Nice) ≥ target_rank 2 → the end.

select pg_temp.envelope_is(
  spellingbee.submit_word((select id from compete_g), 'abcdefg', 17, true, false),
  '{"type":"ok","data":{"result":"won"}}'::jsonb,
  'compete: the pangram that crosses target_rank answers "won", as coop does'
);

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from compete_g)),
  'reached_goal/target/won',
  'compete: the game ends reached_goal / target, won, when caller hits target_rank'
);

select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from compete_g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won',
  'compete: the caller who hit the rank is ranked 1, won'
);

select is(
  (select summary_data->'ending'->>'winner' from common.games where id = (select id from compete_g)),
  'ada11111-1111-1111-1111-111111111111',
  'compete: summary_data.ending.winner = caller who triggered the rank hit'
);

-- ============================================================
-- (8) A submission after the end is the game-over race (PN486)
-- ============================================================

-- A RACE, not a bug: the timer can expire or a rival can hit the target while
-- a submission is in flight.
select pg_temp.envelope_is(
  spellingbee.submit_word((select id from compete_g), 'face', 1, false, false),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN486","message":"Game over"}'::jsonb,
  'submit_word after the end is refused'
);

-- ============================================================
-- (9) Coop has NO automatic ending — players keep going past n_reqd_words
-- ============================================================
-- Bulk-insert the rest of the required set directly, drop one, and re-submit it
-- via the RPC to exercise the aggregate recount at the count-complete boundary.

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

delete from spellingbee.found_words
 where game_id = (select id from g) and word = 'bfeg';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  spellingbee.submit_word((select id from g), 'bfeg', 1, false, false)->'data'->>'result',
  'accepted',
  'coop: 30th required word returns "accepted"'
);

reset role;
select is(
  (select ended_at from common.games where id = (select id from g)),
  null,
  'coop: the game does not end past 100%-found (no automatic ending)'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g) and player_ended_at is not null),
  0,
  'coop: no player has ended past 100%-found'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  spellingbee.submit_word((select id from g), 'abcdef', 6, false, true)->'data'->>'result',
  'bonus',
  'coop: bonus word accepted after the required set is exhausted'
);

reset role;
select is(
  (select (summary_data->'team'->>'foundWordsScore')::int > (summary_data->>'reqdWordsScore')::int
     from common.games where id = (select id from g)),
  true,
  'coop: the team score can exceed reqd_words_score once bonus words are found'
);

select is(
  (select (summary_data->'team'->>'rankIdx')::int
     from common.games where id = (select id from g)),
  6,
  'coop: the team rank clamps at 6 (Genius) past reqd_words_score'
);

-- ============================================================
-- (10) submit_timeout: ended, reason 'timeout'
-- ============================================================

reset role;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table timeout_g on commit drop as
select (spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup() || '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop',
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id;

-- One submission so the score isn't zero (proves the timeout captures state).
select is(
  spellingbee.submit_word((select id from timeout_g), 'face', 1, false, false)->'data'->>'result',
  'accepted',
  'submit_word: face accepted in timeout-game setup'
);

-- Backdate the blobs' date, to see the ending rewrite them.
reset role;
update common.games set status_changed_at = now() - interval '1 hour'
 where id = (select id from timeout_g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select spellingbee.submit_timeout((select id from timeout_g));

reset role;
select is(
  (select status_changed_at from common.games where id = (select id from timeout_g)),
  now(),
  'submit_timeout: rewrites the blobs, so every client hears of the ending'
);

select is(
  (select game_ended_outcome from common.games where id = (select id from timeout_g)),
  'neutral',
  'submit_timeout: a coop game with no target ends neutral'
);

select isnt(
  (select ended_at from common.games where id = (select id from timeout_g)),
  null,
  'submit_timeout: the game has ended'
);

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from timeout_g)),
  'timeout/timeout',
  'submit_timeout: the reason is timeout'
);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- Idempotency: a second call is the game-over race (peers racing the countdown).
select pg_temp.envelope_is(
  spellingbee.submit_timeout((select id from timeout_g)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'submit_timeout: a second call is the game-over race');

-- game_data carries the full required list after the end as it did in play:
-- the page has it from game start.
select is(
  (select count(*)::int from jsonb_array_elements((select game_data->'puzzle'->'words' from common.games where id = (select id from timeout_g))) w
    where not (w->>'bonus')::boolean),
  30,
  'game_data.puzzle.words carries the required set (30 required entries)'
);

-- ============================================================
-- (11) spellingbee.stop_game: the Stop
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table end_g on commit drop as
select (spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop',
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id;

-- One required submission so stop_game captures a real live aggregate.
select is(
  spellingbee.submit_word((select id from end_g), 'bead', 1, false, false)->'data'->>'result',
  'accepted',
  'submit_word: bead accepted in stop_game setup'
);

reset role;
update common.games set status_changed_at = now() - interval '1 hour'
 where id = (select id from end_g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select spellingbee.stop_game((select id from end_g));

reset role;
select is(
  (select status_changed_at from common.games where id = (select id from end_g)),
  now(),
  'stop_game: rewrites the blobs, so every client hears of the ending'
);

select is(
  (select game_ended_outcome from common.games where id = (select id from end_g)),
  'neutral',
  'stop_game: the Stop is neutral'
);

select is(
  (select game_ended_by_user_id from common.games where id = (select id from end_g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'stop_game: the game has ended, by the caller'
);

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from end_g)),
  'stopped/stopped',
  'stop_game: the reason is stopped (distinguishes from timeout)'
);

select is(
  (select (summary_data->'team'->>'foundWordsScore')::int from common.games where id = (select id from end_g)),
  1,
  'stop_game: the summary''s team score is the live tally at the moment of end'
);

select is(
  (select (summary_data->'team'->>'nFoundWords')::int from common.games where id = (select id from end_g)),
  1,
  'stop_game: the club line''s found_words_count is the live count'
);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- Idempotency: a second call is the game-over race.
select pg_temp.envelope_is(
  spellingbee.stop_game((select id from end_g)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'stop_game: a second call is the game-over race');

-- Auth: dee (outsider) cannot end a game they're not in. Fresh game (the previous
-- one has ended and would short-circuit on that).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table auth_g on commit drop as
select (spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop',
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id;

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  spellingbee.stop_game((select id from auth_g)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'stop_game: non-player (dee, outsider) is rejected (PN253)');

-- ============================================================
-- (12) A word typed into a game a friend just deleted
-- ============================================================
-- The delete takes the game's rows and every membership together, so the
-- word is answered by the shared race rather than by a fault, or by
-- "You are not in this game" (docs/envelopes.md → a missing game row is PN485).

reset role;
delete from common.games where id = (select id from auth_g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  spellingbee.submit_word((select id from auth_g), 'bead', 1, false, false),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'submit_word: a game deleted under the word says so');

-- ============================================================
select * from finish();
rollback;
