-- ============================================================
-- monkeygram.dump — swap one tile for three from the bunch
-- ============================================================
--
-- A player stuck with an awkward tile (a Q, a lone consonant) trades it: the
-- dumped tile goes back into the bunch and they draw dump_count (default 3) in
-- return — a net +2 to the hand, the cost of getting unstuck.
--
-- Two guarantees from the rules:
--   - You can't dump if the bunch can't cover the draw (length(pool) <
--     dump_count). The dumped tile is returned only AFTER the draw, so it can
--     never refill its own swap.
--   - You won't draw back the SAME tile: we draw from the FRONT of the pool and
--     append the dumped tile to the BACK. (You might draw the same LETTER if
--     another copy was near the front — that's allowed.)
--
-- dump_count comes from setup (default 3) — a future setup option can change it
-- without touching this logic. No board/word validation (v2 trust model); the
-- only check is that the caller actually holds the tile they're dumping.
--
-- Locks the gametype row so a dump and a concurrent peel serialize on the
-- shared pool (both draw from the front).

create function monkeygram.dump(target_game uuid, tile text)
returns void
language plpgsql
security definer
set search_path = monkeygram, common, public, extensions
as $$
declare
  caller_id uuid;
  current_play_state text;
  s_setup jsonb;
  s_dump_count int;
  s_pool text;
  caller_tiles text;
  drawn text;
  pos int;
begin
  -- Serialize against concurrent peels/dumps on the shared pool.
  perform 1 from monkeygram.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  caller_id := common.require_game_player(target_game);

  select play_state, setup into current_play_state, s_setup
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game is not active' using errcode = 'P0001';
  end if;

  tile := upper(tile);
  if tile !~ '^[A-Z]$' then
    raise exception 'tile must be a single letter' using errcode = 'P0001';
  end if;

  s_dump_count := greatest(coalesce((s_setup->>'dump_count')::int, 3), 1);

  select pool into s_pool from monkeygram.games where id = target_game;
  if length(s_pool) < s_dump_count then
    raise exception 'not enough tiles in the bunch to dump' using errcode = 'P0001';
  end if;

  -- The caller must hold the tile they're dumping.
  select tiles into caller_tiles
    from monkeygram.player_boards
   where game_id = target_game and user_id = caller_id;
  pos := position(tile in caller_tiles);
  if pos = 0 then
    raise exception 'you do not hold that tile' using errcode = 'P0001';
  end if;

  -- Draw dump_count from the FRONT; the dumped tile returns to the BACK.
  drawn := substr(s_pool, 1, s_dump_count);

  update monkeygram.player_boards
     set tiles = overlay(caller_tiles placing '' from pos for 1) || drawn,
         updated_at = now()
   where game_id = target_game and user_id = caller_id;

  update monkeygram.games
     set pool = substr(s_pool, s_dump_count + 1) || tile
   where id = target_game;

  -- Held grew by dump_count − 1 (placed unchanged), so unplaced does too.
  update monkeygram.progress
     set unplaced = unplaced + (s_dump_count - 1)
   where game_id = target_game and user_id = caller_id;

  -- Pool net change: −dump_count drawn + 1 returned.
  perform common.update_state(target_game, 'playing',
    jsonb_build_object('pool_remaining', length(s_pool) - s_dump_count + 1));
end;
$$;

revoke execute on function monkeygram.dump(uuid, text) from public;
grant execute on function monkeygram.dump(uuid, text) to authenticated;
