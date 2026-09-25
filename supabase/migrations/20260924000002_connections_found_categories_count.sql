-- cs-unmet

-- ============================================================
-- connections: `matched_count` becomes `found_categories_count`
-- ============================================================
-- How many of the four categories a player has solved, kept in two places
-- under one name: the public `connections.players` column a racer's opponent
-- strip reads, and the club-list count in `common.games.status`. The games
-- that keep such a count name it `found_<noun>_count` (psychicnum's
-- `players.found_secrets_count` is this column's twin); "matched" stays the
-- word for a category's state on the board.
--
-- The column rename carries every row with it. The status key is a DATA
-- change: `supabase/sql/` handles the writers and readers, and nothing there
-- can reach rows already written.
alter table connections.players
  rename column matched_count to found_categories_count;
alter table connections.players
  rename constraint players_matched_count_check to players_found_categories_count_check;

-- The status key. Idempotent and narrow: only rows that carry the old key are
-- touched, and `-` removes it in the same expression that adds the new one. A
-- row that has both keeps the NEW value, since `||` is right-biased.
--
-- `games_touch_last_active` stamps `last_active_at` on every update, and the
-- club page sorts and dates games by it; left on, every connections game would
-- move to the deploy's date. It is disabled around the update. It is defined
-- in `supabase/sql/`, so on a fresh `db reset` it does not exist yet and the
-- guard skips it.
do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games disable trigger games_touch_last_active;
  end if;
end $$;

update common.games
   set status = jsonb_build_object('found_categories_count', status -> 'matched_count')
                || (status - 'matched_count')
 where gametype in ('connections_coop', 'connections_compete')
   and status ? 'matched_count';

do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games enable trigger games_touch_last_active;
  end if;
end $$;
