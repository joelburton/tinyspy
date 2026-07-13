-- ============================================================
-- Test: wordiply.try_base + candidate_bases — the board-build gate
-- ============================================================
--
-- wordiply's board builder is DB-orchestration: the edge function loops over
-- candidate_bases() and keeps the first that clears try_base()'s gate. So the
-- board-quality "pure logic" is in SQL, not TS — it belongs here, not in a deno
-- test (unlike spellingbee/wordwheel, whose builders extract a TS board.ts). This
-- pins the gate:
--
--   try_base(base, legal_band, min_children, max_children, min_headroom)
--   returns ONE board row iff
--     • child count ∈ [min_children, max_children]   (the max bound is the
--       load-bearing one — it throws out over-generous fragments like 'ar')
--     • max_word_length ≥ len(base) + min_headroom
--   and ZERO rows otherwise.
--
-- Assertions are deliberately COUNT-INDEPENDENT: they use bounds far from
-- 'ar's real child count (which the migration itself notes is in the tens of
-- thousands) so they don't turn into brittle dictionary snapshots. Needs
-- common.words populated (npm run import) — same prerequisite as create_game.

begin;

set search_path = wordiply, common, public, extensions;

select plan(9);

-- ── A. A generous gate PASSES and returns a well-formed board ────────
-- 'ar' has many children at band 5 and a max word far longer than 'ar'+1,
-- so wide bounds accept it. Capture the single row once.
create temp table board on commit drop as
  select * from wordiply.try_base('ar', 5, 1, 100000, 1);

select is(
  (select count(*)::int from board), 1,
  'try_base: a base clearing every bound returns exactly one board row');

select ok(
  (select max_word_length from board) >= 3,
  'try_base: max_word_length ≥ len(base)+headroom (2+1) for the passing board');

select ok(
  (select jsonb_array_length(legal_words) from board) > 0,
  'try_base: the passing board ships a non-empty legal_words list');

select ok(
  (select jsonb_array_length(longest_words) from board) between 1 and 3,
  'try_base: longest_words carries 1..3 words at the max length');

-- ── B. Each gate REJECTS (zero rows), independent of the exact count ──

-- Max-children: 'ar' has far more than 5 children, so the upper bound trips.
-- This is the gate the builder leans on to reject over-generous fragments.
select is(
  (select count(*)::int from wordiply.try_base('ar', 5, 1, 5, 1)), 0,
  'try_base: an over-generous base (children > max_children) is rejected');

-- Min-children: no base has a million children, so the lower bound trips.
select is(
  (select count(*)::int from wordiply.try_base('ar', 5, 1000000, 2000000, 1)), 0,
  'try_base: a base below min_children is rejected');

-- Headroom: no word is len(base)+100 long, so the headroom bound trips even
-- though the child count is fine.
select is(
  (select count(*)::int from wordiply.try_base('ar', 5, 1, 100000, 100)), 0,
  'try_base: a base whose longest word lacks the headroom is rejected');

-- ── C. candidate_bases returns well-formed 2–4 letter fragments ──────

select is(
  (select count(*)::int from wordiply.candidate_bases(3, 20)
     where base !~ '^[a-z]{2,4}$'), 0,
  'candidate_bases: every fragment is 2–4 lowercase letters');

select ok(
  (select count(*)::int from wordiply.candidate_bases(3, 20)) <= 20,
  'candidate_bases: returns at most n fragments');

select * from finish();
rollback;
