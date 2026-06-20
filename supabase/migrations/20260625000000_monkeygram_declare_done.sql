-- ============================================================
-- monkeygram.declare_done — first to lay out all tiles wins
-- ============================================================
--
-- v1's entire win condition. A player who has placed every tile they were
-- dealt (empty hand) clicks "Done"; this ends the game for EVERYONE, with
-- the caller as the winner. First valid declaration wins the race — a
-- second player declaring after the game is already over is rejected.
--
-- What v1 does NOT do: validate the board. We trust that an empty hand
-- means the player laid a real connected grid of real words. Peel/dump and
-- word-validity checking are deliberately deferred (see
-- docs/games/monkeygram.md) — this is the friends-alpha trust model: the
-- only thing worth being server-authoritative about here is the RACE
-- (who finished first, atomically), not policing the grid.
--
-- Race-safety: we lock the gametype row up front so two simultaneous
-- declarations serialize. The first ends the game (play_state -> 'won');
-- the second then reads a non-'playing' state and raises. Without the lock
-- both could read 'playing' and both believe they won.

create function monkeygram.declare_done(target_game uuid)
returns void
language plpgsql
security definer
set search_path = monkeygram, common, public, extensions
as $$
declare
  caller_id uuid;
  current_play_state text;
  n_tiles int;
  n_placed int;
  winner_name text;
  player_results jsonb;
begin
  -- Serialize concurrent declarations on the gametype row (see header).
  perform 1 from monkeygram.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  -- Auth + game-player gate.
  caller_id := common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    -- Already won by someone else (or otherwise terminal) — the race is over.
    raise exception 'game is not active' using errcode = 'P0001';
  end if;

  -- The ONLY v1 gate: the caller's hand must be empty — i.e. every tile
  -- they hold is on the board (hand = tiles − placed = 0). The board is
  -- not otherwise validated (trust model above). Relies on the FE having
  -- flushed its latest board snapshot before calling this.
  select length(tiles), length(replace(board, '.', ''))
    into n_tiles, n_placed
    from monkeygram.player_boards
   where game_id = target_game and user_id = caller_id;
  if n_tiles is null then
    raise exception 'no board for caller' using errcode = 'P0002';
  end if;
  if n_placed <> n_tiles then
    raise exception 'your hand is not empty' using errcode = 'P0001';
  end if;

  -- Mark the winner done in their public progress row (PeersStrip shows it).
  update monkeygram.progress
     set done = true, finished_at = now()
   where game_id = target_game and user_id = caller_id;

  -- Frozen-username for the listing label (survives a later rename).
  select username into winner_name
    from common.profiles where user_id = caller_id;

  -- Winner = caller; everyone else loses.
  select jsonb_object_agg(
           user_id::text,
           case when user_id = caller_id
                then '{"won": true}'::jsonb
                else '{"won": false}'::jsonb
           end)
    into player_results
    from common.game_players
   where game_id = target_game;

  perform common.end_game(
    target_game,
    'won',
    jsonb_build_object('outcome', 'won', 'winner_username', winner_name),
    player_results
  );
end;
$$;

revoke execute on function monkeygram.declare_done(uuid) from public;
grant execute on function monkeygram.declare_done(uuid) to authenticated;
