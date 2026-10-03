-- cs-unmet

-- ============================================================
-- wordle.players.guesses_used is each player's own count, in coop too
-- ============================================================
-- plans/team-facts.md: a player's keys are that player's own in every mode,
-- and what the team shares is summed from the rows at build time. Until now
-- wordle's guess RPC kept every coop row at the TEAM's count (lock-step), so
-- a builder that sums the rows would read a coop game at N times its real
-- count. This rewrites each coop row to the player's own guesses, counted off
-- their rows in `wordle.events`, before the new RPC and builder apply.
--
-- Compete rows were each player's own all along, and are left alone. The
-- page blobs are rebuilt by hand after the deploy
-- (`select wordle._rebuild_data_cols_for_all()`), since a migration cannot
-- call what `supabase/sql/` defines.

create temporary table _wordle_coop_before on commit drop as
  select wp.game_id, max(wp.guesses_used) as team_used
    from wordle.players wp
    join common.games cg on cg.id = wp.game_id
   where cg.mode = 'coop'
   group by wp.game_id;

update wordle.players wp
   set guesses_used = (select count(*)
                         from wordle.events e
                        where e.game_id = wp.game_id and e.user_id = wp.user_id)
  from common.games cg
 where cg.id = wp.game_id
   and cg.mode = 'coop';

-- Every coop game's rows now sum to the count every row carried before: the
-- same guesses, counted once each, by who made them.
do $$
declare off_by bigint;
begin
  select count(*) into off_by
    from _wordle_coop_before b
    join (select game_id, sum(guesses_used) as summed
            from wordle.players group by game_id) after_ on after_.game_id = b.game_id
   where after_.summed <> b.team_used;
  if off_by > 0 then
    raise exception 'wordle.players: % coop game(s) whose rows no longer sum to the team''s count', off_by;
  end if;
end $$;
