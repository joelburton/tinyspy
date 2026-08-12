-- ============================================================
-- boggle — the REPEATABLE half
-- ============================================================
-- Functions, views, RLS policies, triggers and grants for boggle. Everything
-- here is drop-and-recreate safe, so this file is **re-applied in full on
-- every deploy** (`gmake db-sql`) — it is the CURRENT definition, not a
-- delta. Edit it in place forever; it never becomes a migration.
--
-- Its other half is the one-shot schema migration
-- `supabase/migrations/20260628000000_boggle.sql` — tables, constraints, indexes,
-- the Realtime publication and seed rows. That one is applied once and then
-- frozen, because `alter table` cannot be re-run.
--
-- Order is load-bearing: a policy can only reference a function that already
-- exists, so statements stay in the order they were written. See
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema boggle to authenticated;

-- All columns are readable by club members (RLS gates the rows). No
-- column-level grant: unlike spellingbee, required_words is intentionally
-- visible — see the header note.
grant select on boggle.games to authenticated;

grant select on boggle.found_words to authenticated;

-- Anyone in the club can read the game (board + required list included).
drop policy if exists games_select on boggle.games;
create policy games_select on boggle.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Found-words visibility, mode-aware (the load-bearing piece for compete):
--   (1) coop          — everyone in the club sees everyone's finds.
--   (2) your own       — you always see your finds (private in compete mid-game).
--   (3) is_terminal    — once the game ends, everyone sees everything.
drop policy if exists found_words_select on boggle.found_words;
create policy found_words_select on boggle.found_words
  for select to authenticated
  using (
    exists (
      select 1 from boggle.games fg
       join common.games cg on cg.id = fg.id
       where fg.id = found_words.game_id
         and common.is_club_member(fg.club_handle)
         and (
               fg.mode = 'coop'
            or found_words.user_id = auth.uid()
            or cg.is_terminal
             )
    )
  );

-- ============================================================
-- create_game — called by the boggle-build-board edge function.
-- ============================================================
create or replace function boggle.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  mode text,
  board jsonb
)
returns table(id uuid)
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  new_id uuid;
  game_title text;
  effective_gametype text;
  s_min_word_length int;
  s_band int;
  s_legal_band int;
  s_ladder text;
  s_win_percent int;
  b_board text;
  b_n int;
  b_required_count int;
  b_required_score int;
  -- A player-typed board (setup.custom_board non-empty) — the board came from
  -- the dialog, not the roll loop. Changes what we demand of it, and keeps it
  -- out of the club's saved default.
  is_custom_board boolean;
