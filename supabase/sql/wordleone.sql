-- cs-unmet

-- ============================================================
-- wordleone
-- ============================================================
-- What the frontend calls:
--
--   create_game     starts a game on a puzzle the `wordleone-build-board`
--                   edge function built, after checking it is one
--   submit_guess    guesses a word: the answer solves, a legal wrong word is
--                   a miss
--   concede         a racer drops out of a compete game
--   stop_game       stops the game for everyone, with no result
--   submit_timeout  ends the game when the countdown runs out
--   replay_board    restarts the same puzzle from scratch
--
-- What the frontend reads is none of this schema's tables: `_rebuild_data_cols`
-- writes the page blobs onto `common.games` after every move — `game_data`,
-- `summary_data`, and `shell_data` through common — and `create_game` writes
-- `static_game_data` once; the page reads those.
--
-- What is particular to wordleone (plans/wordleone.md has the design):
--   - The puzzle is a starter word and its colors against the hidden answer,
--     and the answer is the only word at or below the legal band that makes
--     those colors. The legal band is not chosen: it is two above the setup's
--     answer band (`_legal_band_for`). The starter is public from the first
--     paint, in `static_game_data`; the answer is hidden by a column grant,
--     and `game_data` carries it only once the game has ended.
--   - Guesses are unlimited. A legal wrong word is a MISS: counted, logged
--     with no colors, and nothing more. A guess that isn't a legal word, or
--     repeats one, costs nothing: an `ok` that names the refusal, no row.
--   - Coop shares one board and one miss count, and ends on the solve. A
--     compete race plays out: each racer plays until they solve or concede,
--     and the ranking is fewest misses, then the earlier solve.
--   - The title is a readout (`_sync_title`), as wordle's.
--   - What a racer may see of a rival mid-race is the hook's rule, not a
--     policy's: the blob carries everything, the hook withholds.
--
-- How this file relates to the migrations: docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema wordleone to authenticated;

-- Column-level grant: everything EXCEPT `target`, the secret. The presence of
-- any column grant flips the table to "only granted columns", so the safe ones
-- are enumerated. `game_data` (`_make_json_puzzle`) is the only path a client
-- has to the target, and only once the game has ended.
grant select
  (game_id, starter, starter_colors, legal_band, difficulty)
  on wordleone.games to authenticated;
-- Viewing is club-gated; acting is player-gated in the RPCs.
drop policy if exists games_select on wordleone.games;
create policy games_select on wordleone.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

grant select on wordleone.players to authenticated;
drop policy if exists players_select on wordleone.players;
create policy players_select on wordleone.players
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = players.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

grant select on wordleone.events to authenticated;
drop policy if exists events_select on wordleone.events;
create policy events_select on wordleone.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- ============================================================
-- wordleone._sync_title — recompute the club-list title from state
-- ============================================================
-- wordle's readout (wordle._sync_title has the reasoning): coop shows the
-- latest guess, compete a placeholder until the race ends. A miss titles the
-- game with the missed word; only the solve spells the answer.
create or replace function wordleone._sync_title(p_game_id uuid)
returns void
language sql
security definer
set search_path = wordleone, common, public, extensions
as $$
  update common.games cg
     set title = case
           when cg.mode = 'coop' then coalesce(
             (select upper(e.word::text)
                from wordleone.events e
               where e.game_id = p_game_id
               order by e.id desc
               limit 1),
             'New game')
           when cg.ended_at is not null then coalesce(
             (select upper(e.word::text)
                from wordleone.events e
               where e.game_id = p_game_id
               order by e.id desc
               limit 1),
             'New compete')
           else 'New compete'
         end
   where cg.id = p_game_id;
$$;

revoke execute on function wordleone._sync_title(uuid) from public;

