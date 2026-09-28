-- cs-fixed-outcome-fix

-- ============================================================
-- stackdown
-- ============================================================
-- What the frontend calls:
--
--   create_game       deals a board from the pre-generated library and
--                     starts the game
--   submit_word       spells a word off five exposed tiles; the right word
--                     clears them
--   reveal_next_word  a spoiler: hands over the next word to clear
--   reveal_next_hint  the clue for the next word to clear
--   concede           a racer drops out of a compete game
--   stop_game         stops the game for everyone, with no result
--   submit_timeout    ends the game when the countdown runs out
--   replay_board      restarts the same stack from scratch
--
-- and the view `games_state`, the game row with the six words once it has
-- ended.
--
-- What is particular to stackdown (docs/games/stackdown.md has the rest):
--   - Boards come from a pre-generated library, one per difficulty band, and
--     each board spells exactly its six solution words, in order: nothing
--     else is ever exposed, so submit_word checks against the next solution
--     word rather than a dictionary.
--   - The solution is hidden by a column grant, and games_state hands it
--     over only once the game has ended.
--   - The server checks every tile was exposed when it was picked.
--   - A compete race ends when decided: the first to clear all six wins, and
--     the others are short of the goal and unranked.
--   - Coop's title is a readout of the words cleared so far; compete keeps
--     "New game", since its words are secret.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema stackdown to authenticated;

-- Column grant: everything EXCEPT `solution` (its presence flips the table
-- to "only granted columns"). games_state reveals the solution once the game
-- ends.
grant select (game_id, tiles, board_id)
  on stackdown.games to authenticated;
drop policy if exists games_select on stackdown.games;
create policy games_select on stackdown.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common.is_club_member(cg.club_handle)
    )
  );

grant select (game_id, user_id, found_count)
  on stackdown.players to authenticated;
drop policy if exists players_select on stackdown.players;
create policy players_select on stackdown.players
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = players.game_id
         and common.is_club_member(cg.club_handle)
    )
  );

grant select on stackdown.events to authenticated;
-- Coop: the whole log is club-readable (shared board). Compete: own rows
-- only, until the game has ended (then opponents' words reveal). Mirrors
-- wordle.events' mode-aware policy.
drop policy if exists events_select on stackdown.events;
create policy events_select on stackdown.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common.is_club_member(cg.club_handle)
         and (cg.mode = 'coop' or events.user_id = (select auth.uid()) or cg.ended_at is not null)
    )
  );

-- ============================================================
-- stackdown._is_exposed
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

-- ============================================================
-- stackdown._word
-- ============================================================
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

-- ============================================================
-- stackdown._found_title
-- ============================================================
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

drop view if exists stackdown.games_state;
drop function if exists stackdown._solution_for(uuid);

-- ============================================================
-- stackdown._solution_for
-- ============================================================
-- The six words once the game has ended (the end reveal), null while it is
-- played. A definer, so it can read the grant-hidden column; games_state
-- calls it as the caller.
create or replace function stackdown._solution_for(p_game_id uuid)
returns text[]
language sql
stable
security definer
set search_path = stackdown, common, public, extensions
as $$
  select case when cg.ended_at is not null then sg.solution else null end
    from stackdown.games sg
    join common.games cg on cg.id = sg.game_id
   where sg.game_id = p_game_id;
$$;
revoke execute on function stackdown._solution_for(uuid) from public;
grant execute on function stackdown._solution_for(uuid) to authenticated;

-- ============================================================
-- stackdown.games_state — the game row the frontend reads
-- ============================================================
-- The readable columns of stackdown.games, plus the six words through
-- `_solution_for`, so they arrive the moment the game ends.
create view stackdown.games_state with (security_invoker = true) as
  select sg.game_id,
         sg.tiles,
         stackdown._solution_for(sg.game_id) as solution   -- NULL until the game ends
    from stackdown.games sg;
grant select on stackdown.games_state to authenticated;

