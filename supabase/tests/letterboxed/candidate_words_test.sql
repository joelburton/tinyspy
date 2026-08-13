-- ============================================================
-- Test: letterboxed.candidate_words — the TWO TIERS, not one list
-- ============================================================
--
-- The bug this guards (2026-08-10, found in play): candidate_words applied
-- the must-reach purity filter in its WHERE clause, so the board's
-- `playable_words` was clean — and since that list is also the ACCEPT list
-- (submit_word is one `?` membership test against it, and the FE's
-- rejectReason reads the same array), typing BITCH was refused. BITCH is
-- band 1 with `slur = 1`: a legal word the player CHOSE to type, which is
-- the may-enter tier (docs/common.md → the word list's filter rule).
--
-- The shape that fixes it, and what this file pins:
--
--   WHERE  band + board shape ONLY  → the accept list (may-enter)
--   is_clean flag                   → the subset the hint may suggest
--                                     (must-reach), computed back out by
--                                     the games_state view
--
-- Unlike the other letterboxed tests this one CANNOT be synthetic: the
-- whole subject is how real `common.words` rows are classified. It leans
-- on words whose flags are stable and load-bearing enough to be worth
-- noticing if they ever move:
--
--   bitch  band 1, slur 1,  american+british  → enterable, NOT clean
--   arse   band 2, crude 1, slang, british only → enterable, NOT clean
--   cab    band 1, clean                        → both tiers
--
-- Board: 'abcdefghirst' — twelve distinct letters covering all three
-- (bitch needs b,i,t,c,h; arse needs a,r,s,e; cab needs c,a,b).

begin;

set search_path = letterboxed, common, public, extensions;

select plan(9);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- ── The fixture words really are the rows this test assumes ──
-- Asserted, not trusted: if a dictionary edit reclassifies one of them the
-- failure should name THAT, rather than surfacing as a confusing tier bug.
select is(
  (select slur from common.words where word = 'bitch'),
  1::smallint,
  'fixture: bitch is still flagged slur = 1'
);
select ok(
  (select difficulty <= 3 from common.words where word = 'bitch'),
  'fixture: bitch is still an easy-band word (so a real board would offer it)'
);

-- ── The accept list: band + board shape, nothing else ──
select ok(
  exists(
    select 1 from letterboxed.candidate_words(
      common.word_letter_mask('abcdefghirst'), 3)
     where word = 'bitch'
  ),
  'a slur word that FITS the board is in the accept list (may-enter)'
);
select ok(
  exists(
    select 1 from letterboxed.candidate_words(
      common.word_letter_mask('abcdefghirst'), 3)
     where word = 'arse'
  ),
  'a crude, slang, BRITISH-ONLY word is in the accept list too — band is the only filter'
);

-- ── The clean subset: what the hint search may suggest ──
select ok(
  not (select is_clean from letterboxed.candidate_words(
         common.word_letter_mask('abcdefghirst'), 3)
        where word = 'bitch'),
  'that same word is flagged NOT clean, so the hint cannot offer it'
);
select ok(
  (select is_clean from letterboxed.candidate_words(
     common.word_letter_mask('abcdefghirst'), 3)
    where word = 'cab'),
  'an ordinary word is clean — the flag is not simply always false'
);

-- ── The board-shape half still holds ──
-- Band is the only PURITY filter; the letter-set and doubled-letter rules
-- are about the board and stay in the WHERE.
select ok(
  not exists(
    select 1 from letterboxed.candidate_words(
      common.word_letter_mask('abcdefghirst'), 3)
     where word = 'zoo'
  ),
  'a word using letters the board lacks is still excluded outright'
);

-- The doubled-letter rule, pinned SEPARATELY from the letter-set rule.
-- 'egg' is band 1 and every one of its letters is on this board, so the
-- only thing that can exclude it is the `!~ '(.)\1'` qual — which lives
-- behind a MATERIALIZED fence (it is the most expensive and least
-- selective qual, so the planner must not run it first). A rewrite that
-- lost the qual while moving it would leave every other assertion here
-- green; 'zoo' above cannot catch it, since z and o are off the board.
select ok(
  (select difficulty <= 3 from common.words where word = 'egg'),
  'fixture: egg is still an easy-band word (so the exclusion below is real)'
);
select ok(
  not exists(
    select 1 from letterboxed.candidate_words(
      common.word_letter_mask('abcdefghirst'), 3)
     where word = 'egg'
  ),
  'a DOUBLED-LETTER word whose letters all fit the board is excluded — '
  'unplayable on every possible board (a letter shares a side with itself)'
);

select * from finish();
rollback;