begin
  perform common.require_club_member(target_club);

  -- ─── Mode + player-count ─────────────────────────────────
  perform common.require_valid_mode(mode);
  if mode = 'compete' and coalesce(array_length(player_user_ids, 1), 0) < 2 then
    raise exception 'too-few-players|' using errcode = 'P0001',
      detail = 'compete needs >= 2 players';
  end if;
  perform common.require_player_count_max(player_user_ids, 8);

  -- ─── Setup validation ────────────────────────────────────
  perform common.require_valid_timer(setup->'timer');

  s_min_word_length := coalesce((setup->>'min_word_length')::int, 3);
  if s_min_word_length < 3 or s_min_word_length > 9 then
    raise exception 'bad-min-word-length|%|', s_min_word_length
      using errcode = 'P0001',
      detail = 'setup.min_word_length must be 3..9';
  end if;

  s_band := (setup->>'band')::int;
  if s_band is null or s_band < 1 or s_band > 6 then
    raise exception 'bad-band|%|', setup->>'band' using errcode = 'P0001',
      detail = 'setup.band must be 1..6';
  end if;

  -- The legal (bonus) band is the difficulty ceiling for words that aren't on
  -- the required list but still score. It must be at least the required band
  -- (every required word is, by definition, also legal) and at most 6.
  s_legal_band := (setup->>'legal_band')::int;
  if s_legal_band is null or s_legal_band < s_band or s_legal_band > 6 then
    raise exception 'bad-legal-band|%|', setup->>'legal_band'
      using errcode = 'P0001',
      detail = 'setup.legal_band must be between band and 6';
  end if;

  s_ladder := setup->>'scoring_ladder';
  if s_ladder is null or s_ladder not in ('flat', 'basic', 'fib', 'big') then
    raise exception 'bad-scoring-ladder|%|', s_ladder
      using errcode = 'P0001',
      detail = 'scoring_ladder must be flat, basic, fib or big';
  end if;

  if coalesce(setup->>'dice_set', '') = '' then
    raise exception 'missing-dice-set|' using errcode = 'P0001',
      detail = 'setup.dice_set absent';
  end if;

  -- win_percent: NULL/absent = "no target"; otherwise 50..100 in steps of 5.
  -- The score bar a player/team must reach to win (see submit_word).
  s_win_percent := (setup->>'win_percent')::int;   -- NULL when absent or JSON null
  if s_win_percent is not null
     and (s_win_percent < 50 or s_win_percent > 100 or s_win_percent % 5 <> 0) then
    raise exception 'bad-win-percent|%|', s_win_percent
      using errcode = 'P0001',
      detail = 'win_percent must be 50..100 in steps of 5, or null';
  end if;

  -- ─── Board validation (built by the edge function) ───────
  b_board := board->>'board';
  b_n := (board->>'n')::int;
  if b_board is null or b_n is null or b_n < 4 or b_n > 6 then
    raise exception 'bad-board|' using errcode = 'P0001',
      detail = 'board.board / board.n missing or malformed';
  end if;
  if length(b_board) <> b_n * b_n then
    raise exception 'bad-board-length|%|%|', length(b_board), b_n * b_n using errcode = 'P0001',
      detail = 'board length must be n squared';
  end if;
  if jsonb_typeof(board->'required_words') <> 'array' then
    raise exception 'bad-required-words|' using errcode = 'P0001',
      detail = 'board.required_words must be a jsonb array';
  end if;
  -- bonus_words is optional (empty when legal_band == band); if present it must
  -- be an array of the same { word, points } shape.
  if board ? 'bonus_words' and jsonb_typeof(board->'bonus_words') <> 'array' then
    raise exception 'bad-bonus-words|' using errcode = 'P0001',
      detail = 'board.bonus_words must be a jsonb array';
  end if;
  b_required_count := (board->>'required_words_count')::int;
  b_required_score := (board->>'required_words_score')::int;

  -- A player-typed board (setup.custom_board non-empty) skipped the roll loop
  -- entirely, so nothing measured it. It must still have SOMETHING to find:
  -- `win_percent` is a share of the required-words score, so a board with none
  -- makes the threshold 0 and the first bonus word wins the game. The edge
  -- function checks this too; rechecked here so a misbehaving builder can't
  -- sneak a degenerate board past. (Rolled boards are governed by their own
  -- constraints, which are the player's to set — including none.)
  is_custom_board := coalesce(setup->>'custom_board', '') <> '';
  if is_custom_board and coalesce(b_required_count, 0) < 1 then
    raise exception 'no-required-words|%|', s_band using errcode = 'P0001',
      detail = 'the typed board produces no words at that band';
  end if;

  -- ─── Title + gametype ────────────────────────────────────
  -- Brand ("MothCubes") lives only in the manifest; the stored title is the
  -- board's size and its top row — "4×4 ABQuD" — which both sizes a game and
  -- makes two same-size games tellable apart. The board is shown to every
  -- player, so nothing is leaked.
  --
  -- The stored board packs a multiface die as a single digit (1=Qu 2=In 3=Th
  -- 4=Er 5=He 6=An, 0=blank — see src/boggle/lib/dice.ts), so the title
  -- expands them to the faces a player actually sees on the tile.
  select b_n || '×' || b_n || ' ' || string_agg(
           case substr(b_board, i, 1)
             when '0' then '?'  when '1' then 'Qu' when '2' then 'In'
             when '3' then 'Th' when '4' then 'Er' when '5' then 'He'
             when '6' then 'An' else upper(substr(b_board, i, 1))
           end, '' order by i)
    into game_title
    from generate_series(1, b_n) i;
  effective_gametype := 'boggle_' || mode;

  -- ─── common.games header (saves setup as the club default) ─
  -- Saved-default arg: the whole setup, MINUS the one-off custom board. A
  -- hand-typed board is a "here, try these letters" for one game, not the club's
  -- new baseline, so the next dialog opens with the field blank and rolls again
  -- (freebee + word wheel strip their custom letters the same way).
  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids, game_title, setup,
    setup - 'custom_board'
  );

  insert into boggle.games (
    id, club_handle, mode, board, n, min_word_length, legal_band,
    required_words, bonus_words, required_words_count, required_words_score, win_percent
  )
  values (
    new_id, target_club, mode, b_board, b_n, s_min_word_length, s_legal_band,
    board->'required_words', coalesce(board->'bonus_words', '[]'::jsonb),
    b_required_count, b_required_score, s_win_percent
  );

  -- ─── Seed common.games.status for the club-page label ────
  if mode = 'coop' then
    perform common.update_state(new_id, 'playing', jsonb_build_object(
      'mode', 'coop', 'found_words_count', 0, 'found_words_score', 0,
      'required_words_count', b_required_count, 'required_words_score', b_required_score
    ));
  else
    perform common.update_state(new_id, 'playing', jsonb_build_object(
      'mode', 'compete', 'leaderboard', '[]'::jsonb,
      'required_words_count', b_required_count, 'required_words_score', b_required_score
    ));
  end if;

  return query select new_id;
