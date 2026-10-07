-- cs-unmet

-- ============================================================
-- The statuses go: common.games.game_status and clubpage_info,
-- common.game_players.player_status
-- ============================================================
--
-- Each game wrote these copies of what its pages showed until every page read
-- the blobs its builder writes instead (`game_data`, `summary_data`,
-- `shell_data`; plans/seat-view.md). Since then nothing writes them and
-- nothing reads them: every row on prod held `{}` when this was written, no
-- view, function, index, constraint, trigger or policy names them, the grants
-- and the Realtime publication on these tables are whole-table, and no client
-- selects them by name. So the drop loses no data and breaks no reader.

alter table common.games
  drop column game_status,
  drop column clubpage_info;

alter table common.game_players
  drop column player_status;
