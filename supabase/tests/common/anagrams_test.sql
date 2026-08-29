-- cs-unmet

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

\ir ../_shared/envelope.psql

select plan(11);

-- The words from a result, in the order the RPC returned them. Ordering is part
-- of the contract (difficulty, then word), so `with ordinality` preserves it
-- rather than letting the aggregate re-order.
create function pg_temp.anagram_words(letters text)
returns text[]
language sql
as $$
  select array_agg(e ->> 'word' order by ord)
    from jsonb_array_elements(common.anagrams(letters) -> 'data' -> 'words')
         with ordinality t(e, ord);
$$;

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
select is(
  pg_temp.anagram_words('xqzb'),
  array['bzqx', 'bzxq', 'zbqx'],
  'a lowercase scramble finds all anagrams, ordered difficulty then word'
);

-- ── Pins: an UPPERCASE letter fixes its position ──
select is(
  pg_temp.anagram_words('Bzqx'),
  array['bzqx', 'bzxq'],
  'a pinned first letter keeps b-first words and drops zbqx'
);

select is(
  pg_temp.anagram_words('BZXQ'),
  array['bzxq'],
  'an all-uppercase pattern degenerates to an exact-word check'
);

-- ── Wildcards: '?' floats and pays any one letter — including a duplicate ──
select is(
  pg_temp.anagram_words('?zqx'),
  array['bzqx', 'zzqx', 'bzxq', 'zbqx'],
  'a wildcard pays any letter (b for three words, the second z for zzqx)'
);

-- ── Multisets: a doubled letter needs a double (or a wildcard) to pay it ──
select is(
  pg_temp.anagram_words('zqxz'),
  array['zzqx'],
  'a doubled input letter matches only the doubled word'
);

select is(
  pg_temp.anagram_words('Zzqx'),
  array['zzqx'],
  'a pinned copy plus a floating copy of the same letter both count'
);

-- ── Length is exact ──
select is(
  pg_temp.anagram_words('abqxz'),
  array['bzqxa'],
  'five letters match only five-letter words — the len-4 fixtures are out'
);

-- ── The unfiltered ruling: crude/slur/slang words appear ──
select is(
  pg_temp.anagram_words('ebqx'),
  array['qxbe'],
  'no content filter: a slur=2/crude=2/slang word still lists (ruled 2026-08-07)'
);

-- ── Input validation ──
-- A rejection the PLAYER can fix does not throw: it comes back as an envelope
-- on the ok path, with `severity: validation` so the dialog knows to put the
-- message on its own error line rather than in a fault modal.
select pg_temp.envelope_is(
  common.anagrams('ab1'),
  '{"type": "not-ok", "severity": "form-validation", "message": "2–15 letters, or ?"}'::jsonb,
  'digits are rejected'
);

-- The raise's COLUMN names the field the message belongs under. Pinned here
-- because nothing renders it yet — the form plumbing comes later — so a
-- dropped `column =` on the raise would otherwise go unnoticed.
select pg_temp.envelope_is(
  common.anagrams('ab1'),
  '{"field": "letters"}'::jsonb,
  'a validation names the field it is about'
);

select pg_temp.envelope_is(
  common.anagrams('a'),
  '{"type": "not-ok", "severity": "form-validation", "message": "2–15 letters, or ?"}'::jsonb,
  'a single letter is rejected'
);

select * from finish();
rollback;
