-- ============================================================
-- monkeygram.save_player_board — snapshot the private board
-- ============================================================
--
-- The player board is high-frequency, PRIVATE scratch state (drag a
-- tile, place a letter — many times a second). It does NOT round-trip
-- per move; the FE owns it as local state and snapshots the whole
-- thing here on a debounce + when the board component unmounts (which,
-- per docs/games/monkeygram.md, is what makes pause/navigate/shelve
-- durable — PauseBoundary UNMOUNTS the play area, so an un-snapshotted
-- board would be lost).
--
-- This writes the caller's OWN row only (require_game_player gates it;
-- the owner-only RLS on player_boards is the read-side companion) and
-- recomputes the public `progress` counts peers watch.
--
-- Trust model: the board is private and has no server-validated moves
-- in v1, so we persist the state as-handed and only recompute the
-- counts. We do NOT yet check that the tiles match the dealt bag (no
-- injected/relettered tiles) — friends-alpha, and declare_done (Phase
-- 4) is the gate that matters (it checks the hand is empty). A future
-- hardening could validate the multiset against the seed-dealt tiles.
--
-- Terminal games are a no-op: a late unmount-snapshot arriving after
-- someone has won shouldn't clobber the final board.

create function monkeygram.save_player_board(target_game uuid, state jsonb)
returns void
language plpgsql
security definer
set search_path = monkeygram, common, public, extensions
as $$
declare
  caller_id uuid;
  is_term boolean;
  n_hand int;
  n_placed int;
begin
  caller_id := common.require_game_player(target_game);

  select is_terminal into is_term from common.games where id = target_game;
  if is_term is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if is_term then
    return; -- harmless no-op after game-over
  end if;

  -- Minimal shape guard (catches an FE bug clearly rather than raising an
  -- opaque error below). The contents are trusted.
  if jsonb_typeof(state->'board') is distinct from 'string'
     or jsonb_typeof(state->'hand') is distinct from 'string' then
    raise exception 'state must have string fields "board" and "hand"'
      using errcode = 'P0001';
  end if;
  if length(state->>'board') <> 25 * 25 then
    raise exception 'board must be a 625-char string' using errcode = 'P0001';
  end if;

  -- unplaced = letters still in hand; placed = filled (non-'.') board cells.
  n_hand := length(state->>'hand');
  n_placed := length(replace(state->>'board', '.', ''));

  update monkeygram.player_boards
     set state = save_player_board.state,
         updated_at = now()
   where game_id = target_game and user_id = caller_id;

  update monkeygram.progress
     set unplaced = n_hand,
         placed = n_placed
   where game_id = target_game and user_id = caller_id;
end;
$$;

revoke execute on function monkeygram.save_player_board(uuid, jsonb) from public;
grant execute on function monkeygram.save_player_board(uuid, jsonb) to authenticated;