end;
$$;

revoke execute on function boggle.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function boggle.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

-- ============================================================
-- _refresh_status — recompute the club-page label after a find.
-- ============================================================
create or replace function boggle._refresh_status(target_game uuid)
returns void
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  g_mode text;
  g_req_count int;
  g_req_score int;
  fc int;
  fs int;
  lb jsonb;
begin
  select mode, required_words_count, required_words_score
    into g_mode, g_req_count, g_req_score
    from boggle.games where id = target_game;

  if g_mode = 'coop' then
    select count(*), coalesce(sum(points), 0) into fc, fs
      from boggle.found_words where game_id = target_game;
    perform common.update_state(target_game, 'playing', jsonb_build_object(
      'mode', 'coop', 'found_words_count', fc, 'found_words_score', fs,
      'required_words_count', g_req_count, 'required_words_score', g_req_score
    ));
  else
    select coalesce(jsonb_agg(row order by score desc), '[]'::jsonb) into lb
      from (
        select jsonb_build_object('user_id', user_id,
                                  'found_words_count', count(*),
                                  'found_words_score', sum(points)) as row,
               sum(points) as score
          from boggle.found_words where game_id = target_game
         group by user_id
      ) t;
    perform common.update_state(target_game, 'playing', jsonb_build_object(
      'mode', 'compete', 'leaderboard', lb,
      'required_words_count', g_req_count, 'required_words_score', g_req_score
    ));
  end if;
end;
$$;

revoke execute on function boggle._refresh_status(uuid) from public;

-- ============================================================
-- submit_word — record a guess (trusting-commit; see header).
-- ============================================================
-- The FE validated the word against the board's shipped legal list (required ∪
-- bonus) and scored it, so this trusts `word` + `points` + `is_bonus` and only
-- does the things the FE can't: enforce the game is live, dedup, record, and
-- refresh the club-page status. No word-content or dictionary check.
create or replace function boggle.submit_word(
  target_game uuid,
  word text,
  points int,
  is_bonus boolean
)
returns jsonb
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  caller_id uuid;
  g_mode text;
  g_playstate text;
  w_lower text;
  dup_count int;
  g_win_percent int;
  g_req_score int;
  threshold int;
  total_score int;
