-- cs-unmet

-- ============================================================
-- stackdown: the players' count column says n_found_words
-- ============================================================
-- A blob key is its column, camelCased, and a count is `nFoo`
-- (docs/code-conventions.md): `players.found_count` → `n_found_words`
-- (`nFoundWords`). It is already each player's own count in both modes —
-- `submit_word` bumps the caller's row alone — so nothing is rewritten. A
-- rename carries every row with it; the column has no constraint of its own.
-- The page blobs are rebuilt by hand after the deploy (`select
-- stackdown._rebuild_data_cols_for_all()`), since a migration cannot call what
-- `supabase/sql/` defines.

alter table stackdown.players
  rename column found_count to n_found_words;
