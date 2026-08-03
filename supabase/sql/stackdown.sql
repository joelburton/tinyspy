-- ============================================================
-- stackdown — the REPEATABLE half
-- ============================================================
-- Functions, views, RLS policies, triggers and grants for stackdown. Everything
-- here is drop-and-recreate safe, so this file is **re-applied in full on
-- every deploy** (`npm run sql:apply`) — it is the CURRENT definition, not a
-- delta. Edit it in place forever; it never becomes a migration.
--
-- Its other half is the one-shot schema migration
-- `supabase/migrations/20260626000000_stackdown.sql` — tables, constraints, indexes,
-- the Realtime publication and seed rows. That one is applied once and then
-- frozen, because `alter table` cannot be re-run.
--
-- Order is load-bearing: a policy can only reference a function that already
-- exists, so statements stay in the order they were written. See
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema stackdown to authenticated;

-- Column grant: everything EXCEPT `solution` (its presence flips the table
-- to "only granted columns"). games_state reveals the solution post-terminal.
grant select (id, club_handle, mode, tiles, band, board_id, created_at)
  on stackdown.games to authenticated;
drop policy if exists games_select on stackdown.games;
create policy games_select on stackdown.games
  for select to authenticated
  using (common.is_club_member(club_handle));

grant select (game_id, user_id, found_count, solved, solved_at)
  on stackdown.players to authenticated;
drop policy if exists players_select on stackdown.players;
create policy players_select on stackdown.players
  for select to authenticated
  using (
    exists (
      select 1 from stackdown.games g
       where g.id = players.game_id
         and common.is_club_member(g.club_handle)
    )
  );

