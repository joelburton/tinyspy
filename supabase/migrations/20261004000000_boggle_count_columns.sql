-- cs-unmet

-- ============================================================
-- boggle: the two count columns take the page blobs' names
-- ============================================================
-- A blob key is its column, camelCased (docs/code-conventions.md →
-- TypeScript casing), and a count is `nFoo` (→ A few words may be
-- abbreviated): `required_words_count` → `n_reqd_words` (`nReqdWords`),
-- `required_words_score` → `reqd_words_score` (`reqdWordsScore`). A rename
-- carries every row with it; neither column has a check constraint. The page
-- blobs are rebuilt by hand after the deploy (`select
-- boggle._rebuild_data_cols_for_all()`), since a migration cannot call what
-- `supabase/sql/` defines.

alter table boggle.games
  rename column required_words_count to n_reqd_words;
alter table boggle.games
  rename column required_words_score to reqd_words_score;