begin
  caller_id := common.require_game_player(target_game);

  select bg.mode, cg.play_state
    into g_mode, g_playstate
    from boggle.games bg join common.games cg on cg.id = bg.id
   where bg.id = target_game;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no boggle.games row for target_game';
  end if;
  if g_playstate <> 'playing' then
    return jsonb_build_object('result', 'gameOver', 'points', 0);
  end if;

  -- A conceded player is out of the race — no more words. The FE gates on
  -- myConceded, so this only fires on a race (a submit in flight when concede
  -- commits, or a stale second tab). Raise (rather than a soft 'gameOver'
  -- return) so useWordSubmit releases the optimistically-accepted word.
  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you-conceded|' using errcode = 'P0001',
      detail = 'caller already dropped out of this compete race';
  end if;

  w_lower := lower(coalesce(word, ''));

  -- Dedup, mode-aware: coop = whole team, compete = this player. Alias the table
  -- so `word` resolves to the column, not the same-named function parameter.
  if g_mode = 'coop' then
    select count(*) into dup_count from boggle.found_words fw
      where fw.game_id = target_game and fw.word = w_lower;
  else
    select count(*) into dup_count from boggle.found_words fw
      where fw.game_id = target_game and fw.user_id = caller_id and fw.word = w_lower;
  end if;
  if dup_count > 0 then
    return jsonb_build_object('result', 'alreadyFound', 'points', 0);
  end if;

  insert into boggle.found_words (game_id, user_id, word, points, is_bonus)
    values (target_game, caller_id, w_lower, coalesce(points, 0), coalesce(is_bonus, false));

  perform boggle._refresh_status(target_game);

  -- Win-on-target: if this game has a score bar and the caller (compete) or the
  -- team (coop) has now reached it, END the game with a win. The threshold is
  -- win_percent% of the required-words score, measured against the score of the
  -- REQUIRED words found ONLY — bonus points do NOT count (so 100% means every
  -- required word, and 50% means required finds worth half the required total).
  -- In compete this is a RACE — the player who just crossed wins immediately
  -- (scores are private, so "first to cross" is the fair rule); the non-'playing'
  -- guard above makes a near-simultaneous second crosser a no-op 'gameOver'.
  select win_percent, required_words_score into g_win_percent, g_req_score
    from boggle.games where id = target_game;
  if g_win_percent is not null then
    threshold := ceil(g_win_percent::numeric / 100 * g_req_score)::int;
    if g_mode = 'coop' then
      -- Alias `fw` so `points` resolves to the column, not the RPC parameter.
      -- `not fw.is_bonus` = required words only.
      select coalesce(sum(fw.points), 0) into total_score
        from boggle.found_words fw where fw.game_id = target_game and not fw.is_bonus;
      if total_score >= threshold then
        perform boggle._finish(target_game, 'target');
      end if;
    else
      select coalesce(sum(fw.points), 0) into total_score
        from boggle.found_words fw
       where fw.game_id = target_game and fw.user_id = caller_id and not fw.is_bonus;
      if total_score >= threshold then
        perform boggle._finish(target_game, 'target', caller_id);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'result', case when coalesce(is_bonus, false) then 'bonus' else 'accepted' end,
    'points', coalesce(points, 0)
  );
end;
$$;

revoke execute on function boggle.submit_word(uuid, text, int, boolean) from public;
grant execute on function boggle.submit_word(uuid, text, int, boolean) to authenticated;

