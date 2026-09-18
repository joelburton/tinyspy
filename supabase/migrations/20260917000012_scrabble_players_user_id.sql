-- cs-unmet

-- ============================================================
-- scrabble.players — every seat has a player
-- ============================================================
-- The AI seats have users now, so the nullable `user_id` that let a seat have
-- nobody has nothing left to describe. Two shapes follow from that:
--
--   NOT NULL      every seat is somebody's, bot or person.
--   the KEY       (game_id, seat) → (game_id, user_id). A player is in a game
--                 once; which SEAT they hold is a fact about the game, not
--                 their identity in it. `seat` keeps its own unique
--                 constraint — it owns the rack and the display order, and
--                 two players must never share one.
--
-- The `set not null` is also the check that no old game is left with an
-- ownerless seat. A game dealt before the bots were accounts would have one,
-- and this migration would refuse rather than guess who it belonged to.
alter table scrabble.players alter column user_id set not null;

-- The unique constraint on (game_id, user_id) is already there; promote it by
-- swapping which of the two is the primary key.
alter table scrabble.players drop constraint players_pkey;
alter table scrabble.players drop constraint players_game_id_user_id_key;
alter table scrabble.players add constraint players_pkey primary key (game_id, user_id);
alter table scrabble.players add constraint players_game_id_seat_key unique (game_id, seat);
