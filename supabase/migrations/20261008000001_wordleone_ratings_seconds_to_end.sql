-- cs-unmet

-- ============================================================
-- wordleone.ratings.seconds_measured runs start to END
-- ============================================================
-- `rate_puzzle` measured the rater's seconds from the game's start to their
-- own solve, so a game that ended without one — stopped, timed out — left the
-- column null. The measure is now start to the game's end, solved or not: how
-- long someone went before the game ended is what the survey wants to see,
-- and `solved_at` beside it tells a solve from a stop (Joel, 2026-10-08). A
-- restarted game still measures nothing: a restart moves the start.
--
-- A DATA migration for the rows already saved under the old rule: the ones
-- left null whose game is still there, un-restarted and ended, get the time to
-- its end. Rows measured to a solve keep their number — in coop the solve IS
-- the end, and in compete the rater's own solve is the honest figure for a row
-- saved under that rule. `supabase/sql/wordleone.sql` carries the new rule for
-- every row after this.

update wordleone.ratings r
   set seconds_measured = greatest(0, extract(epoch from cg.ended_at - cg.started_at))::int
  from common.games cg
 where cg.id = r.game_id
   and r.seconds_measured is null
   and cg.restart_count = 0
   and cg.ended_at is not null;
