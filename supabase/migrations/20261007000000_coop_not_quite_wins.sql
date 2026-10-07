-- cs-unmet

-- ============================================================
-- Coop endings that were not quite wins become no result
-- ============================================================
-- Two coop endings stop being results (plans/game-cards.md, setgame and
-- scrabble):
--
--   setgame   the deck emptied with tiles left over: every set found, but not
--             every tile in a set. Was `reached_goal`, the team ranked 1 and
--             won; now `resource_exhausted` with no result, everyone neutral.
--             A perfect clear (no tile left) stays a win.
--   scrabble  the timer, with tiles left over. Was a loss, everyone lost; now
--             no result, everyone neutral. Going out stays a win.
--
-- `setgame._finish` and `scrabble._finish` end new games this way; this
-- rewrites the games that already ended, so a past game reads as a new one
-- would. The detail stays as written ('cleared', 'timeout'). The page blobs
-- carry the outcomes and are rebuilt by every game's
-- `_rebuild_data_cols_for_all()` on deploy.

create temp table not_quite_wins on commit drop as
  select g.id
    from common.games g
    join setgame.games sg on sg.game_id = g.id
   where g.mode = 'coop'
     and g.game_ended_reason = 'reached_goal'
     and cardinality(sg.board) > 0
  union all
  select g.id
    from common.games g
   where g.gametype = 'scrabble_coop'
     and g.game_ended_reason = 'timeout';

update common.game_players
   set final_ranking = null,
       outcome = 'neutral'
 where game_id in (select id from not_quite_wins);

update common.games
   set game_ended_outcome = 'neutral',
       game_ended_reason = case when game_ended_reason = 'reached_goal'
                                then 'resource_exhausted'
                                else game_ended_reason end
 where id in (select id from not_quite_wins);
