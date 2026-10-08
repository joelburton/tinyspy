-- cs-unmet

-- ============================================================
-- wordleone's setup knob becomes the answer band
-- ============================================================
-- wordleone's setup held `legal_band`, the band a guess must be in and the
-- pool the answer is unique in, while every answer came from the NYT answer
-- list, which has no word above band 2. The knob is now `answer_band` in
-- wordle's meaning — 0 the NYT list, 1..6 any clean word at or below — and
-- the legal band is derived from it, two above (`wordleone._legal_band_for`),
-- and stored on `wordleone.games` as before (Joel, 2026-10-07;
-- plans/wordleone.md decisions 18–19).
--
-- A DATA migration, because the key lives in stored jsonb: each game's
-- `common.games.setup`, the copy of it the builders write into
-- `static_game_data.setup` (the page reads the setup rows off that copy), and
-- each club's saved setup for the next game, `common.clubs_gametypes
-- .default_setup`. Every game so far was dealt from the NYT list, so each gets
-- `answer_band: 0`, and `legal_band` leaves the setup so no setup row shows a
-- knob that no longer exists; the games' own `legal_band` column is untouched.
-- A saved default keeps nothing of its old band: the club picks again. Same
-- shape as 20261007000003_dict_band_setup_key.sql.
--
-- Idempotent and narrow: only rows that carry the old key or lack the new one
-- are touched. `status_changed_at` is not touched, so the club list keeps its
-- order and dates.

-- Drops `legal_band` and adds `answer_band: 0`, leaving an object alone that
-- already has the new key and not the old. Session-local, so it dies with this
-- migration.
create or replace function pg_temp._answer_band_setup(obj jsonb)
returns jsonb
language sql
immutable
as $$
  select case when obj ? 'legal_band' or not obj ? 'answer_band'
    then (obj - 'legal_band') || '{"answer_band": 0}'::jsonb
    else obj
  end
$$;

update common.games
   set setup = pg_temp._answer_band_setup(setup),
       static_game_data = case
         when static_game_data ? 'setup'
           then jsonb_set(static_game_data, '{setup}',
                          pg_temp._answer_band_setup(static_game_data -> 'setup'))
         else static_game_data
       end
 where gametype in ('wordleone_coop', 'wordleone_compete')
   and (setup ? 'legal_band' or not setup ? 'answer_band'
        or static_game_data -> 'setup' ? 'legal_band'
        or (static_game_data ? 'setup' and not static_game_data -> 'setup' ? 'answer_band'));

update common.clubs_gametypes
   set default_setup = pg_temp._answer_band_setup(default_setup)
 where gametype in ('wordleone_coop', 'wordleone_compete')
   and default_setup is not null
   and (default_setup ? 'legal_band' or not default_setup ? 'answer_band');
