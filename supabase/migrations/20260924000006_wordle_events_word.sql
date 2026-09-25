-- cs-unmet

-- ============================================================
-- wordle.events: the `guess` column becomes `word`
-- ============================================================
-- The five-letter word each accepted guess typed. Every other event table that
-- stores a word names the column `word` (psychicnum, strands, wordiply,
-- letterboxed, stackdown). The rename carries every row with it.
alter table wordle.events
  rename column guess to word;
