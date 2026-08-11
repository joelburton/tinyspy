-- ============================================================
-- Test: common.anagrams — the ⌥` anagram finder's search
-- ============================================================
--
-- The contract under test (see the function's header in sql/common.sql):
-- exact-length anagrams of a pattern where lowercase letters float, '?' is
-- a floating wildcard, and an UPPERCASE letter is PINNED to its position
-- ("Acer" finds acer + acre, never race). Results ordered difficulty, word.
--
-- Fixture words are invented q/z/x-heavy strings so they can't collide with
-- the real dictionary's primary keys — and so the expected result SETS are
-- exact (no real word shares these multisets). letter_mask is GENERATED, so
-- the inserts don't mention it and the mask prefilter is exercised for real.
--
-- One deliberate pin: the fixture with slur=2/crude=2/slang MUST appear —
-- the anagram tool is ruled unfiltered (the player typed the letters;
-- 2026-08-07), the OPPOSITE of the app-surfaces tier. A future cleanup that
-- quietly adds the clean filter fails here first.

begin;

set search_path = common, public, extensions;

select plan(10);

insert into common.words
  (word, difficulty, american, british, canadian, australian, len, crude, slur, slang)
values
  ('bzqx',  1, true, true, true, true, 4, 0, 0, false),
  ('bzxq',  2, true, true, true, true, 4, 0, 0, false),
  ('zbqx',  3, true, true, true, true, 4, 0, 0, false),
  ('zzqx',  1, true, true, true, true, 4, 0, 0, false),
  ('qxbe',  1, true, true, true, true, 4, 2, 2, true),
  ('bzqxa', 1, true, true, true, true, 5, 0, 0, false);

-- ── Floating letters: a scramble finds every arrangement, in band order ──
select results_eq(
  $$ select word from common.anagrams('xqzb') $$,
  array['bzqx', 'bzxq', 'zbqx'],
  'a lowercase scramble finds all anagrams, ordered difficulty then word'
);

-- ── Pins: an UPPERCASE letter fixes its position ──
select results_eq(
  $$ select word from common.anagrams('Bzqx') $$,
  array['bzqx', 'bzxq'],
  'a pinned first letter keeps b-first words and drops zbqx'
);

select results_eq(
  $$ select word from common.anagrams('BZXQ') $$,
  array['bzxq'],
  'an all-uppercase pattern degenerates to an exact-word check'
);

-- ── Wildcards: '?' floats and pays any one letter — including a duplicate ──
select results_eq(
  $$ select word from common.anagrams('?zqx') $$,
  array['bzqx', 'zzqx', 'bzxq', 'zbqx'],
  'a wildcard pays any letter (b for three words, the second z for zzqx)'
);

-- ── Multisets: a doubled letter needs a double (or a wildcard) to pay it ──
select results_eq(
  $$ select word from common.anagrams('zqxz') $$,
  array['zzqx'],
  'a doubled input letter matches only the doubled word'
);

select results_eq(
  $$ select word from common.anagrams('Zzqx') $$,
  array['zzqx'],
  'a pinned copy plus a floating copy of the same letter both count'
);

-- ── Length is exact ──
select results_eq(
  $$ select word from common.anagrams('abqxz') $$,
  array['bzqxa'],
  'five letters match only five-letter words — the len-4 fixtures are out'
);

-- ── The unfiltered ruling: crude/slur/slang words appear ──
select results_eq(
  $$ select word from common.anagrams('ebqx') $$,
  array['qxbe'],
  'no content filter: a slur=2/crude=2/slang word still lists (ruled 2026-08-07)'
);

-- ── Input validation ──
select throws_ok(
  $$ select * from common.anagrams('ab1') $$,
  'P0001', 'bad-anagram-input|',
  'digits are rejected'
);

select throws_ok(
  $$ select * from common.anagrams('a') $$,
  'P0001', 'bad-anagram-input|',
  'a single letter is rejected'
);

select * from finish();
rollback;
