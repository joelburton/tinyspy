-- cs-unmet

-- ============================================================
-- psychicnum's setup: `guesses` becomes `max_guesses`
-- ============================================================
-- The guess budget chosen at setup (3, 5, 7 or 9). wordle stores the same
-- setting as `max_guesses`; psychicnum's bare `guesses` read as a list of
-- guesses rather than a limit. The per-player count is measured against it
-- (`psychicnum.players.guesses_used` since 20260924000009).
--
-- A DATA migration, because the key lives in stored jsonb: every psychicnum
-- game's `common.games.setup`, and each club's saved setup for the next game,
-- `common.clubs_gametypes.default_setup` — which the setup dialog would
-- otherwise drop silently, falling back to the manifest's default budget.
-- `supabase/sql/` handles the writers and readers; nothing there can reach rows
-- already written.
--
-- Idempotent and narrow: only rows that carry the old key are touched, and `-`
-- removes it in the same expression that adds the new one. A row that has both
-- keeps the NEW value, since `||` is right-biased.
--
-- `games_touch_last_active` stamps `last_active_at` on every update, and the
-- club page sorts and dates games by it; left on, every psychicnum game would
-- move to the deploy's date. It is disabled around the update. It is defined
-- in `supabase/sql/`, so on a fresh `db reset` it does not exist yet and the
-- guard skips it. `clubs_gametypes` has no such trigger.
do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games disable trigger games_touch_last_active;
  end if;
end $$;

update common.games
   set setup = jsonb_build_object('max_guesses', setup -> 'guesses') || (setup - 'guesses')
 where gametype in ('psychicnum_coop', 'psychicnum_compete')
   and setup ? 'guesses';

do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games enable trigger games_touch_last_active;
  end if;
end $$;

update common.clubs_gametypes
   set default_setup = jsonb_build_object('max_guesses', default_setup -> 'guesses')
                       || (default_setup - 'guesses')
 where gametype in ('psychicnum_coop', 'psychicnum_compete')
   and default_setup ? 'guesses';