-- ============================================================
-- _finish / end_game / submit_timeout — terminal transitions.
-- ============================================================
-- A game ends three ways: a player hits End (`outcome = 'manual'`), the timer
-- expires (`'timeout'`), or a score TARGET is reached (`'target'`, see
-- submit_word — only when setup.win_percent is set). Coop has no individual
-- winner (the team's total is the score); compete without a target ranks by
-- score (ties share the win). A `'target'` compete win passes `winner_user_id` — the
-- player who crossed the bar first — and THEY win outright (others lose
-- regardless of their private banked score).
create or replace function boggle._finish(target_game uuid, outcome text, winner_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  g_mode text;
  g_win_pct int;
  term_state text;
  top_user uuid;
  g_req_count int;
  g_req_score int;
  fc int;
  fs int;
  max_score int;
  lb jsonb;
  results jsonb;
  final_status jsonb;
begin
  select mode, required_words_count, required_words_score, win_percent
    into g_mode, g_req_count, g_req_score, g_win_pct
    from boggle.games where id = target_game;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no boggle.games row for target_game';
  end if;

  if g_mode = 'coop' then
    select count(*), coalesce(sum(points), 0) into fc, fs
      from boggle.found_words where game_id = target_game;
    final_status := jsonb_build_object(
      'mode', 'coop', 'outcome', outcome,
      'found_words_count', fc, 'found_words_score', fs,
      'required_words_count', g_req_count, 'required_words_score', g_req_score
    );
    results := null; -- coop is a team effort; no per-player result

    -- Terminal play_state, mirroring spellingbee/wordwheel coop: a game with a
    -- TARGET can be won or lost against it (reaching it wins; the clock
    -- beating you loses), while a game with no target is just an exercise —
    -- there's nothing to fail, so any ending is the neutral 'ended'. A manual
    -- stop is always neutral, target or not: the friends chose to stop.
    term_state := case
      when outcome = 'target' then 'won'
      when outcome = 'timeout' and g_win_pct is not null then 'lost'
      else 'ended'
    end;
  else
    -- Leaderboard over ALL players (the final scoreboard still shows a
    -- conceder's banked score; the FE marks them "Quit").
    select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id,
                                              'found_words_count', cnt,
                                              'found_words_score', sc)
                              order by sc desc), '[]'::jsonb)
      into lb
      from (
        select user_id, count(*) as cnt, sum(points) as sc
          from boggle.found_words where game_id = target_game group by user_id
      ) t;
    -- The winning bar excludes conceded players — a drop-out forfeits any win
    -- regardless of the score they banked (docs/common.md). Mirrors
    -- scrabble._finish. NULL (all conceded / nobody scored) coalesces to 0.
    select coalesce(max(t.sc), 0)
      into max_score
      from (
        select user_id, sum(points) as sc
          from boggle.found_words where game_id = target_game group by user_id
      ) t
      join common.game_players gp
        on gp.game_id = target_game and gp.user_id = t.user_id
     where not gp.conceded;
    -- Terminal play_state. Three shapes:
    --   'target'                  → the crosser wins outright   → won_compete
    --   'timeout' WITH a target   → nobody reached the bar, so nobody wins,
    --                               however high the scores got  → lost_compete
    --   'timeout' with NO target  → it was a straight score race, so the top
    --                               non-conceded score takes it   → won_compete
    --   'timeout' and NOBODY SCORED → a race with no runners: every player is
    --                               tied on 0, so the win test ("your score is
    --                               the best score") would flag them ALL winners
    --                               of a game nobody played  → lost_compete
    --   'manual'                  → the friends chose to stop; neutral, no
    --                               winner, like every other game's End → ended
    term_state := case
      when outcome = 'target' then 'won_compete'
      when outcome = 'timeout' and g_win_pct is not null then 'lost_compete'
      when outcome = 'timeout' and max_score = 0 then 'lost_compete'
      when outcome = 'timeout' then 'won_compete'
      else 'ended'
    end;

    -- Name the winner when there's exactly one to name: the target-crosser, or
    -- (score race) the sole player on the top score. A tie leaves it null and
    -- the label reads "co-winners" — the leaderboard is privacy-scoped, so a
    -- label can't recompute this itself.
    if winner_user_id is not null then
      top_user := winner_user_id;
    elsif term_state = 'won_compete' then
      with tops as (
        select t.user_id
          from (
            select user_id, sum(points) as sc
              from boggle.found_words where game_id = target_game group by user_id
          ) t
          join common.game_players gp
            on gp.game_id = target_game and gp.user_id = t.user_id
         where not gp.conceded and t.sc = max_score
      )
      select case when count(*) = 1 then (array_agg(user_id))[1] end
        into top_user
        from tops;
    end if;

    final_status := jsonb_build_object(
      'mode', 'compete', 'outcome', outcome, 'leaderboard', lb,
      'top_score', max_score,
      'required_words_count', g_req_count, 'required_words_score', g_req_score
    );
    if top_user is not null then
      final_status := final_status || jsonb_build_object(
        'winner_user_id', top_user,
        'winner_username', (select username from common.profiles where user_id = top_user)
      );
    end if;
    -- Per-player result:
    --   target win → the crosser wins outright; everyone else loses.
    --   score race (timeout, no target) → win if you tied or beat the top score
    --     AND didn't concede (a player who found nothing scores 0 and loses
    --     unless 0 is the max; a conceder never wins even on a tying score).
    --   nobody-reached-the-target, and a manual stop → nobody wins.
    select coalesce(jsonb_object_agg(p.user_id::text,
             jsonb_build_object(
               'won', case
                        when winner_user_id is not null then p.user_id = winner_user_id
                        when term_state <> 'won_compete' then false
                        else not p.conceded and coalesce(t.sc, 0) >= max_score
                      end,
               'score', coalesce(t.sc, 0))), '{}'::jsonb)
      into results
      from common.game_players p
      left join (
        select user_id, sum(points) as sc
          from boggle.found_words where game_id = target_game group by user_id
      ) t on t.user_id = p.user_id
     where p.game_id = target_game;
  end if;

  perform common.end_game(target_game, term_state, final_status, results);
