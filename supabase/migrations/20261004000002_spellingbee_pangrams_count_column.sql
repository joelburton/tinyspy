-- cs-unmet

-- ============================================================
-- spellingbee.pangrams: the count column takes the games' name
-- ============================================================
-- `required_words_count` → `n_reqd_words`, the name the games' own column took
-- (20261004000001_bee_games_count_columns.sql): how many required words a
-- seed's letters spell. A rename carries every row with it; the column has no
-- check constraint, and the pool is read only by spellingbee-build-board and
-- rewritten whole by import-spellingbee-pangrams.ts.

alter table spellingbee.pangrams
  rename column required_words_count to n_reqd_words;
