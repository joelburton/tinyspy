-- cs-unmet

-- ============================================================
-- The word-band setup keys become `legal_band` / `required_band`
-- ============================================================
-- A word band is a dictionary difficulty ceiling, 1..6: a word counts when its
-- `common.words.difficulty` is at or below it. boggle and letterboxed already
-- store theirs as `legal_band`; this brings the rest into line, so the key says
-- it holds a band number:
--
--   wordle                  `legal_guess`         → `legal_band`
--   spellingbee, wordwheel  `legal` / `required`  → `legal_band` / `required_band`
--
-- wordle also keeps its band on `wordle.games`, where submit_guess reads it;
-- that column is renamed with it.
--
-- A DATA migration for the rest, because the keys live in stored jsonb: every
-- game's `common.games.setup`, and each club's saved setup for the next game,
-- `common.clubs_gametypes.default_setup` — which the setup dialog would
-- otherwise drop silently, falling back to the manifest's default band.
-- `supabase/sql/` handles the writers and readers; nothing there can reach rows
-- already written.
--
-- Idempotent and narrow: only rows that carry an old key are touched, and `-`
-- removes it in the same expression that adds the new one. A row that has both
-- keeps the NEW value, since `||` is right-biased.
alter table wordle.games
  rename column legal_guess to legal_band;

-- Renames one key of a jsonb object, leaving the object alone when the key is
-- absent. Session-local, so it dies with this migration.
create function pg_temp._rename_key(obj jsonb, old_key text, new_key text)
returns jsonb
language sql
immutable
as $$
  select case when obj ? old_key
    then jsonb_build_object(new_key, obj -> old_key) || (obj - old_key)
    else obj
  end
$$;

-- `games_touch_last_active` stamps `last_active_at` on every update, and the
-- club page sorts and dates games by it; left on, every game here would move
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
   set setup = pg_temp._rename_key(setup, 'legal_guess', 'legal_band')
 where gametype in ('wordle_coop', 'wordle_compete')
   and setup ? 'legal_guess';

update common.games
   set setup = pg_temp._rename_key(
                 pg_temp._rename_key(setup, 'legal', 'legal_band'),
                 'required', 'required_band')
 where gametype in ('spellingbee_coop', 'spellingbee_compete',
                    'wordwheel_coop', 'wordwheel_compete')
   and (setup ? 'legal' or setup ? 'required');

do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games enable trigger games_touch_last_active;
  end if;
end $$;

update common.clubs_gametypes
   set default_setup = pg_temp._rename_key(default_setup, 'legal_guess', 'legal_band')
 where gametype in ('wordle_coop', 'wordle_compete')
   and default_setup ? 'legal_guess';

update common.clubs_gametypes
   set default_setup = pg_temp._rename_key(
                         pg_temp._rename_key(default_setup, 'legal', 'legal_band'),
                         'required', 'required_band')
 where gametype in ('spellingbee_coop', 'spellingbee_compete',
                    'wordwheel_coop', 'wordwheel_compete')
   and (default_setup ? 'legal' or default_setup ? 'required');