-- ============================================================
-- stackdown._write_statuses — the page's copies of the game
-- ============================================================
-- Writes `common.games.game_status`, every `common.game_players.player_status`
-- and `common.games.clubpage_info` from stackdown's own tables, assigning
-- each whole (plans/common-tables.md → The statuses). Every key is always
-- present, null when it has no value:
--
--   game_status    { } — the page shows no table-fact the game keeps; the
--                  six words to clear is a constant of every board
--   player_status  { found_words_count, hints_count, spoilers_count,
--                    player_ended_reason }
--                  — each player's own; in coop the page sums them for the
--                  team
--   clubpage_info  { found_words_count, band, winner_user_id }
--                  — `found_words_count` is coop's team count and null in
--                  compete, whose club line shows no progress; the winner is
--                  compete's, null until the end; `band` is the setup's
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function stackdown._write_statuses(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  v_mode text;
  v_band int;
begin
  select cg.mode, coalesce((cg.setup->>'band')::int, 1)
    into v_mode, v_band
    from stackdown.games sg
    join common.games cg on cg.id = sg.game_id
   where sg.game_id = p_game_id;

  update common.game_players gp
     set player_status = jsonb_build_object(
           'found_words_count', sp.found_count,
           'hints_count', (select count(*) from stackdown.events e
                            where e.game_id = p_game_id and e.user_id = gp.user_id
                              and e.kind = 'hint'),
           'spoilers_count', (select count(*) from stackdown.events e
                               where e.game_id = p_game_id and e.user_id = gp.user_id
                                 and e.kind = 'spoiler'),
           'player_ended_reason', gp.player_ended_reason)
    from stackdown.players sp
   where gp.game_id = p_game_id
     and sp.game_id = gp.game_id
     and sp.user_id = gp.user_id;

  update common.games
     set game_status = '{}'::jsonb,
         clubpage_info = jsonb_build_object(
           'found_words_count', case when v_mode = 'coop' then (
             select count(*) from stackdown.events
              where game_id = p_game_id and valid) end,
           'band', v_band,
           'winner_user_id', case when v_mode = 'compete' then (
             select user_id from common.game_players
              where game_id = p_game_id and final_ranking = 1
              limit 1) end),
         status_changed_at = case when p_update_status_changed_at
                                  then now() else status_changed_at end
   where id = p_game_id;
end;
$$;

revoke execute on function stackdown._write_statuses(uuid, boolean) from public;

drop function if exists stackdown.create_game(text, jsonb, uuid[], text);

-- ============================================================
-- stackdown.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)
-- ============================================================
-- Starts a game on a board claimed from the pre-generated library (a random
-- board OF THE CHOSEN BAND) and copied in (tiles public, words hidden).
-- `p_mode` ('coop' | 'compete') routes the gametype string + working-state
-- semantics.
--
-- Setup shape: { "timer": (none | countup | countdown{seconds}),
--                "band":  int 1..6 (word-difficulty; default 1) }.
create or replace function stackdown.create_game(
  p_club_handle     text,
  p_setup           jsonb,
  p_player_user_ids uuid[],
  p_mode            text
)
returns jsonb
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  new_id uuid;
  b      stackdown.boards%rowtype;
  v_band int;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  perform common.require_club_member(p_club_handle);
  -- Must agree with numberOfPlayers in src/stackdown/manifest.ts ([1,6]/[2,6]).
  perform common.require_player_count_max(p_player_user_ids, 6);

  perform common.require_valid_mode(p_mode);
  perform common.require_valid_timer(p_setup->'timer');

  -- Word-difficulty band (a common.words.difficulty ceiling). Defaults to 1
  -- (the everyday set); the setup form offers 1..2 today, but any 1..6 the
  -- library actually holds boards for is accepted.
  v_band := coalesce((p_setup->>'band')::int, 1);
  if v_band < 1 or v_band > 6 then
    raise exception 'BUG: word difficulty of %', v_band
      using errcode = 'PN051', hint = 'fault', column = '_',
      detail = 'setup band must be 1..6';
  end if;

  -- Claim a random pre-generated board OF THE CHOSEN BAND.
  select * into b from stackdown.boards where band = v_band order by random() limit 1;
  if not found then
    -- A validation rather than an error, because the player CAN act on it:
    -- the fix is the other difficulty, and that is the field it names. The
    -- library is pre-generated per band, so an empty one is a content gap
    -- rather than anything they did.
    raise exception 'No boards at that difficulty yet — try the other one'
      using errcode = 'PN052', hint = 'form-validation', column = 'band',
      detail = 'stackdown.boards is empty at that band; run gmake g-stackdown-puzzles + the import';
  end if;

  -- "New game" until words start clearing. Coop rewrites this title to the
  -- cleared words as it plays (submit_word); compete leaves it untouched
  -- so it never leaks the hidden solution to the trailing racer.
  new_id := common.create_game(
    p_club_handle, 'stackdown_' || p_mode, p_mode, p_player_user_ids, 'New game', p_setup, p_setup
  );

  insert into stackdown.games (game_id, tiles, solution, board_id)
  values (new_id, b.tiles, b.words, b.id);

  insert into stackdown.players (game_id, user_id)
  select new_id, uid from unnest(p_player_user_ids) uid;

  perform stackdown._write_statuses(new_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; `id` is the game to go to. The name is here even
  -- though this is the only `ok` — a call site cannot assert a case the payload
  -- does not carry, and without it the branch would match by being `ok` and draw
  -- a second answer as this one.
  return common.ok_envelope(jsonb_build_object('result', 'created', 'id', new_id));

-- One block, and it has never heard of any specific condition: it reads the
-- SQLSTATE, re-raises anything that isn't ours, and lets the raise itself carry
-- the message, the kind and the field.
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common.raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;
revoke execute on function stackdown.create_game(text, jsonb, uuid[], text) from public;
grant execute on function stackdown.create_game(text, jsonb, uuid[], text) to authenticated;

drop function if exists stackdown.submit_word(uuid, int[]);

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
-- ends the game `reached_goal`/'cleared': in coop the team is ranked 1, in
-- compete the caller alone (the race ends when decided).
--
-- The `for update` lock on the games row serializes concurrent coop submits,
-- so two players cannot both clear the same word off the stack.
create or replace function stackdown.submit_word(p_game_id uuid, p_tile_ids int[])
returns jsonb
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  caller_id      uuid;
  g_row          stackdown.games%rowtype;
  v_mode         text;
  v_ended_at     timestamptz;
  removed        int[];
  gone           int[];
  tid            int;
  w              text;
  cleared        int;
  is_word        boolean;
  new_found      int;
  team_found     int;
  out_terminal   boolean := false;
  v_rankings     jsonb;
  v_answer       jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row first, before the membership gate: a friend deleting the game
  -- takes every membership with it (docs/envelopes.md → a missing game row
  -- is PN485).
  select * into g_row from stackdown.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('stackdown');
  end if;

  caller_id := common.require_game_player(p_game_id);

  select ended_at, mode into v_ended_at, v_mode from common.games where id = p_game_id;
  if v_ended_at is not null then
    -- A race: a teammate ended it, or the clock ran out, while this word was
    -- in flight.
    perform common._raise_game_over();
  end if;

  -- A conceded player is out of the race — no more words. The FE hides the
  -- board from a conceder, so this only fires on a race (a submit in flight
  -- when the concession commits, or a stale second tab). Without it a
  -- conceder's 6th word could crown them the winner.
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  -- Compete: a finished player can't keep submitting.
  if v_mode = 'compete'
     and (select solved_at is not null from common.game_players
            where game_id = p_game_id and user_id = caller_id) then
    -- Compete-only, and a fault: it is the caller's own row, and clearing the
    -- sixth word ENDS the race, so a coop player never reaches this line.
    raise exception 'BUG: submit after solving'
      using errcode = 'PN289', hint = 'fault', column = '_',
      detail = 'this player has already cleared the stack';
  end if;

  -- Removed set: coop = union over ALL valid submissions (shared board);
  -- compete = this caller's own valid submissions.
  select coalesce(array_agg(t), '{}'::int[])
    into removed
    from stackdown.events s, unnest(s.tile_ids) as t
   where s.game_id = p_game_id and s.valid
     and (v_mode = 'coop' or s.user_id = caller_id);

  -- ─── Validate the submitted tiles ──────────────────────────
  if array_length(p_tile_ids, 1) is distinct from 5
     or (select count(distinct e) from unnest(p_tile_ids) e) <> 5 then
    raise exception 'BUG: word that was not five distinct tiles'
      using errcode = 'PN290', hint = 'fault', column = '_',
      detail = 'a submitted word is exactly five distinct tile ids';
  end if;
  if p_tile_ids && removed then
    -- A race: coop's stack is one shared object, so a teammate's word takes
    -- your tiles between your pick and your submit. They leave by realtime, so
    -- no local gate can see it coming.
    raise exception 'Someone cleared those tiles'
      using errcode = 'PN291', hint = 'race', column = '_',
      detail = 'a submitted tile has already been cleared';
  end if;
  -- Reveal-respecting: each tile must be exposed at the moment it's picked.
  gone := removed;
  foreach tid in array p_tile_ids loop
    if not stackdown._is_exposed(g_row.tiles, gone, tid) then
      raise exception 'BUG: word using a covered tile'
        using errcode = 'PN292', hint = 'fault', column = '_',
        detail = 'a tile was covered at the moment it was picked';
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
  w := lower(stackdown._word(g_row.tiles, p_tile_ids));
  select count(*) into cleared
    from stackdown.events s
   where s.game_id = p_game_id and s.valid
     and (v_mode = 'coop' or s.user_id = caller_id);
  is_word := coalesce(w = g_row.solution[cleared + 1], false);

  -- Log the submission (valid or not) — and either way it spent a go: a good
  -- word and a bad word both cost the submitter a turn here.
  insert into stackdown.events (game_id, user_id, kind, word, tile_ids, valid, took_turn)
  values (p_game_id, caller_id, 'word', w, p_tile_ids, is_word, true);

  if not is_word then
    -- `ok`: a game-rule refusal is the rules being applied, and nothing was
    -- cleared. `data` carries the case; the sentence names the word, because by
    -- the time it is read the tiles are back on the board and the word is gone
    -- from the screen.
    v_answer := common.ok_envelope(
      jsonb_build_object('result', 'invalid', 'word', w, 'terminal', false),
      'lost', format('Not a word: %s', upper(w)));
  else
    -- ─── Accepted: remove tiles (implicitly, via the valid row), advance ──
    update stackdown.players
       set found_count = found_count + 1
     where game_id = p_game_id and user_id = caller_id
     returning found_count into new_found;

    if v_mode = 'coop' then
      select count(*) into team_found
        from stackdown.events where game_id = p_game_id and valid;
      -- Surface the cleared words as the club-list title. They're shared and
      -- already shown in the FoundWords panel, so this reveals nothing new.
      -- Runs on every valid coop word, including the sixth — leaving the
      -- final title in place when the game ends below.
      update common.games
         set title = stackdown._found_title(g_row.solution, team_found)
       where id = p_game_id;
      if team_found >= array_length(g_row.solution, 1) then
        out_terminal := true;
        update common.game_players
           set solved_at = now()
         where game_id = p_game_id;
        select jsonb_object_agg(user_id::text, 1) into v_rankings
          from common.game_players where game_id = p_game_id;
        perform common.end_game(
          p_game_id, 'reached_goal', 'cleared', caller_id,
          p_is_no_result => false,
          p_final_rankings => v_rankings
        );
      end if;
    else
      -- Compete is a RACE: the first to clear all six wins immediately.
      if new_found >= array_length(g_row.solution, 1) then
        out_terminal := true;
        update common.game_players
           set solved_at = now()
         where game_id = p_game_id and user_id = caller_id;
        perform common.end_game(
          p_game_id, 'reached_goal', 'cleared', caller_id,
          p_is_no_result => false,
          p_final_rankings => jsonb_build_object(caller_id::text, 1)
        );
      end if;
    end if;

    -- No message: the tiles clearing is the answer.
    v_answer := common.ok_envelope(
      jsonb_build_object('result', 'accepted', 'word', w, 'terminal', out_terminal), 'won');
  end if;

  perform stackdown._write_statuses(p_game_id, p_update_status_changed_at => true);
  return v_answer;

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common.raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function stackdown.submit_word(uuid, int[]) from public;
grant execute on function stackdown.submit_word(uuid, int[]) to authenticated;

drop function if exists stackdown.reveal_next_word(uuid);

-- ============================================================
-- stackdown.reveal_next_word — a CHEAT (peek at the next word)
-- ============================================================
-- Returns the next solution word the caller still has to clear. This
-- deliberately defeats the hidden-solution invariant: it is the game's
-- spoiler, the way out for a stuck player. Gated like any move (game
-- player, the game not ended).
--
-- "Next word" = solution[words-cleared + 1]. Strict board validity means
-- words can only be cleared in solution order, so the count of cleared
-- words IS the index of the next one. Cleared count mirrors submit_word's
-- removed-set rule: coop = every valid submission on the shared board,
-- compete = the caller's own.
create or replace function stackdown.reveal_next_word(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row     stackdown.games%rowtype;
  v_mode    text;
  v_ended_at timestamptz;
  cleared   int;
  next_word text;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row first, before the membership gate: a friend deleting the game
  -- takes every membership with it (docs/envelopes.md → a missing game row
  -- is PN485).
  -- `for update` serializes the request-logging insert below against
  -- concurrent submits / spoilers on this game.
  select * into g_row from stackdown.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('stackdown');
  end if;

  caller_id := common.require_game_player(p_game_id);

  select ended_at, mode into v_ended_at, v_mode from common.games where id = p_game_id;
  if v_ended_at is not null then
    -- A race: the game ended under you while the request was in flight.
    perform common._raise_game_over();
  end if;

  select count(*) into cleared
    from stackdown.events s
   where s.game_id = p_game_id and s.valid
     and (v_mode = 'coop' or s.user_id = caller_id);

  next_word := g_row.solution[cleared + 1];
  if next_word is null then
    -- Unreachable: clearing the sixth word ENDS the game in both modes, so a
    -- later call meets the ended check above and reads "Game over". Kept as
    -- an assertion that the game-ending invariant holds.
    raise exception 'BUG: reveal after the stack was cleared'
      using errcode = 'PN298', hint = 'fault', column = '_',
      detail = 'solution has no word at cleared + 1';
  end if;

  -- Log a "Revealed: <word>" entry, once per (player, word) so repeated
  -- clicks don't spam the log. The revealed word is STORED on the row (in
  -- `word`, lowercase like every other word) so the log can show it — this is
  -- an explicit cheat, so leaking the word to the row's viewers (coop = all,
  -- compete = requester until the game ends) is the intended behavior.
  -- Visibility rides the events RLS.
  if not exists (
    select 1 from stackdown.events
     where game_id = p_game_id and user_id = caller_id
       and kind = 'spoiler' and for_word_index = cleared
  ) then
    -- Being handed the word costs a go, the same as trying one.
    insert into stackdown.events (game_id, user_id, kind, for_word_index, word, took_turn)
    values (p_game_id, caller_id, 'spoiler', cleared, next_word, true);
  end if;

  perform stackdown._write_statuses(p_game_id, p_update_status_changed_at => true);

  -- A spoiler is RED. Its price is the whole hunt for this word — there is
  -- nothing left to find, so it reads as a loss and not as the amber caution a
  -- hint wears (the frontend's lib/answer.ts says the same
  -- word for the row this wrote). No message — the word IS the answer, and the
  -- surface shows it.
  --
  -- `result` names the case even though there is only one today: a call site
  -- may not take an `ok` branch by merely matching `ok` (docs/envelopes.md →
  -- Choosing which `ok` branch), because a second answer added here would then
  -- be rendered as this one, silently. The word is the row's own `kind`, so the
  -- envelope and the row it wrote say the same thing — and "reveal" is taken on
  -- this page by the action that shows the WHOLE solution at game over.
  return common.ok_envelope(
    jsonb_build_object('result', 'spoiler', 'word', next_word), 'lost');

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common.raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function stackdown.reveal_next_word(uuid) from public;
grant execute on function stackdown.reveal_next_word(uuid) to authenticated;

