-- ============================================================
-- monkeygram.peel — draw a round, or go out (Bananas!)
-- ============================================================
--
-- The heart of v2. A player who has placed every tile they hold (empty hand)
-- clicks "Peel". Two outcomes, decided by whether the bunch can refill the
-- whole table:
--
--   - Enough tiles (pool >= players × peel_count): EVERY player draws
--     peel_count from the bunch and the game continues. (Yes — everyone draws,
--     not just the peeler; that's the threshold's shape.)
--   - Not enough: the peeler goes out and WINS — the Bananagrams endgame.
--
-- v1's declare_done is gone: "place your last tile and the bunch is dry" IS
-- the win condition now, so peel subsumes it.
--
-- peel_count comes from setup (default 1) — a future setup option can make it
-- 2 without touching this logic. There is NO board/word validation in v2; the
-- only gate is "hand empty" (placed == length(tiles)), trusting the FE flushed
-- its latest board first.
--
-- Race-safety: lock the gametype row up front so two simultaneous peels
-- serialize. The first either ends the game or advances the pool; the second
-- then sees the new state (a non-'playing' game, or a smaller pool) and acts on
-- it. Without the lock two peelers could both draw from the same pool slice.

create function monkeygram.peel(target_game uuid)
returns void
language plpgsql
security definer
set search_path = monkeygram, common, public, extensions
as $$
declare
  caller_id uuid;
  current_play_state text;
  s_setup jsonb;
  n_tiles int;
  n_placed int;
  s_peel_count int;
  s_pool text;
  player_count int;
  needed int;
  winner_name text;
  player_results jsonb;
begin
  -- Serialize concurrent peels on the gametype row (see header).
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

  -- Gate: the caller's hand must be empty (every held tile placed).
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

  s_peel_count := greatest(coalesce((s_setup->>'peel_count')::int, 1), 1);
  select pool into s_pool from monkeygram.games where id = target_game;
  select count(*)::int into player_count
    from common.game_players where game_id = target_game;
  needed := player_count * s_peel_count;

  -- ─── Not enough to refill the table → the peeler goes out (win) ───
  if length(s_pool) < needed then
    update monkeygram.progress
       set done = true, finished_at = now()
     where game_id = target_game and user_id = caller_id;

    select username into winner_name
      from common.profiles where user_id = caller_id;

    select jsonb_object_agg(
             user_id::text,
             case when user_id = caller_id
                  then '{"won": true}'::jsonb
                  else '{"won": false}'::jsonb
             end)
      into player_results
      from common.game_players where game_id = target_game;

    perform common.end_game(
      target_game,
      'won',
      jsonb_build_object('outcome', 'won', 'winner_username', winner_name,
                         'pool_remaining', length(s_pool)),
      player_results
    );
    return;
  end if;

  -- ─── Enough → every player draws peel_count from the front of the bunch ───
  -- Player at rank `pi` (1-based, stable order) takes the slice
  -- s_pool[(pi-1)*peel_count + 1 .. peel_count]; the total drawn is `needed`.
  with ranked as (
    select user_id, row_number() over (order by user_id) as pi
      from common.game_players where game_id = target_game
  )
  update monkeygram.player_boards pb
     set tiles = pb.tiles || substr(s_pool, ((r.pi - 1) * s_peel_count + 1)::int, s_peel_count),
         updated_at = now()
    from ranked r
   where pb.game_id = target_game and pb.user_id = r.user_id;

  -- Each player's unplaced count grows by what they just drew (placed is
  -- unchanged by a peel).
  update monkeygram.progress
     set unplaced = unplaced + s_peel_count
   where game_id = target_game;

  -- Advance the bunch past the drawn tiles.
  update monkeygram.games
     set pool = substr(s_pool, needed + 1)
   where id = target_game;

  -- Keep the FE's bunch count current.
  perform common.update_state(target_game, 'playing',
    jsonb_build_object('pool_remaining', length(s_pool) - needed));
end;
$$;

revoke execute on function monkeygram.peel(uuid) from public;
grant execute on function monkeygram.peel(uuid) to authenticated;
