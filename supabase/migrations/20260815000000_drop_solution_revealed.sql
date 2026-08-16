-- ============================================================
-- Drop the shared reveal machinery: solution_revealed + hides_solution
-- ============================================================
-- Seeing the solution is now a LOCAL, per-player display choice, made in the FE
-- (docs/ui.md → Terminal results). Every game with an answer to show has a
-- Reveal/Hide toggle each player works for themselves: one player looking
-- doesn't open it on a partner who is still thinking, and the board they
-- actually finished with is always one click away — which matters most for the
-- games whose reveal REWRITES the board (crosswords, strands, waffle,
-- connections), where the old permanent reveal destroyed the only record of
-- where the players got to.
--
-- Nothing is written any more, so both of these have no readers left:
--
--   common.games.solution_revealed  — "has this game's answer been opened?",
--     a game-wide boolean set by common.end_game (on a win, or for any gametype
--     that didn't hide its solution) and by the common.reveal_solution RPC.
--   common.gametypes.hides_solution — "does this gametype wait to be asked?",
--     which was only ever read to decide that end_game write.
--
-- The RPC itself is dropped in supabase/sql/common.sql, which is re-applied in
-- full every deploy; only these two columns are shape, so only these two need a
-- migration.
--
-- WHAT REPLACES THE SERVER HALF. Nothing, for the flag — but the SHIELD stays,
-- and every gametype that has one now gates it on `is_terminal`, i.e. over for
-- EVERYONE (waffle / stackdown already did; crosswords, letterboxed, strands and
-- wordle moved). That's the part that was ever load-bearing: it stops a player
-- who conceded or finished early from pulling the answer while a race is still
-- running. Which of them is LOOKING at it never was.
--
-- WHY A FORWARD MIGRATION rather than editing the baselines in place (the
-- convention in CLAUDE.md): every one of those migrations is already applied on
-- prod, and `supabase db push` SKIPS applied migrations. An in-place edit would
-- leave the columns standing there while `supabase/sql/` — re-applied in full —
-- stopped writing them, and the two halves would disagree.

alter table common.games
  drop column if exists solution_revealed;

alter table common.gametypes
  drop column if exists hides_solution;
