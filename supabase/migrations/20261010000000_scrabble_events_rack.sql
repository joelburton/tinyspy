-- cs-unmet

-- ============================================================
-- scrabble: each move's rack, and the tiles an exchange put back
-- ============================================================
-- The turn viewer shows the rack a past move was played from, with the tiles
-- that left it dimmed (Joel, 2026-10-10). No row kept a rack, and nothing can
-- rebuild one: the bag is shuffled with no stored seed, a word row does not
-- say what it drew, and an exchange row said only how many tiles it swapped.
--
--   rack        the rack the row's player held before the move: the
--               player's own in compete, the team's in coop. A `leftovers`
--               row's is the rack the ending counted; a `went_out` row's is
--               empty. Rows written before this column stay null.
--   exchanged   the tiles an exchange put back in the bag (`?` for a blank);
--               null on every other kind.

alter table scrabble.events
  add column rack text[],
  add column exchanged text[];
