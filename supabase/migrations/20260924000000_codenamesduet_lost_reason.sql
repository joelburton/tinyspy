-- cs-unmet

-- ============================================================
-- codenamesduet's losses: `lost_…` play_states become `lost` + a reason
-- ============================================================
-- codenamesduet ended a lost game in one of three play_states —
-- `lost_assassin`, `lost_clock`, `lost_timeout` — where every other game writes
-- `lost` and puts the cause in `status.reason` (docs/states.md: the play_state
-- is the verdict, the reason names the cause). It wrote the reason as well, so
-- the cause was stored twice. `lost_clock` also named the turn budget running
-- out, when "clock" is the countdown timer.
--
-- That ending's reason was `exhausted`, the word other games use for a spent
-- budget; it becomes `turns`, what codenamesduet's budget is.
--
-- A DATA migration, because the play_state lives in stored rows: every lost
-- codenamesduet game in prod carries one. `supabase/sql/` handles the writers
-- and readers; nothing there can reach rows already written.
--
-- The reason is written from the old play_state rather than trusted, so a row
-- whose reason is missing, stale or `exhausted` comes out right. Idempotent: a second run
-- finds no `lost_…` rows.
--
-- `games_touch_last_active` stamps `last_active_at` on every update, and the
-- club page sorts and dates games by it; left on, every lost game would move
-- to the deploy's date. It is disabled around the update. It is defined in
-- `supabase/sql/`, so on a fresh `db reset` it does not exist yet and the
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
   set play_state = 'lost',
       status = coalesce(status, '{}'::jsonb) || jsonb_build_object('reason',
         case play_state
           when 'lost_assassin' then 'assassin'
           when 'lost_clock'    then 'turns'
           when 'lost_timeout'  then 'timeout'
         end)
 where gametype = 'codenamesduet'
   and play_state in ('lost_assassin', 'lost_clock', 'lost_timeout');

do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games enable trigger games_touch_last_active;
  end if;
end $$;
