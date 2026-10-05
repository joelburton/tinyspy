-- cs-unmet

-- ============================================================
-- waffle.players' swap count is each player's own, in coop too, and says so
-- ============================================================
-- plans/team-facts.md: a player's keys are that player's own in every mode,
-- and what the team shares is summed from the rows at build time. Until now
-- `submit_swap` kept every coop row at the TEAM's count (lock-step, beside
-- the shared board), so a builder that sums the rows would read a coop game
-- at N times its real count. This rewrites each coop row to the player's own
-- swaps, counted off their rows in `waffle.events`, before the new RPC and
-- builder apply. The board stays lock-step: it is one shared board.
--
-- The column then takes the blob's name: a count is `nFoo`
-- (docs/code-conventions.md → A few words may be abbreviated), so
-- `swaps_used` → `n_swaps_used` (`nSwapsUsed`).
--
-- Compete rows were each player's own all along, and are left alone. The
-- page blobs are rebuilt by hand after the deploy
-- (`select waffle._rebuild_data_cols_for_all()`), since a migration cannot
-- call what `supabase/sql/` defines.

create temporary table _waffle_coop_before on commit drop as
  select wp.game_id, max(wp.swaps_used) as team_used
    from waffle.players wp
    join common.games cg on cg.id = wp.game_id
   where cg.mode = 'coop'
   group by wp.game_id;

update waffle.players wp
   set swaps_used = (select count(*)
                       from waffle.events e
                      where e.game_id = wp.game_id and e.user_id = wp.user_id)
  from common.games cg
 where cg.id = wp.game_id
   and cg.mode = 'coop';

-- Every coop game's rows now sum to the count every row carried before: the
-- same swaps, counted once each, by who made them.
do $$
declare off_by bigint;
begin
  select count(*) into off_by
    from _waffle_coop_before b
    join (select game_id, sum(swaps_used) as summed
            from waffle.players group by game_id) after_ on after_.game_id = b.game_id
   where after_.summed <> b.team_used;
  if off_by > 0 then
    raise exception 'waffle.players: % coop game(s) whose rows no longer sum to the team''s count', off_by;
  end if;
end $$;

alter table waffle.players
  rename column swaps_used to n_swaps_used;
