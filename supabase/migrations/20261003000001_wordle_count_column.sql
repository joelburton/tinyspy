-- cs-unmet

-- ============================================================
-- wordle: the used-guesses column takes the page blobs' name
-- ============================================================
-- A blob key is its column, camelCased (docs/code-conventions.md →
-- TypeScript casing), and a count is `nFoo` (→ A few words may be
-- abbreviated): `n_guesses_used` → `nGuessesUsed`, as psychicnum's already
-- is (20261003000000_psychicnum_count_columns.sql). A rename carries every
-- row with it; the values are already each player's own in both modes
-- (20261002000001_wordle_players_own_counts.sql). The page blobs are rebuilt
-- by hand after the deploy (`select wordle._rebuild_data_cols_for_all()`),
-- since a migration cannot call what `supabase/sql/` defines.

alter table wordle.players
  rename column guesses_used to n_guesses_used;
