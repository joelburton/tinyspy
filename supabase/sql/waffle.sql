-- cs-unmet

-- ============================================================
-- waffle
-- ============================================================
-- What the frontend calls:
--
--   create_game      starts a game on a board the waffle-build-board edge
--                    function built
--   submit_swap      swaps two tiles; the swap that makes the board match the
--                    solution solves it
--   concede          a racer drops out of a compete game
--   stop_game        stops the game for everyone, with no result
--   submit_timeout   ends the game when the countdown runs out
--   replay_board     restarts the same board from its dealt state
--
-- What the frontend reads is none of this schema's tables: `_rebuild_data_cols`
-- writes the page blobs onto `common.games` after every move (plans/seat-view.md
-- → The page is written, not assembled) — `game_data`, `summary_data`, and
-- `shell_data` through common — and `create_game` writes `static_game_data`
-- once; the page reads those.
--
-- What is particular to waffle (docs/games/waffle.md has the rest):
--   - The board is built outside SQL, by an edge function, and taken at face
--     value; create_game checks only its structure.
--   - The solution is hidden by a column grant, and `game_data` carries it
--     only once the game has ended, in both modes.
--   - Each compete racer has a private board: another racer's board, colors
--     and swaps stay hidden until the game ends, since any of them would give
--     away correct letter positions. That is the hook's rule
--     (src/waffle/hooks/useGame.ts), not a policy's: the blob carries
--     everything, the hook withholds.
--   - Coop shares one board and one budget. A compete race plays out, ranked
--     by fewest swaps, then earliest solve. A timeout ranks whoever had
--     solved.
--   - The title is a readout (`_sync_title`): coop's correct words so far;
--     compete keeps a placeholder until the race ends.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema waffle to authenticated;

-- A board is a 25-char string, row-major (positions 0–24). The 4
-- interior "holes" (positions 6, 8, 16, 18 — cells in no word) are
-- the literal '.'; every other cell is a lowercase letter. The 6
-- words are the cell-index tuples mirrored from src/waffle/lib/
-- waffle.ts:
--     a0 = 0  1  2  3  4      d0 = 0 5 10 15 20
--     a2 = 10 11 12 13 14     d2 = 2 7 12 17 22
--     a4 = 20 21 22 23 24     d4 = 4 9 14 19 24
-- The 9 cells shared by an across + a down word are the intersections.

-- ============================================================
-- waffle._color_rank — strength ordering for the merge
-- ============================================================
-- green > yellow > gray > hole. Used to merge an intersection cell's
-- two per-word colors into the single displayed color.
create or replace function waffle._color_rank(c text)
returns int
language sql
immutable
as $$
  select case c when 'g' then 3 when 'y' then 2 when 'x' then 1 else 0 end;
$$;
revoke execute on function waffle._color_rank(text) from public;

-- Its name before a leading `_` came to mean "only SQL calls it".
drop function if exists waffle.board_colors(text, text);

-- ============================================================
-- waffle._board_colors — color a whole board against the solution
-- ============================================================
-- Pure function of (board, solution): both 25-char strings. Colors
-- each of the 6 words independently with common._wordle_colors, then merges
-- per cell — an intersection cell (in two words) shows the STRONGER
-- of its two colors (green > yellow > gray). Holes stay '.'.
--
-- This is the single source of truth for feedback; submit_swap returns it
-- and the read-view exposes it, both reading the hidden solution
-- server-side so the FE never holds the answer.
create or replace function waffle._board_colors(board text, solution text)
returns text
language plpgsql
immutable
as $$
declare
  -- The 6 words as 1-based cell indices (the 0-based grid positions + 1).
  words int[][] := array[
    array[1, 2, 3, 4, 5],        -- a0  (cells 0–4)
    array[11, 12, 13, 14, 15],   -- a2  (cells 10–14)
    array[21, 22, 23, 24, 25],   -- a4  (cells 20–24)
    array[1, 6, 11, 16, 21],     -- d0  (cells 0,5,10,15,20)
    array[3, 8, 13, 18, 23],     -- d2  (cells 2,7,12,17,22)
    array[5, 10, 15, 20, 25]     -- d4  (cells 4,9,14,19,24)
  ];
  res  text[] := array_fill('.'::text, array[25]);   -- holes stay '.'
  w    int;
  k    int;
  cell int;
  bw   text;
  sw   text;
  wc   text;
  col  text;
begin
  board    := lower(board);
  solution := lower(solution);

  for w in 1..6 loop
    -- Pull this word's board + solution letters out of the grid.
    bw := '';
    sw := '';
    for k in 1..5 loop
      cell := words[w][k];
      bw := bw || substr(board, cell, 1);
      sw := sw || substr(solution, cell, 1);
    end loop;

    wc := common._wordle_colors(bw, sw);

    -- Merge each cell's color, keeping the stronger of the two words.
    for k in 1..5 loop
      cell := words[w][k];
      col  := substr(wc, k, 1);
      if waffle._color_rank(col) > waffle._color_rank(res[cell]) then
        res[cell] := col;
      end if;
    end loop;
  end loop;

  return array_to_string(res, '');
end;
$$;
revoke execute on function waffle._board_colors(text, text) from public;

-- Column-level grant: everything EXCEPT `solution`. The presence of
-- any column grant flips the table from "all columns visible" to
-- "only granted columns," so we enumerate the safe ones. `game_data`
-- (`_make_json_puzzle`) is the only path a client has to the solution, and it
-- carries it only once the game has ended.
grant select
  (game_id, board_at_setup, par_swaps, max_swaps)
  on waffle.games to authenticated;
-- Read gating: any club member can read any of the club's games
-- (viewing is club-gated; acting is player-gated in the RPCs).
drop policy if exists games_select on waffle.games;
create policy games_select on waffle.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- Column grant EXCLUDING `board`: in compete you race independently, so an
-- opponent's board (and the deductions it reveals) stays off any client read.
-- The page reads every board from `game_data`, where the hook withholds a
-- rival's mid-race.
grant select (game_id, user_id, n_swaps_used)
  on waffle.players to authenticated;
