-- cs-unmet

-- ============================================================
-- letterboxed: the log's count column says n_covered_letters
-- ============================================================
-- A blob key is its column, camelCased, and a count is `nFoo`
-- (docs/code-conventions.md): `events.letters_covered` → `n_covered_letters`
-- (`nCoveredLetters`). A rename carries every row with it; the check
-- constraint is renamed beside it so its name still says which column it
-- guards. The page blobs are rebuilt by hand after the deploy (`select
-- letterboxed._rebuild_data_cols_for_all()`), since a migration cannot call
-- what `supabase/sql/` defines.

alter table letterboxed.events
  rename column letters_covered to n_covered_letters;
alter table letterboxed.events
  rename constraint events_letters_covered_check to events_n_covered_letters_check;
