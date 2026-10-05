-- cs-unmet

-- ============================================================
-- codenamesduet: words and clues are stored lowercase
-- ============================================================
-- Every other word game keeps its words lowercase and draws the capitals
-- (docs/code-conventions.md → one case, the data's); codenamesduet stored its
-- word pool, each game's dealt words and every clue in capitals. This brings
-- the stored data to lowercase. A game's title keeps its capitals: it is drawn
-- text, written once at create.
--
-- The word pool's primary key is the word, and it holds no two words that
-- differ only in case, so lowercasing it collides with nothing. The page
-- blobs are rebuilt by hand after the deploy (`select
-- codenamesduet._rebuild_data_cols_for_all()`), since a migration cannot call
-- what `supabase/sql/` defines.

update codenamesduet.word_pool set word = lower(word) where word <> lower(word);
update codenamesduet.words set word = lower(word) where word <> lower(word);
update codenamesduet.events set clue_word = lower(clue_word)
 where clue_word is not null and clue_word <> lower(clue_word);
