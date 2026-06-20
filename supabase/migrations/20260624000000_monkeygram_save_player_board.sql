-- ============================================================
-- monkeygram.save_player_board — snapshot the private board
-- ============================================================
--
-- The board is high-frequency, PRIVATE scratch state (drag a tile,
-- place a letter — many times a second). It does NOT round-trip per
-- move; the FE owns it as local state and snapshots the whole grid
-- here on a debounce + when the board component unmounts (which, per
-- docs/games/monkeygram.md, is what makes pause/navigate/shelve
-- durable — PauseBoundary UNMOUNTS the play area, so an un-snapshotted
-- board would be lost).
--
-- Only `board` is sent. The player's `tiles` (everything they hold)
-- is SERVER-owned — set at the deal, grown by peel, swapped by dump —
-- and the snapshot never touches it. The hand the player sees is
-- derived FE-side as `tiles − placed`; here we just recompute the
-- public `progress` counts peers watch from the same relationship:
--   placed   = filled (non-'.') board cells
--   unplaced = held tiles not yet placed = length(tiles) − placed
--
-- Trust model: the board is private and unvalidated in v1, so we
-- persist it as-handed. We do NOT check the placed letters are a
-- subset of `tiles` (no injected/relettered tiles) — friends-alpha.
-- `unplaced` is clamped at 0 so a buggy/cheating client can't show a
-- negative count.
--
-- Terminal games are a no-op: a late unmount-snapshot arriving after
-- someone has won shouldn't clobber the final board.

create function monkeygram.save_player_board(target_game uuid, board text)
returns void
language plpgsql
security definer
set search_path = monkeygram, common, public, extensions
as $$
declare
  caller_id uuid;
  is_term boolean;
  n_tiles int;
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

  if length(board) <> 25 * 25 then
    raise exception 'board must be a 625-char string' using errcode = 'P0001';
  end if;

  update monkeygram.player_boards
     set board = save_player_board.board,
         updated_at = now()
   where game_id = target_game and user_id = caller_id;

  -- tiles is unchanged by this call; read it back to recompute counts.
  select length(tiles) into n_tiles
    from monkeygram.player_boards
   where game_id = target_game and user_id = caller_id;
  n_placed := length(replace(board, '.', ''));

  update monkeygram.progress
     set unplaced = greatest(n_tiles - n_placed, 0),
         placed = n_placed
   where game_id = target_game and user_id = caller_id;
end;
$$;

revoke execute on function monkeygram.save_player_board(uuid, text) from public;
grant execute on function monkeygram.save_player_board(uuid, text) to authenticated;
