-- cs-unmet

-- ============================================================
-- strands.players' hint count is each player's own, in coop too, and says so
-- ============================================================
-- plans/team-facts.md: a player's keys are that player's own in every mode,
-- and what the team shares is summed at build time. Until now `spend_hint`
-- kept every coop row at the TEAM's count of hints spent, so a builder that
-- sums the rows would read a coop game at N times its real count. This
-- rewrites each coop row to the hints that player cashed, counted off their
-- `kind = 'hint'` rows in `strands.events`. The hint bar (`hint_points`) and
-- the ringed hint (`active_hint_coords`) stay lock-step on every coop row:
-- they are the team's one pool, not a fact about a player.
--
-- The column then takes the blob's name: a count is `nFoo`
-- (docs/code-conventions.md → A few words may be abbreviated), so
-- `hints_spent` → `n_hints_used` (`nHintsUsed`).
--
-- Compete rows were each player's own all along, and are left alone. The
-- page blobs are rebuilt by hand after the deploy
-- (`select strands._rebuild_data_cols_for_all()`), since a migration cannot
-- call what `supabase/sql/` defines.

create temporary table _strands_coop_before on commit drop as
  select sp.game_id, max(sp.hints_spent) as team_used
    from strands.players sp
    join common.games cg on cg.id = sp.game_id
   where cg.mode = 'coop'
   group by sp.game_id;

update strands.players sp
   set hints_spent = (select count(*)
                        from strands.events e
                       where e.game_id = sp.game_id
                         and e.user_id = sp.user_id
                         and e.kind = 'hint')
  from common.games cg
 where cg.id = sp.game_id
   and cg.mode = 'coop';

-- Every coop game's rows now sum to the count every row carried before: the
-- same hints, counted once each, by who cashed them.
do $$
declare off_by bigint;
begin
  select count(*) into off_by
    from _strands_coop_before b
    join (select game_id, sum(hints_spent) as summed
            from strands.players group by game_id) after_ on after_.game_id = b.game_id
   where after_.summed <> b.team_used;
  if off_by > 0 then
    raise exception 'strands.players: % coop game(s) whose rows no longer sum to the team''s count', off_by;
  end if;
end $$;

alter table strands.players
  rename column hints_spent to n_hints_used;