drop function if exists stackdown.reveal_next_hint(uuid);

-- ============================================================
-- stackdown.reveal_next_hint — the "give it a nudge" helper
-- ============================================================
-- Returns the HINT for the next solution word the caller still has to
-- clear — a clue that points at the word without naming it (see
-- common.words.hint). Unlike reveal_next_word it doesn't leak the word
-- itself: only the hint text crosses the wire.
--
-- There is no "this word has no hint" answer — see the raise below for why a
-- missing hint is a fault instead. Same gating + next-word math as
-- reveal_next_word.
create or replace function stackdown.reveal_next_hint(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row     stackdown.games%rowtype;
  v_mode    text;
  v_ended_at timestamptz;
  v_band    text;
  cleared   int;
  next_word text;
  hint_text text;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row first, before the membership gate: a friend deleting the game
  -- takes every membership with it (docs/envelopes.md → a missing game row
  -- is PN485).
  -- `for update` serializes the request-logging insert below (see
  -- reveal_next_word).
  select * into g_row from stackdown.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('stackdown');
  end if;

  caller_id := common.require_game_player(p_game_id);

  select ended_at, mode, setup->>'band' into v_ended_at, v_mode, v_band
    from common.games where id = p_game_id;
  if v_ended_at is not null then
    -- A race: the game ended under you while the request was in flight.
    perform common._raise_game_over();
  end if;

  select count(*) into cleared
    from stackdown.events s
   where s.game_id = p_game_id and s.valid
     and (v_mode = 'coop' or s.user_id = caller_id);

  next_word := g_row.solution[cleared + 1];
  if next_word is null then
    -- Unreachable, same as reveal_next_word's: clearing the last word ends the
    -- game, so the ended check answers first.
    raise exception 'BUG: hint after the stack was cleared'
      using errcode = 'PN299', hint = 'fault', column = '_',
      detail = 'solution has no word at cleared + 1';
  end if;

  select hint into hint_text from common.words where word = lower(next_word);
  -- EVERY word a stackdown board can use has a hint: the setup form offers
  -- bands 1..2 and the board library holds only those, and common.words carries
  -- a hint for every 5-letter word at those bands (2496/2496 and 1665/1667 —
  -- the two exceptions are a known data gap, src/stackdown/todo.md). So a null here
  -- is the dictionary being wrong, not this game being unusual. The word rides
  -- in the detail so the `[db]` line names the row to fix.
  if hint_text is null then
    raise exception 'BUG: no hint for a band-% word', coalesce(v_band, '1')
      using errcode = 'PN297', hint = 'fault', column = '_',
      detail = format('common.words has no hint for %L', lower(next_word));
  end if;

  -- Log a "Hint: <clue>" entry, once per (player, word). The hint TEXT is
  -- stored on the row (in `word`) so the log can show it — this leaks only the
  -- clue, never the word (the whole point of reveal_next_hint). Visibility
  -- rides the events RLS (coop → all; compete → requester).
  if not exists (
    select 1 from stackdown.events
     where game_id = p_game_id and user_id = caller_id
       and kind = 'hint' and for_word_index = cleared
  ) then
    -- A hint nudges rather than moves: it spends no go.
    insert into stackdown.events (game_id, user_id, kind, for_word_index, word, took_turn)
    values (p_game_id, caller_id, 'hint', cleared, hint_text, false);
  end if;

  perform stackdown._write_statuses(p_game_id, p_update_status_changed_at => true);

  -- Amber: a hint is a nudge, neither good nor bad play (the spoiler beside it
  -- is red, because it ends the hunt rather than nudging it). No message — the
  -- clue IS the answer. `result` names the case for the same reason as
  -- reveal_next_word's.
  return common.ok_envelope(
    jsonb_build_object('result', 'hint', 'hint', hint_text), 'warning');

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common.raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function stackdown.reveal_next_hint(uuid) from public;
grant execute on function stackdown.reveal_next_hint(uuid) to authenticated;

drop function if exists stackdown.submit_timeout(uuid);

-- ============================================================
-- stackdown.submit_timeout — countdown-timer expiry
-- ============================================================
-- The FE fires this when a countdown hits 0. Coop: the shared board wasn't
-- cleared → lost. Compete: time's up with no winner (a winner would have
-- ended the game already via submit_word's race), so nobody is ranked and
-- everyone loses. A second call finds the game ended and answers the
-- game-over race.
create or replace function stackdown.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  v_ended_at    timestamptz;
  v_turn_holder uuid;
begin
  perform 1 from stackdown.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('stackdown');
  end if;

  perform common.require_game_player(p_game_id);

  select ended_at, current_turn_user_id into v_ended_at, v_turn_holder
    from common.games where id = p_game_id;
  if v_ended_at is not null then
    perform common._raise_game_over();
  end if;

  perform common.end_game(
    p_game_id, 'timeout', 'timeout', v_turn_holder,
    p_is_no_result => false,
    p_final_rankings => '{}'::jsonb
  );

  perform stackdown._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common.ok_envelope(jsonb_build_object('result', 'ended'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common.raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function stackdown.submit_timeout(uuid) from public;
grant execute on function stackdown.submit_timeout(uuid) to authenticated;

drop function if exists stackdown.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists stackdown.end_game(uuid);

-- ============================================================
-- stackdown.stop_game — the Stop
-- ============================================================
-- Any player stops the game for the whole table, in either mode. It is
-- neutral: nobody won, nobody lost (docs/common-schema.md → Stop).
create or replace function stackdown.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from stackdown.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('stackdown');
  end if;

  perform common._stop(p_game_id);

  perform stackdown._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common.ok_envelope(jsonb_build_object('result', 'ended'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common.raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function stackdown.stop_game(uuid) from public;
grant execute on function stackdown.stop_game(uuid) to authenticated;

drop function if exists stackdown.concede(uuid);

-- ============================================================
-- stackdown.concede — a racer drops out of a compete game
-- ============================================================
-- stackdown compete is a race to clear the stack (first to clear wins,
-- ending the game via submit_word) — a player can end no other way, so
-- `common._concede` decides it all: it records the concession and, if that
-- was the last racer, ends the game as a collective loss. Compete only
-- (coop ends via the shared Stop).
create or replace function stackdown.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked like every move, so every game's concede has one shape
  -- (docs/common-schema.md → Concede).
  perform 1 from stackdown.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('stackdown');
  end if;

  perform common.require_compete((select mode from common.games where id = p_game_id));

  perform common._concede(p_game_id);

  perform stackdown._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common.ok_envelope(jsonb_build_object('result', 'conceded'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common.raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function stackdown.concede(uuid) from public;
grant execute on function stackdown.concede(uuid) to authenticated;

drop function if exists stackdown.replay_board(uuid);

-- ============================================================
-- stackdown.replay_board — restart this stack from scratch
-- ============================================================
-- The "Replay board" game-menu item: reset the working state on the
-- SAME game row. The frozen puzzle (tiles / solution) stays — the same
-- stack, cleared again; everything the players did is wiped. Any game
-- player may call it, from a finished game OR mid-game (no ended check —
-- it's a restart). Both modes reset ALL players (a group "run it back",
-- per the friends trust model).
--
-- Three things reset, matching what create_game established:
--   - every player's found count zeroed;
--   - the submission log cleared (words, hints AND reveals — a replay is
--     a genuine second try, so the cheats you spent don't carry over);
--   - the club-list TITLE back to 'New game'. Coop rewrites it to the
--     cleared words as it plays (submit_word → _found_title), so without
--     this a replayed game would advertise the previous run's words —
--     and, in a game whose whole point is that the solution is hidden,
--     spoil the board it just reset.
--
-- Then the common-layer reset (common.reset_game: the ending, each
-- player's ending, solve and result) and the statuses. The solution
-- re-hides on its own — games_state gates it on common.games.ended_at,
-- which reset_game clears.
create or replace function stackdown.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- FOR UPDATE: a replay racing a move must not interleave with it (the move
  -- RPCs lock the same row), or the reset could land on a half-applied move —
  -- a stray log row in the "fresh" game, or worse, an in-flight game-ENDING
  -- move ending the board that was just reset.
  perform 1 from stackdown.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('stackdown');
  end if;

  -- The row check comes BEFORE the membership gate, and the order is the whole
  -- point: `delete_game` takes this row, `common.games` and every
  -- `game_players` row together, so a caller whose game was just deleted has no
  -- membership left either. Gate-first told them "You are not in this game",
  -- which is both wrong and unhelpful — they WERE in it; it is gone.
  perform common.require_game_player(p_game_id);

  update stackdown.players
     set found_count = 0
   where game_id = p_game_id;

  delete from stackdown.events where game_id = p_game_id;

  update common.games set title = 'New game' where id = p_game_id;

  perform common.reset_game(p_game_id);

  perform stackdown._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common.ok_envelope(jsonb_build_object('result', 'replayed'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common.raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function stackdown.replay_board(uuid) from public;
grant execute on function stackdown.replay_board(uuid) to authenticated;
