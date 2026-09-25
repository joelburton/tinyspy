-- cs-unmet

-- ============================================================
-- psychicnum's setup: `difficulty` becomes `band`
-- ============================================================
-- The dictionary band (1..6) the board's words are drawn from. A band's key
-- says it holds a band: the single-band games name it `band` (stackdown,
-- strands), the paired ones `legal_band` / `required_band`.
--
-- A DATA migration, because the key lives in stored jsonb: every psychicnum
-- game's `common.games.setup`, and each club's saved setup for the next game,
-- `common.clubs_gametypes.default_setup` — which the setup dialog would
-- otherwise drop silently, falling back to the manifest's default band.
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
   set setup = jsonb_build_object('band', setup -> 'difficulty') || (setup - 'difficulty')
 where gametype in ('psychicnum_coop', 'psychicnum_compete')
   and setup ? 'difficulty';

do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games enable trigger games_touch_last_active;
  end if;
end $$;

update common.clubs_gametypes
   set default_setup = jsonb_build_object('band', default_setup -> 'difficulty')
                       || (default_setup - 'difficulty')
 where gametype in ('psychicnum_coop', 'psychicnum_compete')
   and default_setup ? 'difficulty';
