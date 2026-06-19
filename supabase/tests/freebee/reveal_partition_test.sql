-- ============================================================
-- Test: freebee post-terminal reveal — the cat-A / cat-B data
--       contract the WordList + PlayArea rely on
-- ============================================================
--
-- The FE's post-game WordList stops using per-finder colors and
-- splits every word into two stylable buckets (see
-- src/freebee/components/WordList.tsx):
--
--   cat A — words *I* (the viewer) found.
--   cat B — everything else, merged: words found by *other*
--           players + the non-bonus scoring words nobody found.
--
-- That render is only correct if the DB hands each player, at
-- game end, exactly the rows it needs to compute the split:
--
--   1. Their OWN found_words (cat A source).
--   2. Their PEERS' found_words (cat B "found by others" source) —
--      which RLS hides mid-game and opens only once is_terminal.
--   3. games_state.scoring_words (cat B "nobody found" source) —
--      the answer key, gated to terminal by the same reveal as
--      coop.
--
-- The existing rls_test.sql proves the RLS branches in isolation
-- with direct INSERTs. This file proves the *end-to-end contract*
-- through the real RPCs, from the perspective that the suite
-- doesn't otherwise cover: the LOSER of a compete race that a
-- different player ended by hitting the target rank. That was the
-- one genuinely-uncertain piece — does the non-winner's client
-- actually receive peers + the reveal after a target-rank win
-- (vs. a timeout/manual end, already covered elsewhere)?
--
-- It also pins the DB fact behind the PlayArea caller-only-score
-- fix: post-terminal, summing EVERY visible found_words row (what
-- the old code did, leaning on "RLS keeps compete caller-only")
-- no longer equals the caller's own score — because peers' rows
-- are now visible. So the FE must filter to self in compete; the
-- final two assertions document exactly that divergence.
--
-- Personas: ada (winner), bea (the loser / viewer of interest),
-- cade (a third player, so cat B has a non-winner peer in it too).

begin;

set search_path = freebee, common, public, extensions;

select plan(11);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Fixture: ada + bea + cade club; compete game targeting rank 2
-- (Solid, ≥12 / 50). The synthetic pangram 'abcdefg' (17 pt)
-- trips the target in a single move, so ada can end the race
-- deterministically on her first and only submission.
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Reveal club',
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

-- ── Pre-win submissions ─────────────────────────────────────
-- bea finds two words (bead = 1pt, faced = 5pt → 6pt total);
-- cade finds one (beef = 1pt). ada has not submitted yet, so the
-- race is still live.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select freebee.submit_word((select id from g), 'bead');
select freebee.submit_word((select id from g), 'faced');

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select freebee.submit_word((select id from g), 'beef');

-- ============================================================
-- (1)–(3) Mid-game, as bea: cat A is populated, cat B is empty,
--         and the reveal is gated shut.
-- ============================================================
-- This is the precondition for the FE's "game over?" signal: the
-- WordList flips to the cat-A/cat-B model precisely when
-- games_state.scoring_words stops being NULL. Mid-game it must be
-- NULL, and bea must see only her own rows (branch b of the RLS
-- policy) — so cat B genuinely has nothing in it during play.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

select is(
  (select count(*) from freebee.found_words
    where game_id = (select id from g)),
  2::bigint,
  'compete mid-game / bea: sees exactly her own 2 finds (cat A)'
);

select is(
  (select count(*) from freebee.found_words
    where game_id = (select id from g)
      and user_id <> 'bea22222-2222-2222-2222-222222222222'),
  0::bigint,
  'compete mid-game / bea: zero peer rows visible — cat B is empty during play'
);

select ok(
  (select scoring_words from freebee.games_state
    where id = (select id from g)) is null,
  'compete mid-game / bea: games_state.scoring_words is NULL — reveal gated, FE stays in per-finder mode'
);

-- ============================================================
-- (4) ada ends the race by hitting the target rank
-- ============================================================
-- 'abcdefg' = 17pt → 17/50 = rank 2 (Solid) ≥ target 2. This is
-- the target-rank-win terminal path specifically (not timeout /
-- manual), which is what we want to exercise for bea-as-loser.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select freebee.submit_word((select id from g), 'abcdefg');

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'won_compete',
  'compete: ada''s target-rank hit flips the game to won_compete (terminal)'
);

-- ============================================================
-- (5)–(8) Post-terminal, as bea (the LOSER): the reveal opens.
-- ============================================================
-- bea did not end the game and did not win — yet branch c
-- (is_terminal) must now expose every player's finds to her, so
-- the WordList can render cat B "found by others." Four rows
-- total: bea's 2 (cat A) + cade's beef + ada's winning pangram
-- (the latter two are cat B "found by others").

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

select is(
  (select count(*) from freebee.found_words
    where game_id = (select id from g)),
  4::bigint,
  'compete post-terminal / bea (loser): all 4 finds now visible (branch c: is_terminal)'
);

select is(
  (select count(*) from freebee.found_words
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  2::bigint,
  'compete post-terminal / bea: cat A = her own 2 finds, still partitionable by user_id'
);

select is(
  (select count(*) from freebee.found_words
    where game_id = (select id from g)
      and user_id <> 'bea22222-2222-2222-2222-222222222222'),
  2::bigint,
  'compete post-terminal / bea: cat B "found by others" = cade''s + ada''s 2 finds'
);

-- The winner's specific find is visible to the loser — the exact
-- "what did the person who beat me get?" data the reveal exists
-- to surface.
select ok(
  exists (
    select 1 from freebee.found_words
     where game_id = (select id from g)
       and user_id = 'ada11111-1111-1111-1111-111111111111'
       and word = 'abcdefg'
  ),
  'compete post-terminal / bea: sees the winner ada''s race-ending pangram'
);

-- ============================================================
-- (9) Post-terminal, as bea: the scoring answer key materializes
-- ============================================================
-- The other half of cat B — "non-bonus words nobody found" — is
-- computed FE-side as (scoring_words − found_words). That requires
-- the full scoring list, which the games_state reveal now exposes.

select is(
  (select jsonb_array_length(scoring_words) from freebee.games_state
    where id = (select id from g)),
  30,
  'compete post-terminal / bea: games_state.scoring_words materializes (30 entries) — cat B "nobody found" source'
);

-- ============================================================
-- (10)–(11) Why PlayArea must filter to self in compete
-- ============================================================
-- The old score derivation summed EVERY visible found_words row,
-- relying on "RLS keeps compete caller-only." The two assertions
-- above (peers now visible post-terminal) break that assumption:
-- summing all rows would jump bea's score from her own 6pt to
-- 24pt (6 + cade's 1 + ada's 17) at the instant the game ends.
-- These assertions pin both numbers so the divergence is explicit
-- and a regression in either direction trips the test.

select is(
  (select coalesce(sum(points), 0) from freebee.found_words
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  6::bigint,
  'compete post-terminal / bea: caller-only score (cat A points) = 6'
);

select is(
  (select coalesce(sum(points), 0) from freebee.found_words
    where game_id = (select id from g)),
  24::bigint,
  'compete post-terminal / bea: sum over ALL visible rows = 24 ≠ 6 — FE must filter to self, not lean on RLS'
);

-- ============================================================
select * from finish();
rollback;
