-- cs-unmet

-- ============================================================
-- connections: the counts are each player's own, under the page blobs' names
-- ============================================================
-- Two things, in one deploy with the builder that reads them:
--
-- The three count columns take the names the page blobs spell them in
-- (docs/code-conventions.md → TypeScript casing: a blob key is its column,
-- camelCased): `n_matched_cats` → `nMatchedCats`, `n_mistakes` →
-- `nMistakes`, `matched_cat_rank` → `matchedCatRank`. A rename carries every
-- row and its check constraint with it.
--
-- `n_mistakes` becomes each player's own in coop too (docs/common-schema.md → A
-- player's facts: a player's keys are that player's own in every mode, and what
-- the team shares is summed from the rows at build time). Until now the guess
-- RPC kept every coop row at the TEAM's count (lock-step), so a builder that
-- sums the rows would read a coop game at N times its real count. This rewrites
-- each coop row to the player's own misses, counted off their rows in
-- `connections.events`, before the new RPC and builder apply.
--
-- Compete rows were each player's own all along, and `n_matched_cats` was in
-- both modes; both are left alone. The page blobs are rebuilt by hand after
-- the deploy (`select connections._rebuild_data_cols_for_all()`), since a
-- migration cannot call what `supabase/sql/` defines.

alter table connections.players
  rename column found_categories_count to n_matched_cats;
alter table connections.players
  rename constraint players_found_categories_count_check to players_n_matched_cats_check;
alter table connections.players
  rename column mistake_count to n_mistakes;
alter table connections.players
  rename constraint players_mistake_count_check to players_n_mistakes_check;
alter table connections.events
  rename column matched_category_rank to matched_cat_rank;
alter table connections.events
  rename constraint events_matched_category_rank_check to events_matched_cat_rank_check;

create temporary table _connections_coop_before on commit drop as
  select cp.game_id, max(cp.n_mistakes) as team_mistakes
    from connections.players cp
    join common.games cg on cg.id = cp.game_id
   where cg.mode = 'coop'
   group by cp.game_id;

update connections.players cp
   set n_mistakes = (select count(*)
                       from connections.events e
                      where e.game_id = cp.game_id
                        and e.user_id = cp.user_id
                        and e.result <> 'correct')
  from common.games cg
 where cg.id = cp.game_id
   and cg.mode = 'coop';

-- Every coop game's rows now sum to the count every row carried before: the
-- same misses, counted once each, by who made them.
do $$
declare off_by bigint;
begin
  select count(*) into off_by
    from _connections_coop_before b
    join (select game_id, sum(n_mistakes) as summed
            from connections.players group by game_id) after_ on after_.game_id = b.game_id
   where after_.summed <> b.team_mistakes;
  if off_by > 0 then
    raise exception 'connections.players: % coop game(s) whose rows no longer sum to the team''s mistakes', off_by;
  end if;
end $$;
