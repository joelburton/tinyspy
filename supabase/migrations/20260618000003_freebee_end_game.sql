-- ============================================================
-- freebee — manual end_game RPC
-- ============================================================
--
-- Unlike tinyspy / psychicnum / wordknit, freebee has no
-- intrinsic "you lost" or "you won" terminal state: the only
-- automatic terminals in v1 are 100%-of-scoring-words found
-- (handled inside submit_word as outcome='completed') and the
-- countdown timer expiring (handled by submit_timeout with
-- outcome='timeout'). For all other cases the friends are
-- expected to play until they're satisfied with their rank and
-- then explicitly stop the game.
--
-- This RPC is that explicit stop. The FE's GamePage menu has an
-- "End game" item (per-game, declared by freebee's PlayArea via
-- ctx.menu.setGameItems) that fires this. Distinct from
-- suspend (which leaves play_state='playing' and is the path
-- "back to club" + start-a-new-game takes): end_game writes a
-- terminal play_state='ended' with status.outcome='manual', so
-- the game appears in the club's "completed" section forever
-- after and the GameOverModal pops.
--
-- Identical shape to submit_timeout, with two differences:
--   - status.outcome='manual' (vs 'timeout')
--   - any game player can fire it (vs the FE's timer-driven
--     dispatch)
-- The Realtime touch on freebee.games is the same trick
-- documented in submit_timeout's migration — needed because
-- common.end_game writes to common.games but the FE's useGame
-- subscribes to freebee.games + freebee.found_words.

create function freebee.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = freebee, common, public, extensions
as $$
declare
  g_row freebee.games%rowtype;
  current_play_state text;
  s_mode text;
  team_score int;
  team_words_found int;
  player_results jsonb;
begin
  select * into g_row from freebee.games
   where freebee.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state, setup->>'mode' into current_play_state, s_mode
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    -- Idempotency: a second click (or a concurrent click + timer
    -- expiry) raises this and the FE swallows it the same way
    -- it does for submit_timeout's "already terminal" race.
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  if s_mode = 'coop' then
    select coalesce(sum(points), 0),
           count(*) filter (where not is_bonus)
      into team_score, team_words_found
      from freebee.found_words
     where game_id = target_game;

    select jsonb_object_agg(
             user_id::text,
             jsonb_build_object(
               'finished', true,
               'team_score', team_score,
               'team_rank_idx',
                 freebee._rank_idx(team_score, g_row.total_score)
             )
           )
      into player_results
      from common.game_players
     where game_id = target_game;

    perform common.end_game(
      target_game, 'ended',
      jsonb_build_object(
        'outcome', 'manual',
        'mode', 'coop',
        'score', team_score,
        'total_score', g_row.total_score,
        'rank_idx', freebee._rank_idx(team_score, g_row.total_score),
        'words_found', team_words_found,
        'total_words', g_row.total_words
      ),
      player_results
    );
  else
    -- compete: per-player aggregates, no winner (the players
    -- agreed to stop). Same shape as submit_timeout's compete
    -- branch.
    select jsonb_object_agg(
             p.user_id::text,
             jsonb_build_object(
               'won', false,
               'score', p.score,
               'rank_idx', freebee._rank_idx(p.score, g_row.total_score)
             )
           )
      into player_results
      from (
        select gp.user_id,
               coalesce(sum(fw.points), 0)::int as score
          from common.game_players gp
          left join freebee.found_words fw
                 on fw.game_id = target_game and fw.user_id = gp.user_id
         where gp.game_id = target_game
         group by gp.user_id
      ) p;

    perform common.end_game(
      target_game, 'ended',
      jsonb_build_object(
        'outcome', 'manual',
        'mode', 'compete'
      ),
      player_results
    );
  end if;

  -- Realtime touch — same trick as submit_timeout. common.end_game
  -- writes to common.games; we need a write on freebee.games so
  -- the FE's freebee-channel useGame subscription wakes up and
  -- refetches games_state. The self-set is a no-op semantically
  -- but produces a WAL entry Realtime picks up.
  update freebee.games
     set club_id = club_id
   where id = target_game;
end;
$$;

revoke execute on function freebee.end_game(uuid) from public;
grant execute on function freebee.end_game(uuid) to authenticated;
