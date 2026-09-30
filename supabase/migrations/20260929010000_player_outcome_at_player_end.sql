-- cs-unmet

-- ============================================================
-- A player who has ended while the game goes on gets their outcome at once
-- ============================================================
-- `common.game_players.outcome` used to be written only at the game's end.
-- It is now written when a player ends as well (docs/win-lose.md →
-- `outcome-at-player-end`): `common._concede` writes `lost`, and every
-- `common._set_player_ended` caller passes the outcome it judges. This
-- brings the players who ended in a game still in play up to the same rule;
-- an ended game already has every outcome from `common._end_game`.
--
-- A DATA migration: the column keeps its shape. The rows it touches, and what
-- each caller now writes for them:
--   - conceded, in any game                                    → lost
--   - out of the budget (`resource_exhausted`) in connections,
--     waffle, psychicnum and wordle: eliminated                → lost
--   - wordiply's fifth word (`resource_exhausted`), and a solve
--     (`reached_goal`) in waffle, strands and wordle, which
--     the ranking judges at the end                            → neutral
-- bananagrams' `reached_goal` ends the game in the same call, so no such
-- row is left in a game still in play.

update common.game_players gp
   set outcome = case
     when gp.player_ended_reason = 'conceded' then 'lost'
     when gp.player_ended_reason = 'resource_exhausted'
      and cg.gametype not like 'wordiply\_%' then 'lost'
     else 'neutral'
   end
  from common.games cg
 where cg.id = gp.game_id
   and cg.ended_at is null
   and gp.player_ended_at is not null
   and gp.outcome is null;
