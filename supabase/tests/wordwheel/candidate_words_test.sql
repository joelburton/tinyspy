-- ============================================================
-- Test: wordwheel.candidate_words — the SUBSET set, NOT the isogram set
-- ============================================================
--
-- This test has no spellingbee analog; it guards the key architectural
-- fact of the word-wheel fork. wordwheel.candidate_words(puzzle_mask,
-- center_bit, required_band, legal_band) returns every word from
-- common.words whose letter-SET is a subset of the wheel (letter_mask &
-- ~puzzle_mask = 0) AND that contains the center (letter_mask & center_bit
-- <> 0), of length >= 4 within the legal band.
--
-- Crucially, it does NOT enforce the "each tile used ONCE" (isogram)
-- rule — a word may reuse a letter (popcount(letter_mask) < length(word))
-- and still come back. That multiset post-filter (popcount = len) lives
-- in the edge function (wordwheel-build-board), where the mask popcount is
-- cheap; the SQL layer stays a pure subset test. This file pins that
-- boundary so a future "optimization" that folds the isogram check into
-- candidate_words (breaking the edge function's contract) trips a test.
--
-- Fixture: a REAL wheel from the seeded wordwheel.pangrams — mask 3391,
-- whose nine letters are {a,b,c,d,e,f,i,k,l} ('abcdefikl'). Center 'e'
-- (bit 1<<4 = 16). We query the real common.words data, so the specific
-- rows depend on the imported word list — assertions use robust
-- EXISTS/count checks against a couple of known-stable dictionary words,
-- not brittle exact-list matches.
--
-- The popcount of a letter_mask (its distinct-letter count) is computed
-- as length(replace(letter_mask::bit(64)::text, '0', '')) — the number
-- of set bits. A word is an isogram on this wheel iff that equals
-- length(word); a reuse word iff it's strictly less.

begin;

set search_path = wordwheel, common, public, extensions;

select plan(6);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- Sanity: mask 3391 is a seeded wheel (imported); its letters are
-- 'abcdefikl'. If this fails, the pangram import didn't run — see
-- MEMORY: `db reset needs import`.
select ok(
  exists (select 1 from wordwheel.pangrams where mask = 3391),
  'fixture wheel (mask 3391 = abcdefikl) is present in the seeded wordwheel.pangrams'
);

-- ============================================================
-- (1) A pure isogram that includes the center IS returned
-- ============================================================
-- 'abide' — letters {a,b,i,d,e}, all distinct (isogram), all in the
-- wheel, contains 'e'. The bread-and-butter case.

select ok(
  exists (
    select 1 from wordwheel.candidate_words(3391, 16, 3, 5)
     where word = 'abide'
  ),
  'candidate_words returns a pure isogram ("abide") that fits the wheel + has the center'
);

-- ============================================================
-- (2) A letter-REUSING (non-isogram) word is ALSO returned
-- ============================================================
-- 'accede' — letters {a,c,e,d} distinct but length 6 (c + e repeat), so
-- it reuses tiles. It's a letter-SUBSET of the wheel and contains 'e',
-- so candidate_words returns it: PROOF the isogram rule is NOT enforced
-- here (it lives in the edge function's popcount(letter_mask) = len post-
-- filter). This is the load-bearing assertion of the file.

select ok(
  exists (
    select 1 from wordwheel.candidate_words(3391, 16, 3, 5)
     where word = 'accede'
       and length(replace(letter_mask::bit(64)::text, '0', ''))::int < length(word)
  ),
  'candidate_words ALSO returns a letter-reusing word ("accede", 4 distinct letters / len 6) — the multiset filter is NOT in this function'
);

-- ============================================================
-- (3) In aggregate, BOTH isogram and reuse rows are present
-- ============================================================
-- Robust counts rather than pinning specific words: the result set
-- contains at least one row where distinct-letters = length (isogram)
-- and at least one where distinct-letters < length (reuse).

select ok(
  (
    select count(*) from wordwheel.candidate_words(3391, 16, 3, 5)
     where length(replace(letter_mask::bit(64)::text, '0', ''))::int = length(word)
  ) > 0
  and
  (
    select count(*) from wordwheel.candidate_words(3391, 16, 3, 5)
     where length(replace(letter_mask::bit(64)::text, '0', ''))::int < length(word)
  ) > 0,
  'candidate_words yields BOTH isograms (popcount = len) and reuse words (popcount < len) — subset semantics, not multiset'
);

-- ============================================================
-- (4) The center-letter requirement: a word LACKING the center is not returned
-- ============================================================
-- 'balk' — letters {b,a,l,k} all in the wheel, BUT no 'e' (the center).
-- The `letter_mask & center_bit <> 0` clause drops it. (Guard: it IS in
-- the dictionary, so its absence from candidate_words is the center rule,
-- not a missing word.)

select ok(
  exists (select 1 from common.words where word = 'balk')
  and not exists (
    select 1 from wordwheel.candidate_words(3391, 16, 3, 5)
     where word = 'balk'
  ),
  'candidate_words EXCLUDES a wheel-subset word that lacks the center ("balk": no e) — center-letter rule'
);

-- ============================================================
-- (5) The subset requirement: a word using an off-wheel letter is not returned
-- ============================================================
-- 'bleat' — contains 't', which is NOT among {a,b,c,d,e,f,i,k,l}. The
-- `letter_mask & ~puzzle_mask = 0` subset clause drops it, even though it
-- contains the center 'e'. (Guard: it IS in the dictionary.)

select ok(
  exists (select 1 from common.words where word = 'bleat')
  and not exists (
    select 1 from wordwheel.candidate_words(3391, 16, 3, 5)
     where word = 'bleat'
  ),
  'candidate_words EXCLUDES a word using an off-wheel letter ("bleat": t off-wheel) — subset rule'
);

select * from finish();
rollback;
