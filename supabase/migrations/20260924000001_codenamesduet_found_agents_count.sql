-- cs-unmet

-- ============================================================
-- codenamesduet's status: `greens_found` becomes `found_agents_count`
-- ============================================================
-- The club-list count of agents turned over. The games that keep such a count
-- name it `found_<noun>_count` (`found_secrets_count`, `found_words_count`);
-- codenamesduet put the verb last, and said "green", the rulebook's word, where
-- its own glossary says "agent".
--
-- A DATA migration, because the key lives in stored rows: every codenamesduet
-- game carries it. `supabase/sql/` handles the writers and readers; nothing
-- there can reach rows already written.
--
-- Idempotent and narrow: only rows that carry the old key are touched, and `-`
-- removes it in the same expression that adds the new one. A row that has both
-- keeps the NEW value, since `||` is right-biased.
--
-- `games_touch_last_active` stamps `last_active_at` on every update, and the
-- club page sorts and dates games by it; left on, every codenamesduet game
-- would move to the deploy's date. It is disabled around the update. It is
-- defined in `supabase/sql/`, so on a fresh `db reset` it does not exist yet
-- and the guard skips it.
do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games disable trigger games_touch_last_active;
  end if;
end $$;

update common.games
   set status = jsonb_build_object('found_agents_count', status -> 'greens_found')
                || (status - 'greens_found')
 where gametype = 'codenamesduet'
   and status ? 'greens_found';

do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games enable trigger games_touch_last_active;
  end if;
end $$;
