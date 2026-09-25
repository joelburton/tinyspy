-- cs-unmet

-- ============================================================
-- letterboxed.games.max_words: 2..7 becomes 2..10
-- ============================================================
-- `create_game` stores `max_words = 2 + extra_words`. The server now accepts
-- `extra_words` 0..8 — a sane range, while the setup form keeps choosing which
-- counts it offers — so the column's ceiling moves from 7 to 10 with it.
-- Widening a check touches no row.
alter table letterboxed.games
  drop constraint games_max_words_check;
alter table letterboxed.games
  add constraint games_max_words_check check (max_words between 2 and 10);
