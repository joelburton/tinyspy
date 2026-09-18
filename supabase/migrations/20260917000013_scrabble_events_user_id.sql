-- cs-unmet

-- ============================================================
-- scrabble.events.user_id — every event has an author
-- ============================================================
-- The last nullable `user_id` in any game's log, and the reason it was
-- nullable is gone: an AI seat had no user to name, and now it has a bot with
-- a profile like anyone else. Every one of the ten logs takes the skeleton in
-- full from here.
--
-- The `set not null` doubles as the check that no authorless row survives. A
-- play made before the bots were accounts would be one, and this migration
-- refuses rather than inventing an author for it.
alter table scrabble.events alter column user_id set not null;
