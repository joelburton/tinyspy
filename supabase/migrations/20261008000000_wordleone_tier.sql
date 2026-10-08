-- cs-unmet

-- ============================================================
-- wordleone: the tier a puzzle was built to, beside the one asked for
-- ============================================================
-- `wordleone.games.difficulty` is what the setup ASKED for, and "any" asks
-- for nothing in particular; `wordleone.ratings.difficulty_asked` copies it.
-- Which tier the generator actually built — easy, medium or hard, by the
-- shape of the starter's colors — was nowhere, and the shapes a tier allows
-- move as the generator is tuned, so a later reading of a puzzle's colors
-- could name a different tier than the one it was played as (Joel,
-- 2026-10-08). Both tables gain `tier`, the tier at the time: the game row
-- from the generator at create, the rating copied from the game row.
--
-- The backfill names each existing puzzle's tier by the rule it was built
-- under — every tier before today was a green count, three easy, one or two
-- medium, none hard — read off its own colors; the shapes since then
-- (20261007000009 and the same day's generator) keep that count per tier,
-- so one rule covers every row.

create or replace function pg_temp._tier_of(colors text)
returns text
language sql
immutable
as $$
  select case 5 - length(replace(colors, 'g', ''))
    when 0 then 'hard'
    when 1 then 'medium'
    when 2 then 'medium'
    when 3 then 'easy'
  end
$$;

alter table wordleone.games
  add column tier text;

update wordleone.games
   set tier = pg_temp._tier_of(starter_colors::text);

alter table wordleone.games
  alter column tier set not null,
  add constraint games_tier_check check (tier in ('easy', 'medium', 'hard'));

alter table wordleone.ratings
  add column tier text;

update wordleone.ratings
   set tier = pg_temp._tier_of(starter_colors::text);

alter table wordleone.ratings
  alter column tier set not null,
  add constraint ratings_tier_check check (tier in ('easy', 'medium', 'hard'));
