-- cs-unmet

-- ============================================================
-- Every conceder is locally terminal
-- ============================================================
-- `locally_terminal` means "not playing any more, for whatever reason" —
-- finished, eliminated, out of budget, or conceded (docs/win-lose.md → Where a
-- player stands). `conceded` stays the separate fact that forfeits a win.
-- `common._set_conceded` now sets both; this backfills the conceders it
-- marked before.
--
-- A DATA migration: `supabase/sql/` handles the writer, and nothing there can
-- reach rows already written. `common.game_players` carries no trigger, so no
-- game's `last_active_at` moves.
update common.game_players
   set locally_terminal = true
 where conceded
   and not locally_terminal;
