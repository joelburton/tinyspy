-- ============================================================
-- Remove tinyspy.play_again + games.next_game_id
-- ============================================================
--
-- Rationale: the original "Play again" shortcut on the game-over
-- banner called this RPC to spawn a successor game with fresh
-- words + key card. With the per-game setup-dialog work landing
-- (turn count, first clue-giver choice), there is now exactly
-- one game-creation path: the club page's "Start X" button →
-- setup dialog → create_game. "Play again" would have needed
-- either its own setup dialog (doubling the work) or to skip
-- setup entirely (inconsistent UX). The simpler shape: when a
-- game ends, the user returns to the club page and starts a new
-- one through the normal flow.
--
-- Side benefit: removing the second creation path eliminates a
-- duplicated-board-generation hazard. create_game and play_again
-- BOTH inlined the Duet key-card distribution + word pick; any
-- change to that logic had to land in two places. Now there's
-- only one place.
--
-- We may add a different "one-click rematch" affordance back
-- later if it earns its keep, but it would either thread the
-- previous config through the modal or skip the modal with the
-- prior choices — both deliberate decisions, not an accidental
-- bypass like the old play_again was.

drop function if exists tinyspy.play_again(uuid);

-- The column was a self-FK used solely by play_again's idempotency
-- check. With the RPC gone, nothing reads or writes it.
alter table tinyspy.games drop column if exists next_game_id;
