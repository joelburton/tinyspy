-- ============================================================
-- FreeBee — submit_timeout: touch freebee.games after end_game
-- ============================================================
--
-- Bug this fixes (caught during Phase 5 browser smoke):
--
--   Setup: coop game with a short countdown timer; nobody
--   submits a word; timer expires; the FE fires
--   freebee.submit_timeout.
--
--   The RPC flips common.games.play_state='ended' and
--   is_terminal=true via common.end_game. The FE's
--   useCommonGame hook (which subscribes to common.games) sees
--   the terminal flip and updates ctx.isTerminal — so the
--   PlayArea correctly enters review mode.
--
--   BUT the FE's per-gametype useGame hook subscribes to
--   freebee.{games, found_words} and reads from games_state
--   for the scoring_words / legal_words reveal. submit_timeout
--   never writes to any freebee table — no found_words row
--   (no submission happened), no freebee.games UPDATE. So no
--   Realtime event fires on the freebee channel, useGame
--   never refetches, and game.scoringWords stays at its
--   pre-terminal null. The WordList sees revealWords=null and
--   skips the reveal merge → "no words listed" post-timeout.
--
-- For the 100%-found terminal path, this isn't a problem
-- because submit_word INSERTs into freebee.found_words before
-- flipping terminal — the found_words insert fires the
-- Realtime event for free, useGame refetches, and games_state
-- (which now sees is_terminal=true) returns the populated
-- scoring_words / legal_words.
--
-- Fix: have submit_timeout do a no-op UPDATE on freebee.games
-- after the terminal flip so a WAL entry is written and the
-- Realtime subscriber sees something to react to. `set
-- club_id = club_id` is the simplest self-set — no real column
-- change, but Postgres MVCC still produces a new row version
-- (Realtime watches WAL, not changed-column diffs).
--
-- CREATE OR REPLACE — replaces the function definition in
-- place. No data lost.

create or replace function freebee.submit_timeout(target_game uuid)
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
        'outcome', 'timeout',
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
    -- compete: leaderboard at timeout
    select jsonb_object_agg(
             p.user_id::text,
             jsonb_build_object(
               'won', false,                       -- timeout = no winner
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
        'outcome', 'timeout',
        'mode', 'compete'
      ),
      player_results
    );
  end if;

  -- Realtime touch — see the file header for the full
  -- explanation. The self-set is intentional: no column
  -- semantically changes, but Postgres MVCC writes a new row
  -- version and Realtime fires the postgres_changes event,
  -- waking up the FE's useGame subscription so it refetches
  -- games_state and sees the now-revealed scoring_words /
  -- legal_words.
  update freebee.games
     set club_id = club_id
   where id = target_game;
end;
$$;
