-- cs-unmet

-- ============================================================
-- wordiply: the two length columns say `len`
-- ============================================================
-- `len` is a permitted abbreviation (docs/code-conventions.md → A few words
-- may be abbreviated), and a blob key is its column, camelCased:
-- `games.max_word_length` → `max_word_len` (`maxWordLen`), and
-- `events.length` → `len`, as `common.words.len` already is. A rename carries
-- every row with it; neither column has a check constraint. The page blobs
-- are rebuilt by hand after the deploy (`select
-- wordiply._rebuild_data_cols_for_all()`), since a migration cannot call what
-- `supabase/sql/` defines.

alter table wordiply.games
  rename column max_word_length to max_word_len;
alter table wordiply.events
  rename column length to len;