-- ============================================================
-- The page blobs
-- ============================================================
-- `static_game_data` is what nothing after `create_game` changes, written once
-- by `_write_static_game_data`; the page hands it to `useGame`, which merges
-- each key back into its place in `game_data`.
--
--   static_game_data, wordleone's part:
--     puzzle: {starter, colors}            the half of the puzzle every player
--                                          sees from the first paint
--
--   game_data, wordleone's part:
--     puzzle: {target, targetBand}         both null until the game ends
--     team: {nMisses, board}               the team's facts, once; null in compete
--                                          (docs/common-schema.md → A player's facts)
--     events: [{id, userId, word, colors, verdict, correct, at}, …]
--                                          every player's; `verdict` is correct,
--                                          miss or not_a_word; `colors` is 'ggggg'
--                                          for the solve and null otherwise
--     players: [player, …]                 the common player, plus:
--       nMisses                            this player's own
--       board: {rows: [{word, colors}, …]} a racer's own: the starter, then the
--                                          green row once solved; null in coop,
--                                          whose one board is `team`'s
--       tieBrokenByClock                   compete, once ranked: the earlier solve,
--                                          not the count, placed this solver against
--                                          the winner; null in coop and until the end
--
--   summary_data, wordleone's part:
--     team: {nMisses}                      null in compete
--     answerBand                           the setup's: 0 the NYT list, 1–6 a band
--     difficulty                           the tier the puzzle was built to
--     nWinnerMisses                        compete's, once the race is won; null in coop
--     nMissesById                          each racer's misses; null in coop

-- The answer, once the game has ended, and its band in `common.words` today
-- (for the ratings survey; plans/wordleone.md → The ratings).
create or replace function wordleone._make_json_puzzle(wg wordleone.games, p_ended boolean)
returns jsonb
language sql
stable
set search_path = wordleone, common, public, extensions
as $$
  select jsonb_build_object(
    'target',     case when p_ended then wg.target::text end,
    'targetBand', case when p_ended then
                    (select w.band from common.words w where w.word = wg.target::text) end);
$$;

revoke execute on function wordleone._make_json_puzzle(wordleone.games, boolean) from public;

-- The log: every miss, every word outside the band, and the solve, in the
-- order of play. `correct` is `verdict = 'correct'`, kept for the readers that
-- ask only that.
create or replace function wordleone._make_json_events(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = wordleone, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',      e.id,
           'userId',  e.user_id,
           'word',    e.word::text,
           'colors',  e.colors::text,
           'verdict', e.verdict,
           'correct', e.is_correct,
           'at',      e.created_at) order by e.id), '[]'::jsonb)
    from wordleone.events e
   where e.game_id = p_game_id;
$$;

revoke execute on function wordleone._make_json_events(uuid) from public;

-- What a side's board shows: the starter in its colors, then the answer all
-- green once the side has solved. A null `p_user_id` is the coop team's one
-- board; else that racer's own. Misses are not rows: they are the log's.
create or replace function wordleone._make_json_board(p_game_id uuid, p_user_id uuid)
returns jsonb
language sql
stable
set search_path = wordleone, common, public, extensions
as $$
  select jsonb_build_object(
    'rows', jsonb_build_array(jsonb_build_object(
              'word',   wg.starter::text,
              'colors', wg.starter_colors::text))
            || coalesce(
                 (select jsonb_agg(jsonb_build_object(
                           'word',   e.word::text,
                           'colors', e.colors::text) order by e.id)
                    from wordleone.events e
                   where e.game_id = p_game_id
                     and e.is_correct
                     and (p_user_id is null or e.user_id = p_user_id)),
                 '[]'::jsonb))
    from wordleone.games wg
   where wg.game_id = p_game_id;
$$;

revoke execute on function wordleone._make_json_board(uuid, uuid) from public;

