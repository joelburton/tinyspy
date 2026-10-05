-- cs-unmet

-- ============================================================
-- letterboxed: the board's word list says `words`
-- ============================================================
-- The list of every word that can be played on a board — in the dictionary at
-- the game's band, made of the board's letters, never two in a row from one
-- side — is called `words` from the edge function that builds it, through
-- `create_game`'s board, to the page blob (`puzzle.words`). The column takes
-- the same name: `letterboxed.games.legal_words` → `words`. A rename carries
-- every row with it; the column has no constraint of its own. The page blobs
-- are rebuilt by hand after the deploy (`select
-- letterboxed._rebuild_data_cols_for_all()`), since a migration cannot call
-- what `supabase/sql/` defines; nothing in them changes shape.

alter table letterboxed.games
  rename column legal_words to words;
