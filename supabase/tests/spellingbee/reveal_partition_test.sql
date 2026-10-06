-- cs-blessed-spellingbee

-- ============================================================
-- Test: spellingbee end-of-game reveal — the cat-A / cat-B data
--       contract the WordList + PlayArea rely on
-- ============================================================
--
-- The post-game list (the shared common/word-list, rows from
-- shared/found-words/wordListRows) draws every word by who found it,
-- and the words nobody found in gray. Two buckets, named here for the
-- assertions:
--
--   cat A — words *I* (the viewer) found.
--   cat B — everything else: words found by *other* players + the
--           required words nobody found.
--
-- That render is only correct if the DB hands each player, at
-- game end, exactly the rows it needs to compute the split:
--
--   1. Their OWN found_words (cat A source).
--   2. Their PEERS' found_words (cat B "found by others" source) —
--      which the hook's seat rule withholds mid-race and opens once the
--      game has ended; the table shows a member every row.
--   3. game_data.puzzle.words (cat B "nobody found" source) —
--      the answer key, which ships from the start; the frontend
--      shows the missed words only at the end.
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
-- It also pins the DB fact behind PlayArea's caller-only score in
-- compete: once the game has ended, summing EVERY visible found_words row no
-- longer equals the caller's own score, because peers' rows are
-- visible by then. So the FE must filter to self rather than lean
-- on RLS; the final two assertions document exactly that divergence.
--
-- Personas: ada (winner), bea (the loser / viewer of interest),
-- cade (a third player, so cat B has a non-winner peer in it too).

begin;

set search_path = spellingbee, common, public, extensions;

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
select pg_temp.create_club('Reveal club',
  array['ada','bea','cade']) as handle;

create temp table g on commit drop as
select (spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup() || '{"target_rank": 2}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id;

-- ── Pre-win submissions ─────────────────────────────────────
-- bea finds two words (bead = 1pt, faced = 5pt → 6pt total);
-- cade finds one (beef = 1pt). ada has not submitted yet, so the
-- race is still live.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select spellingbee.submit_word((select id from g), 'bead', 1, false, false);
select spellingbee.submit_word((select id from g), 'faced', 5, false, false);

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select spellingbee.submit_word((select id from g), 'beef', 1, false, false);

-- ============================================================
-- (1)–(3) Mid-game, as bea: cat A is populated, cat B is empty (peer
--         found_words still RLS-hidden), and the answer key is present
--         (the reveal is now a client-side isTerminal gate).
-- ============================================================
-- The FE flips the WordList to the cat-A/cat-B model at `isTerminal` (from
-- common.games), NOT on required_words appearing — that ships from game start.
-- The table shows bea every racer's row; what keeps cat B "found by others"
-- empty in play is the hook's seat rule over game_data, not RLS.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

select is(
  (select count(*) from spellingbee.found_words
    where game_id = (select id from g)),
  3::bigint,
  'compete mid-game / bea: the table shows her every racer''s row (her 2 and cade''s 1) — the hook withholds, not RLS'
);

select is(
  (select count(*) from spellingbee.found_words
    where game_id = (select id from g)
      and user_id <> 'bea22222-2222-2222-2222-222222222222'),
  1::bigint,
  'compete mid-game / bea: a peer row is in the table; the page''s cat B stays empty by the hook''s seat rule'
);

select is(
  (select count(*)::int from jsonb_array_elements((select static_game_data->'puzzle'->'words' from common.games where id = (select id from g))) w
    where not (w->>'bonus')::boolean),
  30,
  'compete mid-game / bea: static_game_data.puzzle.words carries the required set (the page gates the reveal on the ending)'
);

-- ============================================================
-- (4) ada ends the race by hitting the target rank
-- ============================================================
-- 'abcdefg' = 17pt → 17/50 = rank 2 (Solid) ≥ target 2. This is
-- the target-rank-win ending specifically (not timeout /
-- manual), which is what we want to exercise for bea-as-loser.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select spellingbee.submit_word((select id from g), 'abcdefg', 17, true, false);

reset role;
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_by_user_id::text
     from common.games where id = (select id from g)),
  'reached_goal/target/ada11111-1111-1111-1111-111111111111',
  'compete: ada''s target-rank hit ends the game (reached_goal / target, by ada)'
);

-- ============================================================
-- (5)–(8) Once ended, as bea (the LOSER): the reveal opens.
-- ============================================================
-- bea did not end the game and did not win — yet branch 3
-- (ended_at) must now expose every player's finds to her, so
-- the WordList can render cat B "found by others." Four rows
-- total: bea's 2 (cat A) + cade's beef + ada's winning pangram
-- (the latter two are cat B "found by others").

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

select is(
  (select count(*) from spellingbee.found_words
    where game_id = (select id from g)),
  4::bigint,
  'compete, ended / bea (loser): all 4 finds now visible (branch 3: ended_at)'
);

select is(
  (select count(*) from spellingbee.found_words
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  2::bigint,
  'compete, ended / bea: cat A = her own 2 finds, still partitionable by user_id'
);

select is(
  (select count(*) from spellingbee.found_words
    where game_id = (select id from g)
      and user_id <> 'bea22222-2222-2222-2222-222222222222'),
  2::bigint,
  'compete, ended / bea: cat B "found by others" = cade''s + ada''s 2 finds'
);

-- The winner's specific find is visible to the loser — the exact
-- "what did the person who beat me get?" data the reveal exists
-- to surface.
select ok(
  exists (
    select 1 from spellingbee.found_words
     where game_id = (select id from g)
       and user_id = 'ada11111-1111-1111-1111-111111111111'
       and word = 'abcdefg'
  ),
  'compete, ended / bea: sees the winner ada''s race-ending pangram'
);

-- ============================================================
-- (9) Once ended, as bea: the required answer key is still there
-- ============================================================
-- The other half of cat B — the words nobody found — is computed
-- FE-side from the shipped lists minus found_words. That needs the
-- full required list, which game_data's words carry throughout.

select is(
  (select count(*)::int from jsonb_array_elements((select static_game_data->'puzzle'->'words' from common.games where id = (select id from g))) w
    where not (w->>'bonus')::boolean),
  30,
  'compete, ended / bea: static_game_data.puzzle.words carries the required set (30 entries) — cat B "nobody found" source'
);

-- ============================================================
-- (10)–(11) Why PlayArea must filter to self in compete
-- ============================================================
-- A score summed over EVERY visible found_words row, relying on
-- "RLS keeps compete caller-only", breaks at the end: the
-- assertions above (peers visible once ended) show why —
-- summing all rows would jump bea's score from her own 6pt to
-- 24pt (6 + cade's 1 + ada's 17) at the instant the game ends.
-- These assertions pin both numbers so the divergence is explicit
-- and a regression in either direction trips the test.

select is(
  (select coalesce(sum(points), 0) from spellingbee.found_words
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  6::bigint,
  'compete, ended / bea: caller-only score (cat A points) = 6'
);

select is(
  (select coalesce(sum(points), 0) from spellingbee.found_words
    where game_id = (select id from g)),
  24::bigint,
  'compete, ended / bea: sum over ALL visible rows = 24 ≠ 6 — FE must filter to self, not lean on RLS'
);

-- ============================================================
select * from finish();
rollback;
