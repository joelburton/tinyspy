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
-- common.words populated (`gmake db-data ENV=local`) — same prerequisite as create_game.

begin;

set search_path = wordiply, common, public, extensions;

select plan(15);

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

-- ── D. The CUSTOM-BASE bounds (setup.custom_base) ────────────────────
--
-- A player-chosen starter goes through this SAME function with a looser gate:
-- min_children 1 (not 20), max_children 1000 (not 500), min_headroom UNCHANGED
-- at 3. See the edge fn's CUSTOM_* constants + docs/games/wordiply.md.
--
-- The one worth pinning is headroom. With the floor at 20 it never fires — a
-- base with 20+ children essentially always has one 3+ letters longer — so it
-- reads like dead weight and would survive a "simplification". At the custom
-- floor of 1 it is the ONLY thing rejecting a MOTH board whose best answer is
-- MOTHER. D4/D5 fail if min_headroom stops being enforced.
--
-- Still count-independent: bounds are computed from the base's REAL numbers
-- rather than hardcoded, so a dictionary edit can't turn these red.
create temp table moth on commit drop as
  select count(*)::int as children, max(len)::int as best, 4 as blen
    from wordiply.matching_words('moth', 5);

select ok(
  (select children from moth) >= 1 and (select best from moth) >= 7,
  'fixture: MOTH has children and a best word with room to spare');

-- D1: a normal starter clears the custom gate.
select is(
  (select count(*)::int from wordiply.try_base('moth', 5, 1, 1000, 3)), 1,
  'custom gate: a workable player-chosen base returns a board');

-- D2: the floor is enforced, and INCLUSIVE at the base's real count — which is
-- what makes a floor of 1 mean "anything with at least one child".
select is(
  (select count(*)::int from wordiply.try_base(
     'moth', 5, (select children + 1 from moth), 100000, 3)), 0,
  'custom gate: min_children above the real count rejects (the floor is real)');

-- D3: the ceiling is enforced — this is the bound that stops ING (20k words)
-- from shipping its whole legal list into the games row.
select is(
  (select count(*)::int from wordiply.try_base(
     'moth', 5, 1, (select children - 1 from moth), 3)), 0,
  'custom gate: max_children below the real count rejects (the ceiling is real)');

-- D4 + D5: headroom bites AT THE CUSTOM FLOOR. One letter more than the base's
-- best word can reach → rejected; exactly reachable → accepted. Both run with
-- min_children = 1, so ONLY the headroom bound can be deciding.
select is(
  (select count(*)::int from wordiply.try_base(
     'moth', 5, 1, 100000, (select best - blen + 1 from moth))), 0,
  'custom gate: headroom still rejects when the child floor is 1 (the MOTH/MOTHER rule)');

select is(
  (select count(*)::int from wordiply.try_base(
     'moth', 5, 1, 100000, (select best - blen from moth))), 1,
  'custom gate: headroom exactly met is accepted (the rejection above is the bound, not noise)');

select * from finish();
rollback;
