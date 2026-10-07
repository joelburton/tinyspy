-- cs-unmet

-- ============================================================
-- wordiply coop: five words played is no result
-- ============================================================
-- A coop wordiply game ends when the team has played its five words. That
-- was a win, the team ranked 1; it is now no result, everyone neutral and
-- unranked: any five words reach it, so playing them out is not a win
-- (plans/game-cards.md, wordiply). `wordiply.submit_guess` ends new games this
-- way; this rewrites the games that already ended, so a past game reads as a
-- new one would. The reason and detail stay (`resource_exhausted` /
-- `complete`). The page blobs carry the outcomes and are rebuilt by every
-- game's `_rebuild_data_cols_for_all()` on deploy.

create temp table five_words on commit drop as
  select g.id
    from common.games g
   where g.gametype = 'wordiply_coop'
     and g.game_ended_reason = 'resource_exhausted'
     and g.game_ended_outcome = 'won';

update common.game_players
   set final_ranking = null,
       outcome = 'neutral'
 where game_id in (select id from five_words);

update common.games
   set game_ended_outcome = 'neutral'
 where id in (select id from five_words);