-- The team's count: the misses summed over every row. Null in compete.
create or replace function wordleone._make_json_team_counts(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = wordleone, common, public, extensions
as $$
  select case when cg.mode = 'coop' then jsonb_build_object(
           'nMisses', (select sum(n_misses) from wordleone.players where game_id = p_game_id))
         end
    from common.games cg
   where cg.id = p_game_id;
$$;

revoke execute on function wordleone._make_json_team_counts(uuid) from public;

-- The team's facts, sent once: its count and the one board. Null in compete.
create or replace function wordleone._make_json_team(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = wordleone, common, public, extensions
as $$
  select wordleone._make_json_team_counts(p_game_id) || jsonb_build_object(
           'board', wordleone._make_json_board(p_game_id, null))
    from common.games cg
   where cg.id = p_game_id
     and cg.mode = 'coop';
$$;

revoke execute on function wordleone._make_json_team(uuid) from public;

-- Every player as game_data shows them: the common player, with their own
-- misses, in compete their board, and the clock's tie-break.
create or replace function wordleone._make_json_players(p_game_id uuid)
returns jsonb
language plpgsql
stable
set search_path = wordleone, common, public, extensions
as $$
declare
  v_mode text;
  -- Compete's winner, once ranked, and their count: `_finish_compete` ranks
  -- solvers by misses, then the earlier solve, so a solver on the winner's
  -- count was placed against the winner by the clock.
  v_winner_id uuid;
  v_winner_misses int;
begin
  select mode into v_mode from common.games where id = p_game_id;

  if v_mode = 'compete' then
    select gp.user_id, wp.n_misses
      into v_winner_id, v_winner_misses
      from common.game_players gp
      join wordleone.players wp on wp.game_id = gp.game_id and wp.user_id = gp.user_id
     where gp.game_id = p_game_id and gp.final_ranking = 1
     order by gp.solved_at
     limit 1;
  end if;

  return (
    select jsonb_agg(
             cp.player || jsonb_build_object(
               'nMisses',          wp.n_misses,
               'tieBrokenByClock',
                 case when v_winner_id is null then null
                      else gp.solved_at is not null
                           and wp.n_misses = v_winner_misses
                           and exists (
                             select 1
                               from common.game_players other
                               join wordleone.players other_wp
                                 on other_wp.game_id = other.game_id
                                and other_wp.user_id = other.user_id
                              where other.game_id = p_game_id
                                and other.user_id <> gp.user_id
                                and other.solved_at is not null
                                and other_wp.n_misses = v_winner_misses)
                 end,
               -- Coop's one board is sent once, in `team`.
               'board',            case when v_mode = 'compete'
                                     then wordleone._make_json_board(p_game_id, cp.id) end)
             order by cp.ord)
      from common._make_json_players(p_game_id) cp
      join wordleone.players wp on wp.game_id = p_game_id and wp.user_id = cp.id
      join common.game_players gp on gp.game_id = p_game_id and gp.user_id = cp.id
  );
end;
$$;

revoke execute on function wordleone._make_json_players(uuid) from public;

-- The whole game_data blob: the common part, with wordleone's puzzle, team,
-- log and players on top.
create or replace function wordleone._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = wordleone, common, public, extensions
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'puzzle',  wordleone._make_json_puzzle(wg, cg.ended_at is not null),
           'team',    wordleone._make_json_team(p_game_id),
           'events',  wordleone._make_json_events(p_game_id),
           'players', wordleone._make_json_players(p_game_id))
    from wordleone.games wg
    join common.games cg on cg.id = wg.game_id
   where wg.game_id = p_game_id;
$$;

revoke execute on function wordleone._make_json_game_data(uuid) from public;

-- The whole static_game_data blob: the common part, with the starter and its
-- colors on top.
create or replace function wordleone._make_json_static_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = wordleone, common, public, extensions
as $$
  select common._make_json_static_game_data(p_game_id) || jsonb_build_object(
           'puzzle', jsonb_build_object(
             'starter', wg.starter::text,
             'colors',  wg.starter_colors::text))
    from wordleone.games wg
   where wg.game_id = p_game_id;
$$;

revoke execute on function wordleone._make_json_static_game_data(uuid) from public;

-- The game summed up: the numbers a list of games shows for this one.
create or replace function wordleone._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
set search_path = wordleone, common, public, extensions
as $$
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
    'team',          wordleone._make_json_team_counts(p_game_id),
    'answerBand',    (cg.setup->>'answer_band')::int,
    'difficulty',    wg.difficulty,
    'nWinnerMisses', case when cg.mode = 'compete' then
                       (select wp.n_misses
                          from common.game_players gp
                          join wordleone.players wp
                            on wp.game_id = gp.game_id and wp.user_id = gp.user_id
                         where gp.game_id = p_game_id and gp.final_ranking = 1
                         order by gp.solved_at
                         limit 1)
                     end,
    'nMissesById',   case when cg.mode = 'compete' then
                       (select jsonb_object_agg(wp.user_id::text, wp.n_misses)
                          from wordleone.players wp
                         where wp.game_id = p_game_id)
                     end)
    from wordleone.games wg
    join common.games cg on cg.id = wg.game_id
   where wg.game_id = p_game_id;
$$;

revoke execute on function wordleone._make_json_summary_data(uuid, timestamptz) from public;

-- ============================================================
-- wordleone._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Rebuilds `game_data`, `summary_data` and `shell_data`, each assigned whole.
-- Every RPC calls it after a move, after `_sync_title`. `p_update_status_changed_at`
-- is true from create, Restart and every move, false from a rebuild by hand, so
-- a rebuild never re-dates a game.
create or replace function wordleone._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = wordleone, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = wordleone._make_json_game_data(p_game_id),
         summary_data = wordleone._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;

revoke execute on function wordleone._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- wordleone._write_static_game_data — one game's static blob, written
-- ============================================================
-- `create_game` calls this once, and `_rebuild_data_cols_for_all` for a shape
-- change; no move writes it. Restart keeps the puzzle, so it leaves it too.
create or replace function wordleone._write_static_game_data(p_game_id uuid)
returns void
language sql
security definer
set search_path = wordleone, common, public, extensions
as $$
  update common.games
     set static_game_data = wordleone._make_json_static_game_data(p_game_id)
   where id = p_game_id;
$$;

revoke execute on function wordleone._write_static_game_data(uuid) from public;

-- ============================================================
-- wordleone._rebuild_data_cols_for_all — every wordleone game's, rebuilt
-- ============================================================
-- For a shape change: both writers over every game without re-dating any, and
-- answers how many it rewrote. Run by hand as postgres (`gmake db-psql`); no
-- grant.
create or replace function wordleone._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = wordleone, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype in ('wordleone_coop', 'wordleone_compete')
  loop
    perform wordleone._write_static_game_data(v_game_id);
    perform wordleone._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function wordleone._rebuild_data_cols_for_all() from public;