-- Row visibility is club-member-wide; nothing reads this table from the
-- client.
drop policy if exists players_select on waffle.players;
create policy players_select on waffle.players
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = players.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

grant select on waffle.events to authenticated;
-- The swap log: any club member sees every row. Who may see a rival's swaps
-- mid-race is the hook's rule (src/waffle/hooks/useGame.ts), applied to
-- `game_data`; nothing reads this table from the client.
--
-- That rule is load-bearing, not politeness: every compete player solves the
-- SAME puzzle from the same dealt board, and a swap carries both positions and
-- both letters — so replaying a rival's log reconstructs their board exactly,
-- and their green tiles ARE correct letter positions. The hook withholds a
-- rival's swaps and board together.
drop policy if exists events_select on waffle.events;
create policy events_select on waffle.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- The two views the frontend read before the page blobs, and the definers they
-- read the hidden columns through. supabase/sql is re-applied, not diffed, so
-- the drops stay.
drop view if exists waffle.games_state;
drop view if exists waffle.players_state;
drop function if exists waffle._solution_for(uuid);
drop function if exists waffle._player_board_for(uuid, uuid);
drop function if exists waffle._player_colors_for(uuid, uuid);
drop function if exists waffle._board_visible(waffle.games, common.games, uuid);
drop function if exists waffle._board_visible(common.games, uuid);

-- ============================================================
-- waffle._word_slots
-- ============================================================
-- The 6 words of a solved waffle, as (first cell, stride) over the 1-based
-- 25-char board: 3 across (rows 0/2/4) then 3 down (cols 0/2/4). Mirrors the
-- cell tuples at the top of this file.
create or replace function waffle._word_slots()
returns table(start1 int, stride int)
language sql
immutable
as $$
  values (1, 1), (11, 1), (21, 1),   -- across: rows 0, 2, 4
         (1, 5), (3, 5), (5, 5);     -- down:   cols 0, 2, 4
$$;
revoke execute on function waffle._word_slots() from public;

-- ============================================================
-- waffle._correct_words
-- ============================================================
-- The words the player has actually GOT RIGHT: a word counts once all five of
-- its cells match the solution. Uppercased, alphabetical. An unsolved board
-- typically returns a few of them (the greens cluster into whole words long
-- before the puzzle falls), which is exactly what makes it a progress readout.
create or replace function waffle._correct_words(board text, solution text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(word order by word), '{}'::text[])
    from (
      select upper(string_agg(substr(solution, s.start1 + i * s.stride, 1), ''
                              order by i)) as word
        from waffle._word_slots() s, generate_series(0, 4) i
       group by s.start1, s.stride
      having bool_and(substr(board,    s.start1 + i * s.stride, 1)
                    = substr(solution, s.start1 + i * s.stride, 1))
    ) w;
$$;
revoke execute on function waffle._correct_words(text, text) from public;

