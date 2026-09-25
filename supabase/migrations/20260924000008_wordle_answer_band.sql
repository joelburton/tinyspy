-- cs-unmet

-- ============================================================
-- wordle's setup: `answer_source` becomes `answer_band`
-- ============================================================
-- Where the hidden answer is drawn from: 0 is the curated NYT-Wordle list,
-- 1..6 a dictionary band. 0 is not a real band, but the setting reads as one
-- beside `legal_band`, and the key now says so (the explanation of 0 is
-- `answerMaxBand` in src/wordle/lib/setup.ts).
--
-- A DATA migration, because the key lives in stored jsonb: every wordle game's
-- `common.games.setup`, and each club's saved setup for the next game,
-- `common.clubs_gametypes.default_setup` — which the setup dialog would
-- otherwise drop silently, falling back to the manifest's default.
-- `supabase/sql/` handles the writers and readers; nothing there can reach rows
-- already written.
--
-- Idempotent and narrow: only rows that carry the old key are touched, and `-`
-- removes it in the same expression that adds the new one. A row that has both
-- keeps the NEW value, since `||` is right-biased.
--
-- `games_touch_last_active` stamps `last_active_at` on every update, and the
-- club page sorts and dates games by it; left on, every wordle game would move
-- to the deploy's date. It is disabled around the update. It is defined in
-- `supabase/sql/`, so on a fresh `db reset` it does not exist yet and the
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
   set setup = jsonb_build_object('answer_band', setup -> 'answer_source') || (setup - 'answer_source')
 where gametype in ('wordle_coop', 'wordle_compete')
   and setup ? 'answer_source';

do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games enable trigger games_touch_last_active;
  end if;
end $$;

update common.clubs_gametypes
   set default_setup = jsonb_build_object('answer_band', default_setup -> 'answer_source')
                       || (default_setup - 'answer_source')
 where gametype in ('wordle_coop', 'wordle_compete')
   and default_setup ? 'answer_source';
