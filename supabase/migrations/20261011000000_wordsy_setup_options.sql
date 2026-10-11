-- cs-unmet

-- ============================================================
-- wordsy — two setup options: a short game, and one word a round
-- ============================================================
--
-- `n_rounds` is 7 (the rulebook's game, the best five rounds counted) or 3 (a
-- short game, the best two). `one_word` makes every submit final and ends a
-- round once everyone still playing has submitted, as the no-timer style
-- always does; with the timer, the clock still ends it first. Both are fixed
-- at create.
--
-- Every existing game is a standard one with words that can change, so the
-- defaults are its values, and its setup — which the setup rows read back —
-- and a club's saved default gain the two keys with them.

alter table wordsy.games
  add column n_rounds int not null default 7 check (n_rounds in (3, 7)),
  add column one_word boolean not null default false;

update common.games
   set setup = setup || '{"n_rounds": 7, "one_word": false}'::jsonb
 where gametype = 'wordsy_compete'
   and not (setup ? 'n_rounds');

update common.clubs_gametypes
   set default_setup = default_setup || '{"n_rounds": 7, "one_word": false}'::jsonb
 where gametype = 'wordsy_compete'
   and default_setup is not null
   and not (default_setup ? 'n_rounds');