grant select on stackdown.submissions to authenticated;
-- Coop: the whole log is club-readable (shared board). Compete: own rows
-- only, until the game is terminal (then opponents' words reveal). Mirrors
-- wordle.guesses' mode-aware policy.
drop policy if exists submissions_select on stackdown.submissions;
create policy submissions_select on stackdown.submissions
  for select to authenticated
  using (
    exists (
      select 1 from stackdown.games sg
        join common.games cg on cg.id = sg.id
       where sg.id = submissions.game_id
         and common.is_club_member(sg.club_handle)
         and (sg.mode = 'coop' or submissions.user_id = auth.uid() or cg.is_terminal)
    )
  );

-- ============================================================
-- Geometry helpers + hidden-answer reveal
-- ============================================================

-- Is `tid` exposed given the set of already-gone tile ids? Exposed iff no
-- remaining (not-gone) tile covers it (higher z, within one cell in x,y).
-- Pure function of its args (the caller already holds `tiles`), so it
-- doesn't read tables and needs no special grants.
create or replace function stackdown._is_exposed(tiles jsonb, gone int[], tid int)
returns boolean
language sql
immutable
as $$
  select not exists (
    select 1
      from jsonb_to_recordset(tiles) as b(id int, x int, y int, z int, letter text)
      join jsonb_to_recordset(tiles) as a(id int, x int, y int, z int, letter text)
        on a.id <> b.id
     where b.id = tid
       and not (a.id = any(gone))
       and a.z > b.z
       and abs(a.x - b.x) <= 1
       and abs(a.y - b.y) <= 1
  );
$$;
revoke execute on function stackdown._is_exposed(jsonb, integer[], integer) from public;

-- The word spelled by `ids` in order (their letters concatenated).
create or replace function stackdown._word(tiles jsonb, ids int[])
returns text
language sql
immutable
as $$
  select string_agg(t.letter, '' order by u.ord)
    from unnest(ids) with ordinality as u(tid, ord)
    join jsonb_to_recordset(tiles) as t(id int, x int, y int, z int, letter text)
      on t.id = u.tid;
$$;
revoke execute on function stackdown._word(jsonb, integer[]) from public;

-- Build the club-list TITLE from the cleared words. Coop rewrites the
-- title on every valid word (see submit_word) so the games list reads the
-- game's progress at a glance — "APPLE-BERRY-COMPY…". The display is
-- capped at three words; a fourth-and-beyond is implied by the trailing
-- ellipsis. A zero-word game is just "New game" (the create-time title).
--
-- Compete deliberately does NOT call this: its found words are hidden from
-- the opponent (only found_count is public — same board, same hidden
-- solution, raced independently), so putting them in the shared club-list
-- title would hand a trailing racer the next words. Compete keeps "New game".
create or replace function stackdown._found_title(solution text[], n int)
returns text
language sql
immutable
as $$
  select case
    when n <= 0 then 'New game'
    else upper(array_to_string(solution[1:least(n, 3)], '-'))
         || case when n > 3 then '…' else '' end
  end;
$$;
revoke execute on function stackdown._found_title(text[], integer) from public;

-- Reveal the solution only once the game is terminal (the end reveal).
create or replace function stackdown._solution_for(g_id uuid)
returns text[]
language sql
stable
security definer
set search_path = stackdown, common, public, extensions
as $$
  select case when cg.is_terminal then sg.solution else null end
    from stackdown.games sg
    join common.games cg on cg.id = sg.id
   where sg.id = g_id;
$$;
revoke execute on function stackdown._solution_for(uuid) from public;
grant execute on function stackdown._solution_for(uuid) to authenticated;

drop view if exists stackdown.games_state;
create view stackdown.games_state with (security_invoker = true) as
  select sg.id,
         sg.club_handle,
         sg.mode,
         sg.tiles,
         sg.created_at,
         stackdown._solution_for(sg.id) as solution   -- NULL until terminal
    from stackdown.games sg;
grant select on stackdown.games_state to authenticated;

-- ============================================================
-- stackdown.create_game — mode is a positional arg
-- ============================================================
-- Setup shape: { "timer": (none | countup | countdown{seconds}),
--                "band":  int 1..6 (word-difficulty; default 1) }.
-- `mode` ('coop' | 'compete') routes the gametype string + working-state
-- semantics. Unlike waffle, the board isn't passed in — it's claimed from
-- the pre-generated library (a random board OF THE CHOSEN BAND) and copied
-- in (tiles public, words hidden).
create or replace function stackdown.create_game(
  target_club     text,
  setup           jsonb,
  player_user_ids uuid[],
  mode            text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  new_id uuid;
  b      stackdown.boards%rowtype;
  v_band int;
begin
  perform common.require_club_member(target_club);
  -- Must agree with numberOfPlayers in src/stackdown/manifest.ts ([1,6]/[2,6]).
  perform common.require_player_count_max(player_user_ids, 6);

  perform common.require_valid_mode(mode);
  perform common.require_valid_timer(setup->'timer');

  -- Word-difficulty band (a common.words.difficulty ceiling). Defaults to 1
  -- (the everyday set); the setup form offers 1..2 today, but any 1..6 the
  -- library actually holds boards for is accepted.
  v_band := coalesce((setup->>'band')::int, 1);
  if v_band < 1 or v_band > 6 then
    raise exception 'band must be between 1 and 6 (got %)', v_band
      using errcode = 'P0001';
  end if;

  -- Claim a random pre-generated board OF THE CHOSEN BAND.
  select * into b from stackdown.boards where band = v_band order by random() limit 1;
  if not found then
    raise exception 'no stackdown boards available for band % — run the board import', v_band
      using errcode = 'P0001';
  end if;

  -- "New game" until words start clearing. Coop rewrites this title to the
  -- cleared words as it plays (submit_word); compete leaves it untouched
  -- so it never leaks the hidden solution to the trailing racer.
  new_id := common.create_game(
    target_club, 'stackdown_' || mode, player_user_ids, 'New game', setup, setup
  );

  insert into stackdown.games (id, club_handle, mode, tiles, solution, band, board_id)
  values (new_id, target_club, mode, b.tiles, b.words, b.band, b.id);

  insert into stackdown.players (game_id, user_id)
  select new_id, uid from unnest(player_user_ids) uid;

  perform common.update_state(
    new_id, 'playing',
    jsonb_build_object('mode', mode, 'found_words_count', 0, 'required_words_count', 6)
  );

  return query select new_id;
end;
$$;
revoke execute on function stackdown.create_game(text, jsonb, uuid[], text) from public;
grant execute on function stackdown.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- stackdown.submit_word — the core move
-- ============================================================
-- Submit a 5-tile ordered selection. The server validates that the tiles
-- are present and REVEAL-RESPECTING (each exposed when selected) — an FE
-- that submits otherwise is rejected hard — then reads the word off the
-- order and checks it against the next solution word (no dictionary: the
-- board only exposes the six solution words). EVERY submission is logged;
-- an invalid one is a soft reject (the FE returns the tiles + logs "invalid
-- word"), a valid one removes the tiles and advances. The sixth valid word
-- ends the game (coop: won; compete: the caller wins the race).
--
-- The `for update` lock on the games row serializes concurrent coop
-- submits and keeps each submitter's `seq` collision-free.
create or replace function stackdown.submit_word(target_game uuid, tile_ids int[])
returns jsonb
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  caller_id      uuid;
  g_row          stackdown.games%rowtype;
  cur_state      text;
  removed        int[];
  gone           int[];
  tid            int;
  w              text;
  cleared        int;
  is_word        boolean;
  next_seq       int;
  new_found      int;
  team_found     int;
  out_terminal   boolean := false;
  player_results jsonb;
begin
  caller_id := common.require_game_player(target_game);

  select * into g_row from stackdown.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select play_state into cur_state from common.games where id = target_game;
  if cur_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- A conceded player is out of the race — no more words. The FE gates
  -- on myConceded, so this only fires on a race (a submit in flight when
  -- concede commits, or a stale second tab). Without it a conceder's 6th
  -- word could crown them the winner.
  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you have conceded' using errcode = 'P0001';
  end if;

  -- Compete: a finished player can't keep submitting.
  if g_row.mode = 'compete'
     and (select solved from stackdown.players
            where game_id = target_game and user_id = caller_id) then
    raise exception 'you have already cleared the board' using errcode = 'P0001';
  end if;

  -- Removed set: coop = union over ALL valid submissions (shared board);
  -- compete = this caller's own valid submissions.
  select coalesce(array_agg(t), '{}'::int[])
    into removed
    from stackdown.submissions s, unnest(s.tile_ids) as t
   where s.game_id = target_game and s.valid
     and (g_row.mode = 'coop' or s.user_id = caller_id);

  -- ─── Validate the submitted tiles ──────────────────────────
  if array_length(tile_ids, 1) is distinct from 5
     or (select count(distinct e) from unnest(tile_ids) e) <> 5 then
    raise exception 'a word is exactly five distinct tiles' using errcode = 'P0001';
  end if;
  if tile_ids && removed then
    raise exception 'a submitted tile is already removed' using errcode = 'P0001';
  end if;
  -- Reveal-respecting: each tile must be exposed at the moment it's picked.
  gone := removed;
  foreach tid in array tile_ids loop
    if not stackdown._is_exposed(g_row.tiles, gone, tid) then
      raise exception 'tiles are not reachable in that order' using errcode = 'P0001';
    end if;
    gone := gone || tid;
  end loop;

  -- ─── Word check — is it the next solution word? ────────────
  -- No dictionary lookup: the board only ever exposes the six solution
  -- words (the generator's strict no-trap invariant), and we'd never want
  -- to accept a non-solution word anyway. Words clear in solution order
  -- (strict validity guarantees it), so the count of already-cleared words
  -- IS the index of the next one — same math as reveal_next_word. The word
  -- is stored lowercase to match common.words (the FE uppercases for
  -- display); coalesce guards the (unreachable here) all-cleared NULL.
  w := lower(stackdown._word(g_row.tiles, tile_ids));
  select count(*) into cleared
    from stackdown.submissions s
   where s.game_id = target_game and s.valid
     and (g_row.mode = 'coop' or s.user_id = caller_id);
  is_word := coalesce(w = g_row.solution[cleared + 1], false);

  -- Log the submission (valid or not).
  select coalesce(max(seq), 0) + 1 into next_seq
    from stackdown.submissions where game_id = target_game and user_id = caller_id;
  insert into stackdown.submissions (game_id, user_id, seq, word, tile_ids, valid)
  values (target_game, caller_id, next_seq, w, tile_ids, is_word);

  if not is_word then
    return jsonb_build_object('result', 'invalid', 'word', w, 'terminal', false);
  end if;

  -- ─── Accepted: remove tiles (implicitly, via the valid row), advance ──
  update stackdown.players
     set found_count = found_count + 1,
         solved    = case when g_row.mode = 'compete' and found_count + 1 >= 6
                          then true else solved end,
         solved_at = case when g_row.mode = 'compete' and found_count + 1 >= 6
                          then now() else solved_at end
   where game_id = target_game and user_id = caller_id
   returning found_count into new_found;

  if g_row.mode = 'coop' then
    select count(*) into team_found
      from stackdown.submissions where game_id = target_game and valid;
    -- Surface the cleared words as the club-list title. They're shared and
    -- already shown in the FoundWords panel, so this reveals nothing new.
    -- Runs on every valid coop word, including the sixth — leaving the
    -- final title in place when end_game flips the row terminal below.
    update common.games
       set title = stackdown._found_title(g_row.solution, team_found)
     where id = target_game;
    if team_found >= 6 then
      out_terminal := true;
      select jsonb_object_agg(user_id::text, jsonb_build_object('won', true))
        into player_results from common.game_players where game_id = target_game;
      perform common.end_game(
        target_game, 'won',
        jsonb_build_object('mode', 'coop', 'solved', true, 'found_words_count', team_found,
                           'outcome', 'cleared'),
        player_results
      );
    else
      -- Keep the club-list readout current — the count was seeded at create and
      -- would otherwise sit at 0 all game. Only the count moves, so that's all
      -- this states (common.update_state merges).
      --
      -- Coop only: a compete racer's found words are hidden from the others
      -- (only their own count is theirs to see), and this column is club-wide
      -- readable, so a shared tally would leak the leader's progress.
      perform common.update_state(
        target_game, 'playing',
        jsonb_build_object('found_words_count', team_found));
    end if;
  else
    -- Compete is a RACE: the first to clear all six wins immediately.
    if new_found >= 6 then
      out_terminal := true;
      select jsonb_object_agg(
               user_id::text,
               jsonb_build_object('won', user_id = caller_id, 'found', found_count)
             )
        into player_results from stackdown.players where game_id = target_game;
      perform common.end_game(
        target_game, 'won_compete',
        jsonb_build_object('mode', 'compete', 'winner_user_id', caller_id, 'winner_username', (select username from common.profiles where user_id = caller_id)),
        player_results
      );
    end if;
  end if;

  return jsonb_build_object('result', 'accepted', 'word', w, 'terminal', out_terminal);
end;
$$;
revoke execute on function stackdown.submit_word(uuid, int[]) from public;
grant execute on function stackdown.submit_word(uuid, int[]) to authenticated;

-- ============================================================
-- stackdown.reveal_next_word — a CHEAT (peek at the next word)
-- ============================================================
-- Returns the next solution word the caller still has to clear, or NULL
-- if they've cleared all six. This deliberately defeats the hidden-
-- solution invariant — it exists to verify generated boards are
-- solvable in order (and as a hint while playtesting). It may be removed
-- once boards are trusted; until then it's gated like any move (game
-- player, in-progress only).
--
-- "Next word" = solution[words-cleared + 1]. Strict board validity means
-- words can only be cleared in solution order, so the count of cleared
-- words IS the index of the next one. Cleared count mirrors submit_word's
-- removed-set rule: coop = every valid submission on the shared board,
-- compete = the caller's own.
create or replace function stackdown.reveal_next_word(target_game uuid)
returns text
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row     stackdown.games%rowtype;
  cur_state text;
  cleared   int;
  next_word text;
  next_seq  int;
begin
  caller_id := common.require_game_player(target_game);

  -- `for update` serializes the request-logging insert below (its `seq`)
  -- against concurrent submits / reveals on this game.
  select * into g_row from stackdown.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select play_state into cur_state from common.games where id = target_game;
  if cur_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  select count(*) into cleared
    from stackdown.submissions s
   where s.game_id = target_game and s.valid
     and (g_row.mode = 'coop' or s.user_id = caller_id);

  next_word := g_row.solution[cleared + 1];   -- NULL once all six cleared
  if next_word is null then
    return null;
  end if;

  -- Log a "Revealed: <word>" entry, once per (player, word) so repeated
  -- clicks don't spam the log. The revealed word is STORED on the row (in
  -- `word`, lowercase like every other word) so the log can show it — this is
  -- an explicit cheat, so leaking the word to the row's viewers (coop = all,
  -- compete = requester until terminal) is the intended behavior. Visibility
  -- rides the submissions RLS.
  if not exists (
    select 1 from stackdown.submissions
     where game_id = target_game and user_id = caller_id
       and kind = 'reveal' and for_word_index = cleared
  ) then
    select coalesce(max(seq), 0) + 1 into next_seq
      from stackdown.submissions where game_id = target_game and user_id = caller_id;
    insert into stackdown.submissions (game_id, user_id, seq, kind, for_word_index, word)
    values (target_game, caller_id, next_seq, 'reveal', cleared, next_word);
  end if;

  return next_word;
end;
$$;
revoke execute on function stackdown.reveal_next_word(uuid) from public;
grant execute on function stackdown.reveal_next_word(uuid) to authenticated;

-- ============================================================
-- stackdown.reveal_next_hint — the "give it a nudge" helper
-- ============================================================
-- Returns the HINT for the next solution word the caller still has to
-- clear — a clue that points at the word without naming it (see
-- common.words.hint). Unlike reveal_next_word it doesn't leak the word
-- itself: only the hint text crosses the wire.
--
-- The return is NULL when the next word has no hint: band-1 words all carry
-- one (len=5 AND (wordle OR difficulty=1) is common.words' hint set), but
-- higher-band words (difficulty >= 2) can lack a hint until common.words is
-- backfilled. We still log the 'hint' request row (its `word` just holds
-- NULL) and return NULL; the FE reads that as "no hint for this word" and
-- says so (NOT "all cleared" — that can't happen here: clearing the sixth
-- word ends the game, and the play_state guard below rejects a non-playing
-- game). Same gating + next-word math as reveal_next_word.
create or replace function stackdown.reveal_next_hint(target_game uuid)
returns text
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row     stackdown.games%rowtype;
  cur_state text;
  cleared   int;
  next_word text;
  hint_text text;
  next_seq  int;
begin
  caller_id := common.require_game_player(target_game);

  -- `for update` serializes the request-logging insert below (see
  -- reveal_next_word).
  select * into g_row from stackdown.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select play_state into cur_state from common.games where id = target_game;
  if cur_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  select count(*) into cleared
    from stackdown.submissions s
   where s.game_id = target_game and s.valid
     and (g_row.mode = 'coop' or s.user_id = caller_id);

  next_word := g_row.solution[cleared + 1];          -- NULL once all cleared
  if next_word is null then
    return null;
  end if;
  select hint into hint_text from common.words where word = lower(next_word);

  -- Log a "Hint: <clue>" entry, once per (player, word). The hint TEXT is
  -- stored on the row (in `word`) so the log can show it — this leaks only the
  -- clue, never the word (the whole point of reveal_next_hint). Visibility
  -- rides the submissions RLS (coop → all; compete → requester).
  if not exists (
    select 1 from stackdown.submissions
     where game_id = target_game and user_id = caller_id
       and kind = 'hint' and for_word_index = cleared
  ) then
    select coalesce(max(seq), 0) + 1 into next_seq
      from stackdown.submissions where game_id = target_game and user_id = caller_id;
    insert into stackdown.submissions (game_id, user_id, seq, kind, for_word_index, word)
    values (target_game, caller_id, next_seq, 'hint', cleared, hint_text);
  end if;

  return hint_text;
end;
$$;
revoke execute on function stackdown.reveal_next_hint(uuid) from public;
grant execute on function stackdown.reveal_next_hint(uuid) to authenticated;

-- ============================================================
-- stackdown.submit_timeout — countdown-timer expiry
-- ============================================================
-- The FE fires this when a countdown hits 0. Coop: the shared board wasn't
-- cleared → lost. Compete: time's up with no winner (a winner would have
-- ended the game already via submit_word's race) → everyone loses.
-- Idempotent on the play_state check (a second caller raises P0001, which
-- the manifest swallows).
create or replace function stackdown.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  g_row          stackdown.games%rowtype;
  cur_state      text;
  player_results jsonb;
begin
  select * into g_row from stackdown.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into cur_state from common.games where id = target_game;
  if cur_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  if g_row.mode = 'coop' then
    select jsonb_object_agg(user_id::text, jsonb_build_object('won', false))
      into player_results from common.game_players where game_id = target_game;
    perform common.end_game(
      target_game, 'lost',
      jsonb_build_object('mode', 'coop', 'outcome', 'timeout'),
      player_results
    );
  else
    select jsonb_object_agg(user_id::text,
                            jsonb_build_object('won', false, 'found', found_count))
      into player_results from stackdown.players where game_id = target_game;
    perform common.end_game(
      target_game, 'lost_compete',
      jsonb_build_object('mode', 'compete', 'outcome', 'timeout'),
      player_results
    );
  end if;

  -- Realtime touch: common.end_game writes common.games, not stackdown.*,
  -- so a no-op self-update wakes the FE's stackdown subscription, which
  -- refetches games_state (now revealing the solution).
  update stackdown.games set club_handle = club_handle where id = target_game;
end;
$$;
revoke execute on function stackdown.submit_timeout(uuid) from public;
grant execute on function stackdown.submit_timeout(uuid) to authenticated;

-- ============================================================
-- stackdown.end_game — manual stop (neutral terminal)
-- ============================================================
-- The friends' explicit "we're done" button, both modes. Writes the
-- uniform neutral terminal 'ended' (nobody wins/loses), distinct from the
-- intrinsic won/lost/won_compete/lost_compete terminals. Idempotent on the
-- play_state check; any game player may fire it.
create or replace function stackdown.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  g_row          stackdown.games%rowtype;
  cur_state      text;
  player_results jsonb;
begin
  select * into g_row from stackdown.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into cur_state from common.games where id = target_game;
  if cur_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  select jsonb_object_agg(user_id::text, jsonb_build_object('won', false))
    into player_results from common.game_players where game_id = target_game;

  perform common.end_game(
    target_game, 'ended',
    jsonb_build_object('outcome', 'manual', 'mode', g_row.mode),
    player_results
  );

  update stackdown.games set club_handle = club_handle where id = target_game;
end;
$$;
revoke execute on function stackdown.end_game(uuid) from public;
grant execute on function stackdown.end_game(uuid) to authenticated;

-- ============================================================
-- stackdown.concede — a player drops out of a compete race
-- ============================================================
-- stackdown compete is a race to clear the stack (first to clear wins,
-- ending the game via submit_word) — there's no per-player
-- "eliminated" state, so the active set is exactly "not conceded" and
-- the generic common.concede handles it: mark the caller out; if that
-- was the last racer, end as a collective loss. Wrapper keeps the FE
-- uniform and gates concede to compete (coop ends via the shared End).
create or replace function stackdown.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
begin
  perform common.require_compete((select mode from stackdown.games where id = target_game));
  perform common.concede(target_game);
end;
$$;

revoke execute on function stackdown.concede(uuid) from public;
grant execute on function stackdown.concede(uuid) to authenticated;

-- ============================================================
-- stackdown.replay_board — restart this stack from scratch
-- ============================================================
-- The "Replay board" game-menu item: reset the working state on the
-- SAME game row. The frozen puzzle (tiles / solution / band / mode)
-- stays — the same stack, cleared again; everything the players did is
-- wiped. Any game player may call it, from a finished game OR mid-game
-- (no play_state guard — it's a restart). Both modes reset ALL players
-- (a group "run it back", per the friends trust model).
--
-- Three things reset, matching what create_game established:
--   - players zeroed + unsolved;
--   - the submission log cleared (words, hints AND reveals — a replay is
--     a genuine second try, so the cheats you spent don't carry over);
--   - the club-list TITLE back to 'New game'. Coop rewrites it to the
--     cleared words as it plays (submit_word → _found_title), so without
--     this a replayed game would advertise the previous run's words —
--     and, in a game whose whole point is that the solution is hidden,
--     spoil the board it just reset. (The other games' replays have no
--     title to restore; this one does.)
--
-- Then the common-layer reset (common.reset_game): un-terminal, fresh
-- initial status matching create_game's, per-player results + concede
-- cleared. The solution re-hides on its own — games_state gates it on
-- common.games.is_terminal, which reset_game clears.
--
-- No realtime touch needed: the players update + submissions delete wake
-- useGame (subscribed to stackdown.{games,players,submissions}), and
-- reset_game's common.games write wakes useCommonGame — so the board,
-- log, and terminal state all reset live for every player.
create or replace function stackdown.replay_board(target_game uuid)
returns void
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  g_row stackdown.games;
begin
  perform common.require_game_player(target_game);
  -- FOR UPDATE: a replay racing a move must not interleave with it (the move
  -- RPCs lock the same row), or the reset could land on a half-applied move —
  -- a stray log row in the "fresh" game, or worse, an in-flight game-ENDING
  -- move re-terminalling the board that was just reset.
  select * into g_row from stackdown.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  update stackdown.players
     set found_count = 0,
         solved = false,
         solved_at = null
   where game_id = target_game;

  delete from stackdown.submissions where game_id = target_game;

  update common.games set title = 'New game' where id = target_game;

  perform common.reset_game(
    target_game,
    jsonb_build_object('mode', g_row.mode, 'found_words_count', 0, 'required_words_count', 6)
  );
end;
$$;

revoke execute on function stackdown.replay_board(uuid) from public;
grant execute on function stackdown.replay_board(uuid) to authenticated;