-- ============================================================
-- waffle._format_title
-- ============================================================
-- Format a word list as a title: the first three, dash-joined ("ARENA-EAGER-
-- TOTEM"), or the placeholder when nothing qualifies yet.
create or replace function waffle._format_title(words text[], placeholder text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(array_length(words, 1), 0) = 0 then placeholder
    else array_to_string(words[1:3], '-')
  end;
$$;
revoke execute on function waffle._format_title(text[], text) from public;

drop function if exists waffle._sync_title(uuid);

-- ============================================================
-- waffle._sync_title — recompute the club-list title from state
-- ============================================================
-- The title is a READOUT, not a fixed name (the scrabble/stackdown pattern):
--
--   coop              → the correct words so far    "ARENA-EAGER-TOTEM"
--                       (falling back to "New game" before any word lands)
--   compete, mid-game → "New compete"
--   compete, ended    → the furthest board's correct words "ARENA-EAGER-TOTEM"
--
-- Coop shares one board, so its correct words are already on every screen —
-- surfacing them costs nothing. Compete does NOT get a mid-game readout: the
-- words ARE the solution, each racer has their own board, and the title is
-- club-wide readable — so a leader's progress would hand the trailing player
-- the answer. Compete waits for the end-of-game reveal, then names the game
-- after the puzzle it was.
--
-- Derived rather than assigned, so it's correct after ANY transition — a swap,
-- a timeout, a Stop, a concede, or a replay that rewinds the board (which must
-- un-tell the words). Every one of those calls this instead of remembering
-- its own formula.
create or replace function waffle._sync_title(p_game_id uuid)
returns void
language sql
security definer
set search_path = waffle, common, public, extensions
as $$
  update common.games cg
     set title = case
           when cg.mode = 'coop' then waffle._format_title(
             -- Any players row's board will do: coop boards are kept in
             -- lock-step.
             --
             -- The swap gate keeps this a readout of what the players have
             -- DONE: the team's swaps, summed over every player's own. A dealt
             -- board can hand them a whole correct word for free, and naming an
             -- untouched game after it would be a lie — worse, a replayed board
             -- and a fresh board are in identical state, so they must read
             -- identically. An ended game is exempt: its board is final,
             -- whatever the players did to it.
             (select case when (select sum(n_swaps_used) from waffle.players
                                 where game_id = p_game_id) > 0
                            or cg.ended_at is not null
                          then waffle._correct_words(wp.board, wg.solution)
                          else '{}'::text[] end
                from waffle.players wp
               where wp.game_id = p_game_id limit 1),
             'New game')
           -- An ended compete game: the correct words on the FURTHEST player's
           -- own board — never the solution itself, which would spoil a race
           -- nobody solved (waffle hides the answer on a loss so a Restart is
           -- a genuine second try).
           --
           -- One expression covers every ending, because a board is the
           -- evidence: a WINNER's board IS the solution, so a solved race still
           -- titles with all six; and an unsolved race names only what somebody
           -- actually got right — which is honest, since every board is
           -- visible once the game ends. The title can never name a word no
           -- player ever had.
           when cg.ended_at is not null then waffle._format_title(
             (select waffle._correct_words(wp.board, wg.solution)
                from waffle.players wp
               where wp.game_id = p_game_id
               order by coalesce(
                 array_length(waffle._correct_words(wp.board, wg.solution), 1), 0) desc
               limit 1),
             'New compete')
           else 'New compete'
         end
    from waffle.games wg
   where cg.id = p_game_id and wg.game_id = p_game_id;
$$;

revoke execute on function waffle._sync_title(uuid) from public;

-- The statuses' writer, from before the page blobs; supabase/sql is
-- re-applied, not diffed, so the drop stays.
drop function if exists waffle._write_statuses(uuid, boolean);

-- ============================================================
-- The page blobs — what the page shows, written by this game's builder
-- ============================================================
-- `_rebuild_data_cols` writes everything a page shows onto `common.games` after
-- every move (plans/seat-view.md → The page is written, not assembled):
-- `shell_data` through `common._make_json_shell_data`, and these two of
-- waffle's own, each builder bearing its column's name. `game_data` is the
-- common part (supabase/sql/common.sql → The page blobs' common parts) with
-- waffle's facts on top; the pieces below build each part, so `select
-- game_data from common.games` shows the page what it gets.
--
-- `static_game_data` is what nothing after `create_game` changes, written once
-- by `_write_static_game_data`; the page hands it to `useGame`, which merges
-- each key back into its place in `game_data`.
--
--   static_game_data, waffle's part:
--     puzzle: {dealtTiles, parSwaps}       the deal, frozen at create; a tile here
--                                          is {id, letter}, its id the cell's
--                                          position as text, the holes left out
--
--   game_data, waffle's part:
--     puzzle: {solution}                   null until the game ends; tiles as above
--     team: {nSwapsUsed, maxSwaps, board}  the team's facts, once: the swaps summed
--                                          over every player's own, the one board;
--                                          null in compete (docs/common-schema.md → A player's facts)
--     events: [{id, userId, swaps, colors, at}, …]
--                                          every swap, every player's; `swaps` the two
--                                          cells, each {id, letter} with the letter it
--                                          held before, `colors` the board's after;
--                                          what a racer may see of a rival mid-race is
--                                          the hook's rule
--     players: [player, …]                 the common player, plus this player's own facts:
--       maxSwaps                           the budget, the same on every player
--       nSwapsUsed
--       board: {tiles}                     a racer's own board, each tile
--                                          {id, letter, color}; null in coop, whose
--                                          one board is `team`'s
--
--   summary_data, waffle's part (the common part names and dates the game and
--   carries its ending; the winner is `ending.winner`):
--     team: {nSwapsUsed}                   the team's count; null in compete
--     maxSwaps
--     band                                 the dictionary band, `setup.difficulty`
--     nWinnerSwaps                         compete's, once the race is won; null in coop

-- A board's 21 tiles, by position: the cell's id, its letter, and — given the
-- board's colors — its color. The holes ('.') are left out.
create or replace function waffle._make_json_tiles(p_board text, p_colors text)
returns jsonb
language sql
immutable
set search_path = waffle, common, public, extensions
as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('id', (i - 1)::text, 'letter', substr(p_board, i, 1))
             || case when p_colors is null then '{}'::jsonb
                     else jsonb_build_object('color', substr(p_colors, i, 1)) end
           order by i), '[]'::jsonb)
    from generate_series(1, 25) i
   where substr(p_board, i, 1) <> '.';
$$;

revoke execute on function waffle._make_json_tiles(text, text) from public;

-- The puzzle's part of game_data: the solution once the game has ended
-- (wordle's rule; the column grant keeps it from any client read). The deal is
-- static (`_make_json_static_game_data`).
create or replace function waffle._make_json_puzzle(wg waffle.games, p_ended boolean)
returns jsonb
language sql
immutable
set search_path = waffle, common, public, extensions
as $$
  select jsonb_build_object(
    'solution', case when p_ended then waffle._make_json_tiles(wg.solution, null) end);
$$;

revoke execute on function waffle._make_json_puzzle(waffle.games, boolean) from public;

-- The log: every swap, in the order of play.
create or replace function waffle._make_json_events(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = waffle, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',     e.id,
           'userId', e.user_id,
           'swaps',  jsonb_build_array(
                       jsonb_build_object('id', e.pos_a::text, 'letter', e.letter_a),
                       jsonb_build_object('id', e.pos_b::text, 'letter', e.letter_b)),
           'colors', e.colors,
           'at',     e.created_at) order by e.id), '[]'::jsonb)
    from waffle.events e
   where e.game_id = p_game_id;
$$;

revoke execute on function waffle._make_json_events(uuid) from public;

-- A board as the page draws it: its tiles, colored against the solution.
create or replace function waffle._make_json_board(p_board text, p_solution text)
returns jsonb
language sql
immutable
set search_path = waffle, common, public, extensions
as $$
  select jsonb_build_object(
           'tiles', waffle._make_json_tiles(p_board, waffle._board_colors(p_board, p_solution)));
$$;

revoke execute on function waffle._make_json_board(text, text) from public;

-- The team's count: the swaps summed over every row. Each row holds its
-- player's own count, so the sum counts every swap once. Null in compete,
-- where there is no team.
create or replace function waffle._make_json_team_counts(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = waffle, common, public, extensions
as $$
  select case when cg.mode = 'coop' then jsonb_build_object(
           'nSwapsUsed', (select sum(n_swaps_used) from waffle.players where game_id = p_game_id))
         end
    from common.games cg
   where cg.id = p_game_id;
$$;

revoke execute on function waffle._make_json_team_counts(uuid) from public;

-- The team's facts, sent once: its count, the budget, and the one board, read
-- off any coop row since every row holds it in lock-step. Null in compete,
-- where there is no team (docs/common-schema.md → A player's facts).
create or replace function waffle._make_json_team(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = waffle, common, public, extensions
as $$
  select waffle._make_json_team_counts(p_game_id) || jsonb_build_object(
           'maxSwaps', wg.max_swaps,
           'board',    (select waffle._make_json_board(wp.board, wg.solution)
                          from waffle.players wp
                         where wp.game_id = p_game_id
                         order by wp.user_id
                         limit 1))
    from waffle.games wg
    join common.games cg on cg.id = wg.game_id
   where wg.game_id = p_game_id
     and cg.mode = 'coop';
$$;

revoke execute on function waffle._make_json_team(uuid) from public;

-- Every player as waffle's game_data shows them: the common player, with
-- their own facts — the budget, their count, and in compete their board.
create or replace function waffle._make_json_players(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = waffle, common, public, extensions
as $$
  select jsonb_agg(
           cp.player || jsonb_build_object(
             'maxSwaps',   wg.max_swaps,
             'nSwapsUsed', wp.n_swaps_used,
             -- Coop's one board is sent once, in `team`.
             'board',      case when cg.mode = 'compete'
                             then waffle._make_json_board(wp.board, wg.solution) end)
           order by cp.ord)
    from common._make_json_players(p_game_id) cp
    join waffle.players wp on wp.game_id = p_game_id and wp.user_id = cp.id
    join waffle.games wg on wg.game_id = p_game_id
    join common.games cg on cg.id = p_game_id;
$$;

revoke execute on function waffle._make_json_players(uuid) from public;

-- The whole game_data blob: the common part, with waffle's puzzle, team, log
-- and players on top.
create or replace function waffle._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = waffle, common, public, extensions
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'puzzle',  waffle._make_json_puzzle(wg, cg.ended_at is not null),
           'team',    waffle._make_json_team(p_game_id),
           'events',  waffle._make_json_events(p_game_id),
           'players', waffle._make_json_players(p_game_id))
    from waffle.games wg
    join common.games cg on cg.id = wg.game_id
   where wg.game_id = p_game_id;
$$;

revoke execute on function waffle._make_json_game_data(uuid) from public;

-- The whole static_game_data blob: the common part, with the deal on top — its
-- tiles as dealt and its par. Nothing in it changes after create_game.
create or replace function waffle._make_json_static_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = waffle, common, public, extensions
as $$
  select common._make_json_static_game_data(p_game_id) || jsonb_build_object(
           'puzzle', jsonb_build_object(
             'dealtTiles', waffle._make_json_tiles(wg.board_at_setup, null),
             'parSwaps',   wg.par_swaps))
    from waffle.games wg
   where wg.game_id = p_game_id;
$$;

revoke execute on function waffle._make_json_static_game_data(uuid) from public;

-- The game summed up: the numbers a list of games shows for this one.
create or replace function waffle._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
set search_path = waffle, common, public, extensions
as $$
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
    'team',         waffle._make_json_team_counts(p_game_id),
    'maxSwaps',     wg.max_swaps,
    'band',         coalesce((cg.setup->>'difficulty')::int, 2),
    'nWinnerSwaps', case when cg.mode = 'compete' then
                      (select wp.n_swaps_used
                         from common.game_players gp
                         join waffle.players wp
                           on wp.game_id = gp.game_id and wp.user_id = gp.user_id
                        where gp.game_id = p_game_id and gp.final_ranking = 1
                        order by gp.solved_at
                        limit 1)
                    end)
    from waffle.games wg
    join common.games cg on cg.id = wg.game_id
   where wg.game_id = p_game_id;
$$;

revoke execute on function waffle._make_json_summary_data(uuid, timestamptz) from public;

-- ============================================================
-- waffle._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Rebuilds the page blobs (`game_data`, `summary_data`, and `shell_data`
-- through `common._make_json_shell_data`) from waffle's own tables, assigning
-- each whole. Every RPC calls it after a move, after `_sync_title`, so the
-- blobs carry the title the move left; it is also the repair for one game by
-- hand. Every key is always present, null when it has no value; the shapes
-- are drawn above.
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function waffle._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = waffle._make_json_game_data(p_game_id),
         summary_data = waffle._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;

revoke execute on function waffle._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- waffle._write_static_game_data — one game's static blob, written
-- ============================================================
-- Writes `static_game_data`, which nothing after create changes, so no move
-- writes it: `create_game` calls this once, and `_rebuild_data_cols_for_all`
-- for a shape change.
create or replace function waffle._write_static_game_data(p_game_id uuid)
returns void
language sql
security definer
set search_path = waffle, common, public, extensions
as $$
  update common.games
     set static_game_data = waffle._make_json_static_game_data(p_game_id)
   where id = p_game_id;
$$;

revoke execute on function waffle._write_static_game_data(uuid) from public;

-- ============================================================
-- waffle._rebuild_data_cols_for_all — every waffle game's, rebuilt
-- ============================================================
-- For a shape change, or a game created before its builder knew the blobs:
-- `_write_static_game_data` and `_rebuild_data_cols` over every waffle game
-- without re-dating any, and answers how many it rewrote. Run by hand as
-- postgres (`gmake db-psql`); no client calls it, so it has no grant and wears
-- the `_`.
create or replace function waffle._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype in ('waffle_coop', 'waffle_compete')
  loop
    perform waffle._write_static_game_data(v_game_id);
    perform waffle._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function waffle._rebuild_data_cols_for_all() from public;

drop function if exists waffle.create_game(text, jsonb, uuid[], text, jsonb);

-- ============================================================
-- waffle.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)
-- ============================================================
-- Starts a game on `p_board`, the freshly-built puzzle from the
-- waffle-build-board edge function:
--   { "solution": 25-char, "dealt": 25-char, "par_swaps": int }
-- We store it (the game is self-contained; the dealt board is
-- `board_at_setup`) and seed one players row per player on the dealt board.
-- Board CONTENT is taken at face value (we don't re-derive par in SQL —
-- that's why generation is an edge function); we sanity-check structure.
-- The game title starts as a placeholder and is rewritten from play (see
-- waffle._sync_title). `p_mode` ('coop' | 'compete') routes the gametype
-- string and the working-state semantics.
--
-- Setup shape (server validates):
--   { "difficulty": 1..6,                        -- vocab band (UI offers a subset)
--     "extra_swaps": int (0..15, default 5),     -- budget = par + this
--     "timer": (none | countup | countdown{seconds}) }
create or replace function waffle.create_game(
  p_club_handle     text,
  p_setup           jsonb,
  p_player_user_ids uuid[],
  p_mode            text,
  p_board           jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  new_id       uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  s_extra      int;
  s_difficulty int;
  b_solution   text;
  b_dealt      text;
  b_par        int;
  budget       int;
  game_title   text;
  first_turn   uuid;
begin
  perform common._require_club_member(p_club_handle);
  -- Must agree with numberOfPlayers in src/waffle/manifest.ts ([1,6]).
  perform common._require_player_count_max(p_player_user_ids, 6);

  perform common._require_valid_mode(p_mode);

  -- ─── Validate setup.extra_swaps (the swap-budget knob) ───
  s_extra := coalesce((p_setup->>'extra_swaps')::int, 5);
  if s_extra < 0 or s_extra > 15 then
    raise exception 'BUG: swap budget of %', s_extra
      using errcode = 'PN104', hint = 'fault', column = '_',
      detail = 'setup.extra_swaps must be 0..15';
  end if;

  -- ─── Validate setup.difficulty (the vocab band) ──────────
  -- The server accepts the FULL band range 1..6 (all word-list levels
  -- exist); which bands the setup dialog actually OFFERS is a FE/UI
  -- choice (today 1..5 — see DIFFICULTY_OPTIONS), changeable without a
  -- DB change since boards are generated on demand per band.
  s_difficulty := coalesce((p_setup->>'difficulty')::int, 2);
  if s_difficulty not between 1 and 6 then
    raise exception 'BUG: word difficulty of %', s_difficulty
      using errcode = 'PN105', hint = 'fault', column = '_',
      detail = 'setup.difficulty must be 1..6';
  end if;

  perform common._require_valid_timer(p_setup->'timer');

  -- ─── Validate the passed board (structure, not content) ──────
  b_solution := p_board->>'solution';
  b_dealt    := p_board->>'dealt';
  b_par      := (p_board->>'par_swaps')::int;
  if b_solution is null or length(b_solution) <> 25
     or b_dealt is null or length(b_dealt) <> 25 then
    raise exception 'BUG: generated board was not a pair of 25-square grids'
      using errcode = 'PN106', hint = 'fault', column = '_',
      detail = 'board.solution and board.dealt must both be 25-char strings';
  end if;
  if b_par is null or b_par < 1 then
    raise exception 'BUG: generated board arrived with a par of %', b_par
      using errcode = 'PN107', hint = 'fault', column = '_',
      detail = 'board.par_swaps must be a positive int';
  end if;
  -- Holes ('.') at the four interior cells (1-based 7, 9, 17, 19).
  if substr(b_solution, 7, 1) <> '.' or substr(b_solution, 9, 1) <> '.'
     or substr(b_solution, 17, 1) <> '.' or substr(b_solution, 19, 1) <> '.' then
    raise exception 'BUG: generated board had its holes in the wrong squares'
      using errcode = 'PN108', hint = 'fault', column = '_',
      detail = 'board.solution holes must sit at 7/9/17/19';
  end if;
  -- Integrity: the dealt board is a rearrangement of the solution (same
  -- letters), so it's solvable by swaps alone.
  if (select array_agg(c order by c)
        from regexp_split_to_table(b_solution, '') c)
     is distinct from
     (select array_agg(c order by c)
        from regexp_split_to_table(b_dealt, '') c) then
    raise exception 'BUG: generated board could not be solved by swapping'
      using errcode = 'PN109', hint = 'fault', column = '_',
      detail = 'board.dealt must be a permutation of board.solution';
  end if;

  budget := b_par + s_extra;

  -- Game title: a placeholder that play rewrites — see waffle._sync_title for
  -- the two modes' formulas. Coop starts at the app-wide 'New game'; compete
  -- says 'New compete' because it KEEPS the placeholder for the whole race
  -- (its words can't be shown until the end), so the label may as well say
  -- which kind of game is sitting there.
  game_title := case p_mode when 'coop' then 'New game' else 'New compete' end;

  new_id := common._create_game(
    p_club_handle, 'waffle_' || p_mode, p_mode, p_player_user_ids, game_title, p_setup,
    -- The saved default strips first_turn_user_id (per-game "who goes first"
    -- pick, not a per-club preference; coop_style rides).
    p_setup - 'first_turn_user_id'
  );

  -- Opt-in turn-by-turn coop: when setup.coop_style='turns', seat the common
  -- rotation so submit_swap gates each swap. Free-for-all / compete leave the
  -- pointer null. Runs after common._create_game seeds game_players.
  if p_mode = 'coop' and p_setup->>'coop_style' = 'turns' then
    first_turn := (p_setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(p_player_user_ids)) then
      raise exception 'BUG: first player who is not in the game'
        using errcode = 'PN110', hint = 'fault', column = '_',
      detail = 'setup.first_turn_user_id must be one of the players';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  insert into waffle.games
    (game_id, board_at_setup, par_swaps, max_swaps, solution)
  values
    (new_id, b_dealt, b_par, budget, b_solution);

  insert into waffle.players (game_id, user_id, board)
  select new_id, uid, b_dealt
    from unnest(p_player_user_ids) uid;

  perform waffle._write_static_game_data(new_id);
  perform waffle._rebuild_data_cols(new_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; `id` is the game to go to. It travels through
  -- `waffle-build-board` untouched — `invokeCreateGame` forwards this envelope
  -- verbatim — so naming it here is what gives BOTH call sites a case to assert.
  return common._ok_envelope(jsonb_build_object('result', 'created', 'id', new_id));

-- The boundary. It reads the SQLSTATE, re-raises anything that isn't ours, and
-- lets the raise itself carry the message, the kind and the field.
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function waffle.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function waffle.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

drop function if exists waffle._finish_compete(uuid, text, text, uuid);

-- ============================================================
-- waffle._finish_compete — end a compete game, whatever ended it
-- ============================================================
-- The ONE place a race's ending is ranked. Two callers pass the act that
-- ended it — _maybe_finish_compete the last racer's (a solve, a spent
-- budget, a concession), submit_timeout the timer — and neither ranks
-- anything itself.
--
-- The ranking (docs/win-lose.md → final-ranking): every player who solved,
-- by fewest swaps, then earliest solve; ties on both share a ranking. A
-- player who didn't solve — out of swaps, conceded, or still going at the
-- timeout — is unranked. Nobody solved is a collective loss.
create or replace function waffle._finish_compete(
  p_game_id uuid,
  p_reason text,
  p_reason_detail text,
  p_ended_by_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  v_rankings jsonb;
begin
  select coalesce(jsonb_object_agg(user_id::text, ranking), '{}'::jsonb)
    into v_rankings
    from (
      select gp.user_id,
             rank() over (order by wp.n_swaps_used, gp.solved_at) as ranking
        from waffle.players wp
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

revoke execute on function waffle._finish_compete(uuid, text, text, uuid) from public;

drop function if exists waffle._maybe_finish_compete(uuid);

-- ============================================================
-- waffle._maybe_finish_compete — end the compete game if it's over
-- ============================================================
-- A compete game ends when NO player is still racing — every one has ended,
-- by solving, running out of swaps, or conceding. Shared by submit_swap (a
-- swap can be the last move) and waffle.concede (a drop-out can be, if
-- everyone else already finished). The act passed is the last racer's, and
-- becomes the game's reason (plans/common-tables.md → The game's reason is
-- the act that ended the game). Everyone conceding is `common._concede`'s
-- ending, so this skips a game that has already ended.
--
-- Returns true when it ended the game.
create or replace function waffle._maybe_finish_compete(
  p_game_id uuid,
  p_reason text,
  p_reason_detail text,
  p_ended_by_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = waffle, common, public, extensions
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

  perform waffle._finish_compete(p_game_id, p_reason, p_reason_detail, p_ended_by_user_id);
  return true;
end;
$$;

revoke execute on function waffle._maybe_finish_compete(uuid, text, text, uuid) from public;

drop function if exists waffle.submit_swap(uuid, int, int);

-- ============================================================
-- waffle.submit_swap — the core move
-- ============================================================
-- Swap the letters of two filled cells. Returns the resulting per-
-- tile colors + the new swap count + whether the board is solved +
-- whether the game just ended.
--
-- The endings it can reach: coop solves (`reached_goal`/'solved', the team
-- ranked 1) or runs out (`resource_exhausted`/'exhausted'); a compete swap
-- that solves or spends the caller's last swap ends that player, and ends
-- the race if nobody is left racing.
--
-- The `for update` lock on the games row serializes concurrent coop
-- swaps (two friends swapping at once): the second waits, then reads
-- the first's committed board. The working board lives in
-- waffle.players, so the games-row lock is purely the mutex.
create or replace function waffle.submit_swap(
  p_game_id uuid,
  p_pos_a   int,
  p_pos_b   int
)
returns jsonb
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  caller_id          uuid;
  g_row              waffle.games%rowtype;
  v_mode             text;
  v_ended_at         timestamptz;
  cur_board          char(25);
  cur_swaps          int;
  cur_solved         boolean;
  a1                 int;
  b1                 int;
  new_board          char(25);
  new_swaps          int;
  did_solve          boolean;
  out_game_ended     boolean := false;
  v_rankings         jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row first, before the membership gate: a friend deleting the game
  -- takes every membership with it (docs/envelopes.md → a missing game row
  -- is PN485).
  select * into g_row from waffle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('waffle');
  end if;

  caller_id := common._require_game_player(p_game_id);

  select ended_at, mode into v_ended_at, v_mode
    from common.games where id = p_game_id;
  if v_ended_at is not null then
    -- A race: a teammate ended it, or the timer ran out, while this swap was
    -- in flight.
    perform common._raise_game_over();
  end if;

  -- A conceded player is out of the race — no more swaps. The FE hides the
  -- board from a conceder, so this only fires on a race (a swap in flight
  -- when the concession commits, or a stale second tab).
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  -- Turn-order gate (opt-in turn-by-turn coop). No-op for free-for-all
  -- (pointer null) and compete; raises 'not your turn' otherwise. All the
  -- swap soft-rejects below `raise` (rolling back), so a rejected swap never
  -- advances; the accepted coop branch advances only when the game goes on.
  perform common._require_turn(p_game_id, caller_id);

  -- ─── Validate the two positions ──────────────────────────
  if p_pos_a is null or p_pos_b is null or p_pos_a = p_pos_b
     or p_pos_a < 0 or p_pos_a > 24 or p_pos_b < 0 or p_pos_b > 24 then
    raise exception 'BUG: swap of one square with itself'
      using errcode = 'PN263', hint = 'fault', column = '_',
      detail = format('swap needs two distinct cells in 0..24; got %s and %s',
                      coalesce(p_pos_a::text, 'null'), coalesce(p_pos_b::text, 'null'));
  end if;
  if p_pos_a in (6, 8, 16, 18) or p_pos_b in (6, 8, 16, 18) then
    raise exception 'BUG: swap of an empty square'
      using errcode = 'PN264', hint = 'fault', column = '_',
      detail = 'cells 7/9/17/19 are holes and hold no tile';
  end if;

  -- The caller's working board (coop boards are identical; compete is the
  -- caller's own), and the swaps already spent against the budget: the
  -- team's, summed over every player's own, in coop; the caller's in compete.
  select board into cur_board
    from waffle.players
   where game_id = p_game_id and user_id = caller_id;
  select sum(n_swaps_used) into cur_swaps
    from waffle.players
   where game_id = p_game_id and (v_mode = 'coop' or user_id = caller_id);
  select solved_at is not null into cur_solved
    from common.game_players
   where game_id = p_game_id and user_id = caller_id;
  -- A solved player is locked (matters in compete, where the game
  -- continues for others after one player solves).
  if cur_solved then
    -- A fault in both modes. COOP: solving ENDS the game, so a later swap meets
    -- the ended check above and reads "Game over" — unreachable here.
    -- COMPETE: it is the caller's own row, on a board that stays theirs.
    raise exception 'Already solved'
      using errcode = 'PN265', hint = 'fault', column = '_',
      detail = 'this player has already solved the grid';
  end if;
  if cur_swaps >= g_row.max_swaps then
    -- Compete-only in practice, and a fault for the same reason: spending the
    -- last COOP swap ends the game, so a coop player who swaps again reads
    -- "Game over". Only compete keeps playing with a spent player at the table.
    raise exception 'No swaps left'
      using errcode = 'PN266', hint = 'fault', column = '_',
      detail = 'the swap budget for this player is spent';
  end if;

  -- Apply the swap (overlay/substr are 1-based). Both placements use
  -- the ORIGINAL board so the two cells exchange cleanly.
  a1 := p_pos_a + 1;
  b1 := p_pos_b + 1;
  new_board := overlay(cur_board placing substr(cur_board, b1, 1) from a1 for 1);
  new_board := overlay(new_board placing substr(cur_board, a1, 1) from b1 for 1);
  new_swaps := cur_swaps + 1;
  did_solve := (new_board = g_row.solution);

  -- Append to the move log, in BOTH modes. The letters come from the
  -- PRE-swap board so the entry is self-contained. Compete's rows are
  -- RLS-private until the game ends; see the events_select policy for why
  -- that's load-bearing.
  --
  -- A swap is the only move this game has and only an accepted one is written,
  -- so `took_turn` is a literal — the solving swap and the last one included.
  -- The caller's own count lives on waffle.players.n_swaps_used.
  --
  -- `colors` is the board AFTER this swap. Stored rather than left to the
  -- reader because the only other way to know it is to replay the log against
  -- the solution, which is what made the browser need the answer mid-game.
  -- wordle stores its per-guess colors the same way.
  insert into waffle.events
    (game_id, user_id, kind, pos_a, pos_b, letter_a, letter_b, took_turn, colors)
  values
    (p_game_id, caller_id, 'swap', p_pos_a, p_pos_b,
     substr(cur_board, a1, 1), substr(cur_board, b1, 1), true,
     waffle._board_colors(new_board, g_row.solution));

  if v_mode = 'coop' then
    -- Lock-step board: every player's row mirrors the shared board. The count
    -- is each player's own, so only the swapper's goes up; the team's is the
    -- sum (`new_swaps`).
    update waffle.players
       set board = new_board
     where game_id = p_game_id;
    update waffle.players
       set n_swaps_used = n_swaps_used + 1
     where game_id = p_game_id and user_id = caller_id;

    if did_solve then
      -- The team solves, so every teammate solved at this swap.
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
    elsif new_swaps >= g_row.max_swaps then
      perform common._end_game(
        p_game_id, 'resource_exhausted', 'exhausted', caller_id,
        p_is_no_result => false,
        p_final_rankings => '{}'::jsonb
      );
      out_game_ended := true;
    else
      -- Turn-order: an accepted coop swap that didn't end the game hands the
      -- turn to the next player (no-op for free-for-all).
      perform common._advance_turn(p_game_id);
    end if;
  else
    -- Compete: apply the swap to the caller's own row only.
    update waffle.players
       set board        = new_board,
           n_swaps_used = new_swaps
     where game_id = p_game_id and user_id = caller_id;

    -- Solved, or out of swaps: either way this racer has ended while the
    -- others play their boards out, so the common roster has to hear about it
    -- — a player nothing is waiting for must not hold the presence-pause open.
    if did_solve then
      update common.game_players
         set solved_at = now()
       where game_id = p_game_id and user_id = caller_id;
      -- `neutral`: fewer swaps may yet beat it (`announce-when-ended`).
      perform common._set_player_ended(p_game_id, caller_id, 'reached_goal', 'solved', 'neutral');
      out_game_ended := waffle._maybe_finish_compete(p_game_id, 'reached_goal', 'solved', caller_id);
    elsif new_swaps >= g_row.max_swaps then
      -- Eliminated: `lost` at once (`loses-by-move-budget`).
      perform common._set_player_ended(p_game_id, caller_id, 'resource_exhausted', 'exhausted', 'lost');
      out_game_ended := waffle._maybe_finish_compete(p_game_id, 'resource_exhausted', 'exhausted', caller_id);
    end if;
  end if;

  -- Club-list title: coop now reads the words this swap got right; a compete
  -- race that just ended now reads the puzzle's words. Runs after the endings
  -- so it sees the settled `ended_at`.
  perform waffle._sync_title(p_game_id);
  perform waffle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  -- No outcome and no message: an accepted swap shows the swapper NOTHING until
  -- the colors reach everyone together in the next game_data blob (see
  -- `useSubmitSwap` on why the reply is deliberately ignored). The payload
  -- still travels — the fact is structural whether or not anyone reads it.
  --
  -- `result` NAMES the answer, and it is the one field the call site DOES read:
  -- everything beside it is ignored on purpose, so without a name the branch
  -- would match by being `ok` and would draw a second answer as this one.
  return common._ok_envelope(
    jsonb_build_object(
      'result',       'swapped',
      'colors',       waffle._board_colors(new_board, g_row.solution),
      'n_swaps_used', new_swaps,
      'solved',       did_solve,
      'game_ended',   out_game_ended
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

revoke execute on function waffle.submit_swap(uuid, int, int) from public;
grant execute on function waffle.submit_swap(uuid, int, int) to authenticated;

drop function if exists waffle.concede(uuid);

-- ============================================================
-- waffle.concede — a racer drops out of a compete game
-- ============================================================
-- waffle is an ELIMINATION game (a player can be done — solved or out of
-- swaps — without the table ending): `common._concede` records the
-- concession and ends the game if everyone has conceded; otherwise the race
-- ends here if every other racer has already solved or run out, with the
-- concession as the act that ended it. A conceder never wins. Compete only
-- (coop ends via the shared Stop).
create or replace function waffle.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  caller_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Lock this game's waffle.games row FIRST so the concession serializes
  -- against a concurrent submit_swap (which also locks this row before
  -- common.games). Without it the two don't serialize, each reads the other's
  -- uncommitted "still racing" state (READ COMMITTED), both decline to end the
  -- game, and it wedges. Same lock order as the move path (no deadlock).
  perform 1 from waffle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('waffle');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  caller_id := common._concede(p_game_id);
  perform waffle._maybe_finish_compete(p_game_id, 'conceded', 'conceded', caller_id);
  -- A concede can be the move that empties the racing set, ending the game —
  -- in which case the title becomes the puzzle's words.
  perform waffle._sync_title(p_game_id);

  perform waffle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function waffle.concede(uuid) from public;
grant execute on function waffle.concede(uuid) to authenticated;

drop function if exists waffle.submit_timeout(uuid);

-- ============================================================
-- waffle.submit_timeout — countdown-timer expiry
-- ============================================================
-- Called by the FE (every player races to fire it) when a countdown hits 0;
-- a second call finds the game ended and answers the game-over race. Coop:
-- the shared board wasn't solved → lost, nobody ranked. Compete: the race
-- ends as it stands, ranking whoever had solved (_finish_compete's rule).
-- Who ended it is the turn-holder in turn-order coop, nobody otherwise.
create or replace function waffle.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  v_mode        text;
  v_ended_at    timestamptz;
  v_turn_holder uuid;
begin
  perform 1 from waffle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('waffle');
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
    perform waffle._finish_compete(p_game_id, 'timeout', 'timeout', null);
  end if;

  -- The game is over either way — a compete title stops saying "New compete".
  perform waffle._sync_title(p_game_id);

  perform waffle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function waffle.submit_timeout(uuid) from public;
grant execute on function waffle.submit_timeout(uuid) to authenticated;

drop function if exists waffle.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists waffle.end_game(uuid);

-- ============================================================
-- waffle.stop_game — the Stop
-- ============================================================
-- Any player stops the game for the whole table, in either mode. It is
-- neutral: nobody won, nobody lost (docs/common-schema.md → Stop). Distinct
-- from suspending, which leaves the game being played and goes back to the
-- club page; a Stopped game lands in the club's finished games.
create or replace function waffle.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a Stop racing the winning move waits for it and then reads the
  -- game as over (docs/common-schema.md → Stop, step 1).
  perform 1 from waffle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('waffle');
  end if;

  perform common._stop(p_game_id);

  -- The game has ended, so a compete title stops saying "New compete".
  perform waffle._sync_title(p_game_id);

  perform waffle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function waffle.stop_game(uuid) from public;
grant execute on function waffle.stop_game(uuid) to authenticated;

drop function if exists waffle.replay_board(uuid);

-- ============================================================
-- waffle.replay_board — restart this board from scratch
-- ============================================================
-- The "Replay board" game-menu item: reset the working state to the dealt
-- board on the SAME game row. The frozen puzzle (solution / board_at_setup /
-- par / max_swaps) stays; everything the players did is wiped. Any game
-- player may call it, from a finished game OR mid-game (no ended check —
-- it's a restart). Both modes reset ALL players (a group "run it back", per
-- the friends trust model).
--
-- Resets the waffle-specific working state (every player's board → the
-- dealt board, swaps zeroed; the swap log cleared), then hands the
-- common-layer reset to common._reset_game (the ending, each player's
-- ending, solve and result).
create or replace function waffle.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  g_row waffle.games;
begin
  -- FOR UPDATE: a replay racing a move must not interleave with it (the move
  -- RPCs lock the same row), or the reset could land on a half-applied move —
  -- a stray log row in the "fresh" game, or worse, an in-flight game-ENDING
  -- move ending the board that was just reset.
  select * into g_row from waffle.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('waffle');
  end if;

  -- The row check comes BEFORE the membership gate, and the order is the whole
  -- point: `delete_game` takes this row, `common.games` and every
  -- `game_players` row together, so a caller whose game was just deleted has no
  -- membership left either. Gate-first told them "You are not in this game",
  -- which is both wrong and unhelpful — they WERE in it; it is gone.
  perform common._require_game_player(p_game_id);

  update waffle.players
     set board = g_row.board_at_setup,
         n_swaps_used = 0
   where game_id = p_game_id;

  delete from waffle.events where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  -- Back to the placeholder: every board is the dealt board again (no word is
  -- correct) and reset_game cleared the ending, so the title must stop
  -- advertising words the players no longer have.
  perform waffle._sync_title(p_game_id);

  perform waffle._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function waffle.replay_board(uuid) from public;
grant execute on function waffle.replay_board(uuid) to authenticated;
