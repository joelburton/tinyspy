-- ============================================================
-- crosswords.games — an index for the library picker's join
-- ============================================================
-- `crosswords.games` carried only its primary key, so both of its foreign
-- keys (`club_handle`, `puzzle_id`) were unindexed. That matters here because
-- of one query rather than because of the FKs: `crosswords.library_for_club`
-- left-joins this table on `puzzle_id` AND filters `club_handle`, and it runs
-- every time a player opens the crosswords setup dialog. Without an index
-- that's a sequential scan of every crosswords game the app has ever created,
-- once per dialog open, growing linearly with play.
--
-- Column order matches the join predicate: `club_handle` is the equality
-- filter (one club), `puzzle_id` the join key within it — so the leading
-- column is also the more selective one. As a bonus, a leading `club_handle`
-- covers the `games_club_handle_fkey` cascade check too.
--
-- Deliberately NOT doing the same for the other ~35 unindexed foreign keys
-- Supabase's advisor lists. Those are almost all `user_id` on per-game child
-- tables, where the only operation they'd speed up is deleting a profile, and
-- the tables have tens to low-thousands of rows — the planner would ignore a
-- new index while every write paid to maintain it. Revisit per table if one
-- crosses ~10k rows.

create index if not exists games_club_puzzle_idx
  on crosswords.games (club_handle, puzzle_id);
