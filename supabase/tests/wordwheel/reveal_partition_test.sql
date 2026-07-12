-- ============================================================
-- Test: wordwheel post-terminal reveal — the cat-A / cat-B data
--       contract the WordList + PlayArea rely on
-- ============================================================
--
-- A fork of spellingbee's reveal_partition_test. The FE's post-game
-- WordList splits every word into two stylable buckets:
--
--   cat A — words *I* (the viewer) found.
--   cat B — everything else, merged: words found by *other* players +
--           the non-bonus required words nobody found.
--
-- That render is correct only if the DB hands each player, at game end,
-- exactly the rows it needs to compute the split:
--
--   1. Their OWN found_words (cat A source).
--   2. Their PEERS' found_words (cat B "found by others") — RLS hides
--      these mid-game and opens them once is_terminal.
--   3. games_state.required_words (cat B "nobody found" source).
--
-- This file proves the end-to-end contract through the real RPCs from
-- the perspective the suite doesn't otherwise cover: the LOSER of a
-- compete race that a DIFFERENT player ended by hitting the target rank.
--
-- It also pins the DB fact behind the PlayArea caller-only-score fix:
-- post-terminal, summing EVERY visible found_words row no longer equals
-- the caller's own score — so the FE must filter to self in compete.
--
-- THE FORK numbers: the pangram 'abcdefghi' scores 24 (9 + 15); the
-- fixture required list has 19 entries; required_words_score = 62.
--
-- Personas: ada (winner), bea (the loser / viewer of interest), cade
-- (a third player, so cat B has a non-winner peer in it too).

begin;

set search_path = wordwheel, common, public, extensions;

select plan(11);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Fixture: ada + bea + cade club; compete game targeting rank 2
-- (Solid, ≥15 / 62). The synthetic pangram 'abcdefghi' (24 pt) trips
-- the target in a single move, so ada can end the race deterministically
-- on her first and only submission.
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Reveal club',
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

-- ── Pre-win submissions ─────────────────────────────────────
-- bea finds two words (bead = 1pt, beach = 5pt → 6pt total);
-- cade finds one (ache = 1pt). ada has not submitted yet, so the
-- race is still live.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordwheel.submit_word((select id from g), 'bead', 1, false, false);
select wordwheel.submit_word((select id from g), 'beach', 5, false, false);

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select wordwheel.submit_word((select id from g), 'ache', 1, false, false);

-- ============================================================
-- (1)–(3) Mid-game, as bea: cat A populated, cat B empty, answer key present
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

select is(
  (select count(*) from wordwheel.found_words
    where game_id = (select id from g)),
  2::bigint,
  'compete mid-game / bea: sees exactly her own 2 finds (cat A)'
);

select is(
  (select count(*) from wordwheel.found_words
    where game_id = (select id from g)
      and user_id <> 'bea22222-2222-2222-2222-222222222222'),
  0::bigint,
  'compete mid-game / bea: zero peer rows visible — cat B is empty during play'
);

select is(
  (select jsonb_array_length(required_words) from wordwheel.games_state
    where id = (select id from g)),
  19,
  'compete mid-game / bea: games_state.required_words is present (un-gated; FE gates the reveal on isTerminal)'
);

-- ============================================================
-- (4) ada ends the race by hitting the target rank
-- ============================================================
-- 'abcdefghi' = 24pt → 24/62 = rank 3 (Nice) ≥ target 2. This is the
-- target-rank-win terminal path specifically (not timeout / manual).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordwheel.submit_word((select id from g), 'abcdefghi', 24, true, false);

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'won_compete',
  'compete: ada''s target-rank hit flips the game to won_compete (terminal)'
);

-- ============================================================
-- (5)–(8) Post-terminal, as bea (the LOSER): the reveal opens.
-- ============================================================
-- Four rows total: bea's 2 (cat A) + cade's ache + ada's winning
-- pangram (the latter two are cat B "found by others").

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

select is(
  (select count(*) from wordwheel.found_words
    where game_id = (select id from g)),
  4::bigint,
  'compete post-terminal / bea (loser): all 4 finds now visible (branch c: is_terminal)'
);

select is(
  (select count(*) from wordwheel.found_words
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  2::bigint,
  'compete post-terminal / bea: cat A = her own 2 finds, still partitionable by user_id'
);

select is(
  (select count(*) from wordwheel.found_words
    where game_id = (select id from g)
      and user_id <> 'bea22222-2222-2222-2222-222222222222'),
  2::bigint,
  'compete post-terminal / bea: cat B "found by others" = cade''s + ada''s 2 finds'
);

-- The winner's specific find is visible to the loser.
select ok(
  exists (
    select 1 from wordwheel.found_words
     where game_id = (select id from g)
       and user_id = 'ada11111-1111-1111-1111-111111111111'
       and word = 'abcdefghi'
  ),
  'compete post-terminal / bea: sees the winner ada''s race-ending pangram'
);

-- ============================================================
-- (9) Post-terminal, as bea: the required answer key materializes
-- ============================================================

select is(
  (select jsonb_array_length(required_words) from wordwheel.games_state
    where id = (select id from g)),
  19,
  'compete post-terminal / bea: games_state.required_words materializes (19 entries) — cat B "nobody found" source'
);

-- ============================================================
-- (10)–(11) Why PlayArea must filter to self in compete
-- ============================================================
-- Summing all visible rows post-terminal would jump bea's score from
-- her own 6pt to 31pt (6 + cade's 1 + ada's 24) at the instant the game
-- ends. These assertions pin both numbers so the divergence is explicit.

select is(
  (select coalesce(sum(points), 0) from wordwheel.found_words
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  6::bigint,
  'compete post-terminal / bea: caller-only score (cat A points) = 6'
);

select is(
  (select coalesce(sum(points), 0) from wordwheel.found_words
    where game_id = (select id from g)),
  31::bigint,
  'compete post-terminal / bea: sum over ALL visible rows = 31 ≠ 6 — FE must filter to self, not lean on RLS'
);

-- ============================================================
select * from finish();
rollback;
