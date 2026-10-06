-- cs-unmet

-- ============================================================
-- static_game_data: what never changes after create_game
-- ============================================================
-- plans/static-game-data.md. A fourth page blob beside `shell_data`,
-- `game_data` and `summary_data`, holding what `create_game` fixes and nothing
-- after it changes: the setup, the game facts every game shares (its id,
-- gametype, brand, club, mode), and each game's puzzle less the key it shows
-- only once the game has ended. `game_data` loses those keys, so a move's
-- re-read no longer carries them; the page reads this blob once per mount.
--
-- Written by each game's `create_game`, and by its
-- `_rebuild_data_cols_for_all()`; never by a move.
--
-- Nullable: a game created before its builder learned it has none until the
-- blobs are rebuilt by hand after the deploy (`select
-- <game>._rebuild_data_cols_for_all()` for every game), since a migration
-- cannot call what `supabase/sql/` defines.

alter table common.games
  add column static_game_data jsonb;
