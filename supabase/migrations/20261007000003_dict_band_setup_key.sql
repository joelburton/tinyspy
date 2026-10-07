-- cs-unmet

-- ============================================================
-- The dictionary-band setup key becomes `dict_band`
-- ============================================================
-- waffle and wordiply stored their dictionary band as `setup.difficulty`.
-- "Difficulty" fails as the name of a band (Joel, 2026-09-28 and 2026-10-07):
-- a game can have two bands, a higher band makes some games easier, and games
-- have other knobs that set how hard they are. Every other game already says
-- `*_band`; the key becomes `dict_band`, and the frontend's shared helper
-- `dictBandValue`.
--
-- A DATA migration, because the key lives in stored jsonb: each game's
-- `common.games.setup`, the copy of it the builders write into
-- `static_game_data.setup` (the page reads the band off that copy, as a setup
-- row), and each club's saved setup for the next game,
-- `common.clubs_gametypes.default_setup` — which the setup dialog would
-- otherwise drop silently, falling back to the manifest's default band.
-- `supabase/sql/` handles the writers and readers; nothing there can reach rows
-- already written. Same shape as 20260924000003_word_band_setup_keys.sql.
--
-- Idempotent and narrow: only rows that carry the old key are touched, and `-`
-- removes it in the same expression that adds the new one. A row that has both
-- keeps the NEW value, since `||` is right-biased. `status_changed_at` is not
-- touched, so the club list keeps its order and dates; `updated_at` is stamped
-- by its trigger, which is what that column is for.

-- Renames one key of a jsonb object, leaving the object alone when the key is
-- absent. Session-local, so it dies with this migration; `or replace` because the
-- earlier band-key migration defines the same helper in the same session.
create or replace function pg_temp._rename_key(obj jsonb, old_key text, new_key text)
returns jsonb
language sql
immutable
as $$
  select case when obj ? old_key
    then jsonb_build_object(new_key, obj -> old_key) || (obj - old_key)
    else obj
  end
$$;

update common.games
   set setup = pg_temp._rename_key(setup, 'difficulty', 'dict_band'),
       static_game_data = case
         when static_game_data ? 'setup'
           then jsonb_set(static_game_data, '{setup}',
                          pg_temp._rename_key(static_game_data -> 'setup', 'difficulty', 'dict_band'))
         else static_game_data
       end
 where gametype in ('waffle_coop', 'waffle_compete', 'wordiply_coop', 'wordiply_compete')
   and (setup ? 'difficulty' or static_game_data -> 'setup' ? 'difficulty');

update common.clubs_gametypes
   set default_setup = pg_temp._rename_key(default_setup, 'difficulty', 'dict_band')
 where gametype in ('waffle_coop', 'waffle_compete', 'wordiply_coop', 'wordiply_compete')
   and default_setup ? 'difficulty';
