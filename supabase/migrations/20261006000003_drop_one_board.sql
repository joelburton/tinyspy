-- cs-unmet

-- ============================================================
-- common.gametypes.one_board is dropped
-- ============================================================
-- 20261001000000 added `one_board` so the static blob could say whether every
-- player's moves land on one board. Its two readers, psychicnum's and
-- connections' `BoardCol`, read `coop` instead, which it equals in both games,
-- and a shared object is now a fact on every player (plans/team-facts.md; Joel,
-- 2026-10-06). `common._make_json_static_game_data` stops writing `oneBoard` in
-- the same change.
--
-- The stored static blobs lose the key here, so no page is handed a key its
-- type no longer has before the next rebuild.

alter table common.gametypes
  drop column one_board;

update common.games
   set static_game_data = static_game_data - 'oneBoard'
 where static_game_data ? 'oneBoard';