-- ============================================================
-- wordleone.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)
-- ============================================================
-- Called by the `wordleone-build-board` edge function, as the player, with the
-- puzzle it built: `p_board` is {starter, colors, answer}, and the generator's
-- scores {positive_space, load_bearing}, which are kept as given. The parameter is
-- `p_board` because the shared `invokeCreateGame` passes every build-board
-- game's puzzle under that name.
--
-- The puzzle is checked for what makes it a puzzle at all — the colors are the
-- starter scored against the answer, the answer is a legal guess, and no other
-- legal word makes those colors — and a failure is a fault, since the
-- generator only hands over puzzles that pass. How hard it is (the tier's
-- green counts, the four-green ban, the positive-space ceiling) is the
-- generator's alone, so refining it never touches this file.
--
-- Setup shape (server validates):
--   { "answer_band": 0..6 (where the answer came from: 0 the NYT answer
--       list, 1..6 any clean word at or below the band; the guess gate and
--       the pool the answer is unique in are two bands above it,
--       `_legal_band_for`, stored as the game's legal_band),
--     "difficulty": 'easy' | 'medium' | 'hard' | 'any' (the tier asked for),
--     "timer": (none | countup | countdown{seconds}),
--     "coop_style": 'free-for-all' | 'turns' (coop only),
--     "first_turn_user_id": a player (with 'turns'; stripped from the
--       club's saved default) }

-- The legal band — the words a guess must be in, and the pool the answer is
-- unique in — is two bands above the answer band, capped at 6, with the NYT
-- list (answer band 0) counting as band 2, every word of it being at band 2
-- or easier (Joel, 2026-10-07). The generator's `poolBandFor` (gen.ts) is the
-- same rule; the edge function builds at it and create_game re-checks at it.
create or replace function wordleone._legal_band_for(p_answer_band int)
returns int
language sql
immutable
as $$
  select least(6, (case when p_answer_band = 0 then 2 else p_answer_band end) + 2);
$$;
revoke execute on function wordleone._legal_band_for(int) from public;

create or replace function wordleone.create_game(
  p_club_handle     text,
  p_setup           jsonb,
  p_player_user_ids uuid[],
  p_mode            text,
  p_board           jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = wordleone, common, public, extensions
as $$
declare
  new_id       uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  s_answer_band int;
  s_legal_band int;
  s_difficulty text;
  b_starter    text;
  b_colors     text;
  b_answer     text;
  first_turn   uuid;
begin
  perform common._require_club_member(p_club_handle);
  -- Must agree with numberOfPlayers in the game's manifest.
  perform common._require_player_count_max(p_player_user_ids, 6);

  perform common._require_valid_mode(p_mode);

  if p_mode = 'compete' then
    -- A solo race is a coop game with a timer; the club page and the players
    -- picker refuse one, so this is the server-side catch.
    if coalesce(array_length(p_player_user_ids, 1), 0) < 2 then
      raise exception 'BUG: race with fewer than two players'
        using errcode = 'PN518', hint = 'fault', column = '_',
      detail = 'compete needs >= 2 players';
    end if;
  end if;

  -- ─── Validate the setup ──────────────────────────────────
  -- No defaults: the setup form always sends both.
  s_answer_band := (p_setup->>'answer_band')::int;
  if s_answer_band is null or s_answer_band < 0 or s_answer_band > 6 then
    raise exception 'BUG: answer band of %', s_answer_band
      using errcode = 'PN519', hint = 'fault', column = '_',
      detail = 'setup.answer_band must be 0..6';
  end if;
  s_legal_band := wordleone._legal_band_for(s_answer_band);
  s_difficulty := p_setup->>'difficulty';
  if s_difficulty is null or s_difficulty not in ('easy', 'medium', 'hard', 'any') then
    raise exception 'BUG: difficulty of %', s_difficulty
      using errcode = 'PN520', hint = 'fault', column = '_',
      detail = 'setup.difficulty must be easy, medium, hard or any';
  end if;

  perform common._require_valid_timer(p_setup->'timer');

  -- ─── Check the puzzle ────────────────────────────────────
  b_starter := lower(p_board->>'starter');
  b_colors  := p_board->>'colors';
  b_answer  := lower(p_board->>'answer');
  if coalesce(b_starter, '') !~ '^[a-z]{5}$' or coalesce(b_answer, '') !~ '^[a-z]{5}$'
     or coalesce(b_colors, '') !~ '^[gyx]{5}$' then
    raise exception 'BUG: generated puzzle was not two words and five colors'
      using errcode = 'PN521', hint = 'fault', column = '_',
      detail = format('starter %L, colors %L, answer %L', b_starter, b_colors, b_answer);
  end if;
  if b_starter = b_answer then
    raise exception 'BUG: generated puzzle''s starter is its answer'
      using errcode = 'PN522', hint = 'fault', column = '_',
      detail = format('starter and answer are both %L', b_answer);
  end if;
  if b_colors <> common._wordle_colors(b_starter, b_answer) then
    raise exception 'BUG: generated puzzle''s colors are not the starter scored against the answer'
      using errcode = 'PN523', hint = 'fault', column = '_',
      detail = format('%L against %L is %L, not %L',
        b_starter, b_answer, common._wordle_colors(b_starter, b_answer), b_colors);
  end if;
  if not exists (
    select 1 from common.words
     where word = b_answer and len = 5 and band <= s_legal_band
  ) then
    raise exception 'BUG: generated puzzle''s answer is not a legal guess'
      using errcode = 'PN524', hint = 'fault', column = '_',
      detail = format('%L is not a word at band <= %s', b_answer, s_legal_band);
  end if;
  -- One pass over the band's words, once per game.
  if exists (
    select 1 from common.words
     where len = 5 and band <= s_legal_band and word <> b_answer
       and common._wordle_colors(b_starter, word) = b_colors
  ) then
    raise exception 'BUG: generated puzzle has more than one answer'
      using errcode = 'PN525', hint = 'fault', column = '_',
      detail = format('another word at band <= %s makes %L against %L',
        s_legal_band, b_colors, b_starter);
  end if;

  new_id := common._create_game(
    -- The starting title; `_sync_title` owns both placeholders. The saved
    -- default strips first_turn_user_id, a per-game choice.
    p_club_handle, 'wordleone_' || p_mode, p_mode, p_player_user_ids,
    case p_mode when 'coop' then 'New game' else 'New compete' end, p_setup,
    p_setup - 'first_turn_user_id'
  );

  -- Opt-in turn-by-turn coop: seat the common rotation so submit_guess gates
  -- each guess. Runs after common._create_game seeds game_players.
  if p_mode = 'coop' and p_setup->>'coop_style' = 'turns' then
    first_turn := (p_setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(p_player_user_ids)) then
      raise exception 'BUG: first player who is not in the game'
        using errcode = 'PN526', hint = 'fault', column = '_',
      detail = 'setup.first_turn_user_id must be one of the players';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  -- The generator's scores ride along unchecked: they describe the puzzle and
  -- decide nothing (plans/wordleone.md → The ratings).
  insert into wordleone.games
    (game_id, starter, starter_colors, target, legal_band, difficulty, positive_space, load_bearing)
  values
    (new_id, b_starter, b_colors, b_answer, s_legal_band, s_difficulty,
     (p_board->>'positive_space')::int, (p_board->>'load_bearing')::int);

  insert into wordleone.players (game_id, user_id)
  select new_id, uid from unnest(p_player_user_ids) uid;

  perform wordleone._write_static_game_data(new_id);
  perform wordleone._rebuild_data_cols(new_id, p_update_status_changed_at => true);

  return common._ok_envelope(jsonb_build_object('result', 'created', 'id', new_id));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function wordleone.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function wordleone.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

-- ============================================================
-- wordleone._finish_compete — end a compete game, whatever ended it
-- ============================================================
-- The ONE place a race's ending is ranked: every player who solved, by fewest
-- misses, then the earlier solve; ties on both share a ranking. A player who
-- didn't solve — conceded, or still going at the timeout — is unranked, and
-- nobody solved is a collective loss. Its callers pass the act that ended it.
create or replace function wordleone._finish_compete(
  p_game_id uuid,
  p_reason text,
  p_reason_detail text,
  p_ended_by_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = wordleone, common, public, extensions
as $$
declare
  v_rankings jsonb;
begin
  select coalesce(jsonb_object_agg(user_id::text, ranking), '{}'::jsonb)
    into v_rankings
    from (
      select gp.user_id,
             rank() over (order by wp.n_misses, gp.solved_at) as ranking
        from wordleone.players wp
        join common.game_players gp
          on gp.game_id = wp.game_id and gp.user_id = wp.user_id
       where wp.game_id = p_game_id and gp.solved_at is not null
    ) ranked;

  perform common._end_game(
    p_game_id, p_reason, p_reason_detail, p_ended_by_user_id,
    p_is_no_result => false,
    p_final_rankings => v_rankings
  );
end;
$$;

revoke execute on function wordleone._finish_compete(uuid, text, text, uuid) from public;

-- ============================================================
-- wordleone._maybe_finish_compete — end the compete game if it's over
-- ============================================================
-- A race ends when NO player is still racing — each has solved or conceded.
-- Shared by submit_guess and concede; the act passed is the last racer's and
-- becomes the game's reason. Everyone conceding is `common._concede`'s ending,
-- so this skips a game that has already ended. Returns true when it ended the
-- game.
create or replace function wordleone._maybe_finish_compete(
  p_game_id uuid,
  p_reason text,
  p_reason_detail text,
  p_ended_by_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = wordleone, common, public, extensions
as $$
begin
  if (select ended_at from common.games where id = p_game_id) is not null then
    return false;
  end if;

  if exists (
    select 1 from common.game_players
     where game_id = p_game_id and player_ended_at is null
  ) then
    return false;
  end if;

  perform wordleone._finish_compete(p_game_id, p_reason, p_reason_detail, p_ended_by_user_id);
  return true;
end;
$$;

revoke execute on function wordleone._maybe_finish_compete(uuid, text, text, uuid) from public;

-- ============================================================
-- wordleone.submit_guess — the core move
-- ============================================================
-- Soft rejections (an `ok`: nothing counted, no turn spent) are a word
-- already on this board — the starter, or an earlier guess — ('duplicate'),
-- which writes nothing, and a word outside the legal band ('notAWord'), which
-- is logged so the players can see what was tried. The answer solves; any
-- other legal word is a miss: logged with no colors and counted. Hard
-- rejections (raised): not a player, the game has ended, out of turn, the
-- caller conceded, a malformed entry, the caller already solved.
--
-- The endings it can reach: coop solves (`reached_goal`/'solved', the team
-- ranked 1); a compete solve ends that player, and the race if nobody is left
-- racing. A miss ends nothing.
--
-- The `ok` carries { result, n_misses, solved, game_ended } — `n_misses` the
-- team's in coop, the caller's own in compete — `result` ∈ correct | miss |
-- notAWord | duplicate. No outcome and no message: what each is worth, and its
-- words, is the frontend's lib/answer.ts.
create or replace function wordleone.submit_guess(
  p_game_id uuid,
  p_guess   text
)
returns jsonb
language plpgsql
security definer
set search_path = wordleone, common, public, extensions
as $$
declare
  caller_id      uuid;
  g_row          wordleone.games%rowtype;
  v_mode         text;
  v_ended_at     timestamptz;
  norm           text;
  -- The misses before this guess: the team's in coop, the caller's in compete.
  v_misses       int;
  caller_solved  boolean;
  is_dup         boolean;
  did_solve      boolean;
  out_game_ended boolean := false;
  v_rankings     jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row first: a deleted game takes every membership with it, so the
  -- membership gate would answer "You are not in this game" to a player who
  -- was (docs/envelopes.md → a missing game row is PN485).
  select * into g_row from wordleone.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordleone');
  end if;

  caller_id := common._require_game_player(p_game_id);

  select ended_at, mode into v_ended_at, v_mode
    from common.games where id = p_game_id;
  if v_ended_at is not null then
    perform common._raise_game_over();
  end if;

  -- Before the soft rejects, so an out-of-turn guess is refused outright.
  perform common._require_turn(p_game_id, caller_id);

  -- A conceded racer is out; this fires only on a race with the concede.
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  -- ─── Malformed entry: a fault ────────────────────────────
  -- The client refuses a short word before it calls.
  norm := lower(trim(coalesce(p_guess, '')));
  if norm !~ '^[a-z]{5}$' then
    raise exception 'BUG: guess that was not five letters'
      using errcode = 'PN527', hint = 'fault', column = '_',
      detail = format('guess must match ^[a-z]{5}$; got %L', norm);
  end if;

  select solved_at is not null into caller_solved
    from common.game_players
   where game_id = p_game_id and user_id = caller_id;
  if caller_solved then
    -- Coop's solve ends the game, so only compete reaches this, and only from
    -- a broken client or a stale second tab: the board locks on the solve.
    raise exception 'Already solved'
      using errcode = 'PN528', hint = 'fault', column = '_',
      detail = 'this player has already found the answer';
  end if;

  if v_mode = 'coop' then
    select sum(n_misses) into v_misses
      from wordleone.players where game_id = p_game_id;
  else
    select n_misses into v_misses
      from wordleone.players where game_id = p_game_id and user_id = caller_id;
  end if;

  -- ─── Soft reject: duplicate ──────────────────────────────
  -- The starter is on every board. Past that, coop: anyone's earlier guess on
  -- the shared board; compete: the caller's own.
  is_dup := norm = lower(g_row.starter) or exists (
    select 1 from wordleone.events e
     where e.game_id = p_game_id and e.word = norm
       and (v_mode = 'coop' or e.user_id = caller_id));
  if is_dup then
    return common._ok_envelope(
      jsonb_build_object('result', 'duplicate', 'n_misses', v_misses,
                         'solved', false, 'game_ended', false));
  end if;

  -- ─── Soft reject: not in the legal band ──────────────────
  -- The answer is compared first, before the dictionary, as wordle's is: the
  -- band is read live, so a re-band mid-game must not make the answer "not a
  -- word". Logged, so the players can see what was tried, but it counts no
  -- miss and keeps the turn: `took_turn` false.
  if norm <> lower(g_row.target) and not exists (
    select 1 from common.words
     where word = norm and len = 5 and band <= g_row.legal_band
  ) then
    insert into wordleone.events (game_id, user_id, word, verdict, kind, took_turn)
    values (p_game_id, caller_id, norm, 'not_a_word', 'guess', false);
    perform wordleone._sync_title(p_game_id);
    perform wordleone._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
    return common._ok_envelope(
      jsonb_build_object('result', 'notAWord', 'n_misses', v_misses,
                         'solved', false, 'game_ended', false));
  end if;

  -- ─── Accept: the solve or a miss ─────────────────────────
  did_solve := norm = lower(g_row.target);

  -- Both spend a go: `took_turn` is a literal.
  insert into wordleone.events
    (game_id, user_id, word, colors, verdict, kind, took_turn)
  values
    (p_game_id, caller_id, norm,
     case when did_solve then 'ggggg' end,
     case when did_solve then 'correct' else 'miss' end, 'guess', true);

  if not did_solve then
    update wordleone.players
       set n_misses = n_misses + 1
     where game_id = p_game_id and user_id = caller_id;
    v_misses := v_misses + 1;
    -- A miss hands the turn on in turn-order coop (a no-op otherwise).
    if v_mode = 'coop' then
      perform common._advance_turn(p_game_id);
    end if;
  elsif v_mode = 'coop' then
    -- The team solves, so every teammate solved at this guess.
    update common.game_players
       set solved_at = now()
     where game_id = p_game_id;
    select jsonb_object_agg(user_id::text, 1) into v_rankings
      from common.game_players where game_id = p_game_id;
    perform common._end_game(
      p_game_id, 'reached_goal', 'solved', caller_id,
      p_is_no_result => false,
      p_final_rankings => v_rankings
    );
    out_game_ended := true;
  else
    -- This racer has ended while the others play on, so the common roster
    -- hears about it: a player nothing waits for must not hold presence-pause
    -- open. `neutral`: fewer misses may yet beat it.
    update common.game_players
       set solved_at = now()
     where game_id = p_game_id and user_id = caller_id;
    perform common._set_player_ended(p_game_id, caller_id, 'reached_goal', 'solved', 'neutral');
    out_game_ended := wordleone._maybe_finish_compete(p_game_id, 'reached_goal', 'solved', caller_id);
  end if;

  -- After the endings, so the title sees the settled `ended_at`.
  perform wordleone._sync_title(p_game_id);
  perform wordleone._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  return common._ok_envelope(
    jsonb_build_object(
      'result',     case when did_solve then 'correct' else 'miss' end,
      'n_misses',   v_misses,
      'solved',     did_solve,
      'game_ended', out_game_ended
    ));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function wordleone.submit_guess(uuid, text) from public;
grant execute on function wordleone.submit_guess(uuid, text) to authenticated;

-- ============================================================
-- wordleone.concede — a racer drops out of a compete game
-- ============================================================
-- Compete only. `common._concede` records the concession and ends the game if
-- everyone has conceded; otherwise the race ends here if every other racer has
-- already solved, with the concession as the act that ended it.
create or replace function wordleone.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordleone, common, public, extensions
as $$
declare
  caller_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked first, so the concession serializes against a concurrent
  -- submit_guess, which locks the same row; without it each reads the other's
  -- uncommitted "still racing" and the race never ends.
  perform 1 from wordleone.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordleone');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  caller_id := common._concede(p_game_id);
  perform wordleone._maybe_finish_compete(p_game_id, 'conceded', 'conceded', caller_id);
  perform wordleone._sync_title(p_game_id);

  perform wordleone._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'conceded'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function wordleone.concede(uuid) from public;
grant execute on function wordleone.concede(uuid) to authenticated;

-- ============================================================
-- wordleone.submit_timeout — countdown-timer expiry
-- ============================================================
-- Fired by the FE when a countdown hits 0; a second call finds the game ended
-- and answers the game-over race. Coop: not solved, so lost, nobody ranked.
-- Compete: the race ends as it stands, ranking whoever had solved. Who ended
-- it is the turn-holder in turn-order coop, nobody otherwise.
create or replace function wordleone.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordleone, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  v_mode        text;
  v_ended_at    timestamptz;
  v_turn_holder uuid;
begin
  perform 1 from wordleone.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordleone');
  end if;

  perform common._require_game_player(p_game_id);

  select mode, ended_at, current_turn_user_id
    into v_mode, v_ended_at, v_turn_holder
    from common.games where id = p_game_id;
  if v_ended_at is not null then
    perform common._raise_game_over();
  end if;

  if v_mode = 'coop' then
    perform common._end_game(
      p_game_id, 'timeout', 'timeout', v_turn_holder,
      p_is_no_result => false,
      p_final_rankings => '{}'::jsonb
    );
  else
    perform wordleone._finish_compete(p_game_id, 'timeout', 'timeout', null);
  end if;

  perform wordleone._sync_title(p_game_id);

  perform wordleone._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'ended'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function wordleone.submit_timeout(uuid) from public;
grant execute on function wordleone.submit_timeout(uuid) to authenticated;

-- ============================================================
-- wordleone.stop_game — the Stop
-- ============================================================
-- Any player stops the game for the whole table, in either mode; nobody won,
-- nobody lost (docs/common-schema.md → Stop).
create or replace function wordleone.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordleone, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a Stop racing the winning move waits for it and then reads the
  -- game as over, rather than overwriting the win.
  perform 1 from wordleone.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordleone');
  end if;

  perform common._stop(p_game_id);

  perform wordleone._sync_title(p_game_id);

  perform wordleone._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'ended'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function wordleone.stop_game(uuid) from public;
grant execute on function wordleone.stop_game(uuid) to authenticated;

-- ============================================================
-- wordleone.replay_board — restart this game from scratch
-- ============================================================
-- The Restart action, on the SAME game row: the puzzle stays, everything the
-- players did is wiped, for every player, from a finished game or mid-game.
-- The target re-hides on its own: `game_data` carries it only while
-- `ended_at` is set, which `common._reset_game` clears before the rebuild.
-- `static_game_data` is the puzzle's, so it is left as it is.
create or replace function wordleone.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordleone, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a replay racing a move cannot land on a half-applied one.
  perform 1 from wordleone.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordleone');
  end if;

  -- After the row check: a deleted game has no membership left either.
  perform common._require_game_player(p_game_id);

  update wordleone.players
     set n_misses = 0
   where game_id = p_game_id;

  delete from wordleone.events where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  perform wordleone._sync_title(p_game_id);

  perform wordleone._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'replayed'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function wordleone.replay_board(uuid) from public;
grant execute on function wordleone.replay_board(uuid) to authenticated;

-- ============================================================
-- wordleone.rate_puzzle — the puzzle-feedback survey
-- ============================================================
-- Temporary (plans/wordleone.md → The ratings). A player of an ended game
-- rates its puzzle: how hard it felt (1–7), the band they think the answer
-- belongs in (1–6), how long they say it took, a comment — each optional.
-- Every other column of the row is copied here from the game, so the row
-- stands without it: the puzzle, the answer's band today, the generator's tier
-- and scores, and the caller's own play — when they solved, their misses, and every
-- guess they sent that the server logged (misses, words outside the band, the
-- solve). The measured time is the game's start to their solve, and only for a
-- game never restarted, since a Restart keeps `started_at`.
--
-- No once-only rule: a second save is a second row. Nothing reads the table
-- but psql, so it has no grant and no select policy.
create or replace function wordleone.rate_puzzle(
  p_game_id          uuid,
  -- Each optional: a field left blank is left out of the call.
  p_rated_difficulty int  default null,
  p_seconds_reported int  default null,
  p_comment          text default null,
  p_suggested_band   int  default null
)
returns jsonb
language plpgsql
security definer
set search_path = wordleone, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row     wordleone.games%rowtype;
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  select * into g_row from wordleone.games where game_id = p_game_id;
  if not found then
    perform common._raise_game_deleted('wordleone');
  end if;

  caller_id := common._require_game_player(p_game_id);

  -- The form shows only once the game has ended.
  if (select ended_at from common.games where id = p_game_id) is null then
    raise exception 'BUG: a rating before the game ended'
      using errcode = 'PN533', hint = 'fault', column = '_',
      detail = 'rate_puzzle is offered only once the game has ended';
  end if;
  if p_rated_difficulty is not null and (p_rated_difficulty < 1 or p_rated_difficulty > 7) then
    raise exception 'BUG: a difficulty rating of %', p_rated_difficulty
      using errcode = 'PN534', hint = 'fault', column = '_',
      detail = 'p_rated_difficulty must be 1..7 or null';
  end if;
  if p_suggested_band is not null and (p_suggested_band < 1 or p_suggested_band > 6) then
    raise exception 'BUG: a suggested band of %', p_suggested_band
      using errcode = 'PN537', hint = 'fault', column = '_',
      detail = 'p_suggested_band must be 1..6 or null';
  end if;
  if p_seconds_reported is not null and p_seconds_reported < 0 then
    raise exception 'Seconds can''t be negative'
      using errcode = 'PN535', hint = 'form-validation', column = 'seconds_reported',
      detail = format('p_seconds_reported %s', p_seconds_reported);
  end if;
  if length(v_comment) > 1000 then
    raise exception 'Keep the comment under 1000 characters'
      using errcode = 'PN536', hint = 'form-validation', column = 'comment',
      detail = format('comment of %s characters', length(v_comment));
  end if;

  insert into wordleone.ratings (
    user_id, game_id, starter, starter_colors, answer, legal_band, answer_band,
    difficulty_asked, positive_space, load_bearing,
    rated_difficulty, suggested_band, seconds_reported, comment,
    solved_at, seconds_measured, n_misses, n_submits)
  select caller_id, p_game_id, g_row.starter, g_row.starter_colors, g_row.target, g_row.legal_band,
         (select w.band from common.words w where w.word = g_row.target::text),
         g_row.difficulty, g_row.positive_space, g_row.load_bearing,
         p_rated_difficulty, p_suggested_band, p_seconds_reported, v_comment,
         gp.solved_at,
         case when cg.restart_count = 0 and gp.solved_at is not null
              then greatest(0, extract(epoch from gp.solved_at - cg.started_at))::int end,
         wp.n_misses,
         (select count(*)::int from wordleone.events e
           where e.game_id = p_game_id and e.user_id = caller_id)
    from common.games cg
    join common.game_players gp on gp.game_id = cg.id and gp.user_id = caller_id
    join wordleone.players wp on wp.game_id = cg.id and wp.user_id = caller_id
   where cg.id = p_game_id;

  return common._ok_envelope(jsonb_build_object('result', 'rated'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function wordleone.rate_puzzle(uuid, int, int, text, int) from public;
grant execute on function wordleone.rate_puzzle(uuid, int, int, text, int) to authenticated;
