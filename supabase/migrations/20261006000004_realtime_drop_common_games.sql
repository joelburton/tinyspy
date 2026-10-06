-- cs-unmet

-- ============================================================
-- supabase_realtime: common.games is not published any more
-- ============================================================
-- The club page's list was the last `postgres_changes` subscriber on
-- `common.games`. It now hears a change through the `changed` Broadcast that
-- `common._nudge_club_page` sends its room, as the game page does through
-- `_nudge_game_page` (src/common/realtime/doc.md), so the table is published
-- with nobody listening.
--
-- REPLICA IDENTITY FULL went with that subscription: it was there so a DELETE
-- event carried `club_handle` for the list's filter to match. The delete
-- trigger reads `old.club_handle` itself, so the table goes back to the
-- default identity, its primary key.
--
-- supabase/tests/common/realtime_publication_test.sql pins the list.

alter publication supabase_realtime drop table common.games;

alter table common.games replica identity default;
