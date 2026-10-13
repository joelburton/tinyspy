-- cs-unmet

-- ============================================================
-- scrabble — the deal, kept for Restart
-- ============================================================
--
-- `deal` is the bag as `create_game` shuffled it, before any rack was drawn
-- from it: Restart (`replay_board`) deals from it again, so a restarted game
-- opens on the same racks and draws the same tiles. HIDDEN, as the bag is:
-- it is left out of the column grant on scrabble.games.
--
-- A game created before the column has no deal to restore; its next Restart
-- shuffles afresh and keeps that one.

alter table scrabble.games add column deal text[];