end;
$$;

revoke execute on function boggle._finish(uuid, text, uuid) from public;

create or replace function boggle.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  g_playstate text;
begin
  perform common.require_game_player(target_game);
  select play_state into g_playstate from common.games where id = target_game;
  if g_playstate is distinct from 'playing' then
    return; -- already over; idempotent
  end if;
  perform boggle._finish(target_game, 'manual');
end;
$$;

revoke execute on function boggle.end_game(uuid) from public;
grant execute on function boggle.end_game(uuid) to authenticated;

-- ============================================================
-- boggle.replay_board — restart this board from scratch
-- ============================================================
-- The "Replay board" game-menu item / terminal RestartButton (the waffle
-- feature — docs/celebration-ideas.md; spellingbee's twin). Restarts the
-- SAME board — same faces + word lists — for everyone: the found-words
-- log (the game's only working state) is cleared, and common.reset_game
-- un-terminals the row with the same initial status create_game seeds
-- (mode-branched) and zeroes the shared clock. Any game player may call
-- it, mid-game or after game-over (no play_state guard — it's a restart).
--
-- The realtime touch at the end is LOAD-BEARING (same as spellingbee's
-- replay): replay only DELETEs found_words rows, and realtime filters
-- don't reliably match DELETE events — so useGame also subscribes to
-- boggle.games, and this no-op write is what wakes every client to
-- refetch the now-empty found list.
create or replace function boggle.replay_board(target_game uuid)
returns void
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  g_row boggle.games;
  new_status jsonb;
begin
  perform common.require_game_player(target_game);
  -- FOR UPDATE: a replay racing a move must not interleave with it (the move
  -- RPCs lock the same row), or the reset could land on a half-applied move —
  -- a stray log row in the "fresh" game, or worse, an in-flight game-ENDING
  -- move re-terminalling the board that was just reset.
  select * into g_row from boggle.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no boggle.games row for target_game';
  end if;

  delete from boggle.found_words where game_id = target_game;

  -- The fresh initial status — the exact shapes create_game seeds.
  if g_row.mode = 'coop' then
    new_status := jsonb_build_object(
      'mode', 'coop', 'found_words_count', 0, 'found_words_score', 0,
      'required_words_count', g_row.required_words_count,
      'required_words_score', g_row.required_words_score
    );
  else
    new_status := jsonb_build_object(
      'mode', 'compete', 'leaderboard', '[]'::jsonb,
      'required_words_count', g_row.required_words_count,
      'required_words_score', g_row.required_words_score
    );
  end if;

  perform common.reset_game(target_game, new_status);

  -- Realtime touch (see the header) — wakes useGame's games subscription.
  update boggle.games set club_handle = club_handle where id = target_game;
end;
$$;

revoke execute on function boggle.replay_board(uuid) from public;
grant execute on function boggle.replay_board(uuid) to authenticated;

-- ============================================================
-- boggle.concede — a player drops out of a compete race
-- ============================================================
-- boggle compete is a timed hunt (no per-player "eliminated" state —
-- everyone plays until the countdown or, untimed, until they stop), so
-- the active set is exactly "not conceded" and the generic
-- common.concede handles it: mark the caller out; if that was the last
-- racer, end as a collective loss. This wrapper keeps the FE uniform
-- (`db.rpc('concede')`) and gates concede to compete (coop ends via
-- the shared End, never a concede).
create or replace function boggle.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
begin
  perform common.require_compete((select mode from boggle.games where id = target_game));
  perform common.concede(target_game);
end;
$$;

revoke execute on function boggle.concede(uuid) from public;
grant execute on function boggle.concede(uuid) to authenticated;

create or replace function boggle.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = boggle, common, public, extensions
as $$
declare
  g_playstate text;
begin
  perform common.require_game_player(target_game);
  select play_state into g_playstate from common.games where id = target_game;
  if g_playstate is distinct from 'playing' then
    return;
  end if;
  perform boggle._finish(target_game, 'timeout');
end;
$$;

revoke execute on function boggle.submit_timeout(uuid) from public;
grant execute on function boggle.submit_timeout(uuid) to authenticated;
