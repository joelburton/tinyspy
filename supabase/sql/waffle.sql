-- ============================================================
-- waffle — the REPEATABLE half
-- ============================================================
-- Functions, views, RLS policies, triggers and grants for waffle. Everything
-- here is drop-and-recreate safe, so this file is **re-applied in full on
-- every deploy** (`gmake db-sql`) — it is the CURRENT definition, not a
-- delta. Edit it in place forever; it never becomes a migration.
--
-- Its other half is the one-shot schema migration
-- `supabase/migrations/20260624000000_waffle.sql` — tables, constraints, indexes,
-- the Realtime publication and seed rows. That one is applied once and then
-- frozen, because `alter table` cannot be re-run.
--
-- Order is load-bearing: a policy can only reference a function that already
-- exists, so statements stay in the order they were written. See
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema waffle to authenticated;

-- ============================================================
-- Board representation
-- ============================================================
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

-- ============================================================
-- Wordle coloring moved to common.wordle_colors
-- ============================================================
-- The per-word green/yellow/gray algorithm now lives once in
-- common.wordle_colors (shared with wordle). board_colors calls it per word.

-- ============================================================
-- waffle.board_colors — color a whole board against the solution
-- ============================================================
-- Pure function of (board, solution): both 25-char strings. Colors
-- each of the 6 words independently with common.wordle_colors, then merges
-- per cell — an intersection cell (in two words) shows the STRONGER
-- of its two colors (green > yellow > gray). Holes stay '.'.
--
-- This is the single source of truth for feedback; submit_swap will
-- return it and the read-view will expose it, both reading the hidden
-- solution server-side so the FE never holds the answer.
create or replace function waffle.board_colors(board text, solution text)
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

    wc := common.wordle_colors(bw, sw);

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
revoke execute on function waffle.board_colors(text, text) from public;

-- Column-level grant: everything EXCEPT `solution`. The presence of
-- any column grant flips the table from "all columns visible" to
-- "only granted columns," so we enumerate the safe ones. games_state
-- exposes the solution conditionally via a SECURITY DEFINER helper.
grant select
  (id, club_handle, mode, scramble, par_swaps, max_swaps, created_at)
  on waffle.games to authenticated;
-- Read gating: any club member can read any of the club's games
-- (viewing is club-gated; acting is player-gated in the RPCs).
drop policy if exists games_select on waffle.games;
create policy games_select on waffle.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Column grant EXCLUDING `board`: in compete you race independently, so
-- an opponent's board (and the deductions it reveals) is hidden until
-- the game ends. players_state exposes the board conditionally via a
-- SECURITY DEFINER helper; swaps_used / solved stay visible (the
-- opponent-progress strip). In coop the board is shared, so the helper
-- shows it to everyone.
grant select (game_id, user_id, swaps_used, solved, solved_at)
  on waffle.players to authenticated;
-- Row visibility is club-member-wide (you can see that an opponent
-- row exists, with its swaps_used / solved). The board column-hiding
-- above is what keeps the opponent's actual tiles private mid-compete.
drop policy if exists players_select on waffle.players;
create policy players_select on waffle.players
  for select to authenticated
  using (
    exists (
      select 1 from waffle.games g
       where g.id = players.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- No hidden columns (coop board is shared), so the FE reads the table
-- directly rather than through a security_invoker view.
grant select on waffle.swaps to authenticated;
-- Swaps: mode-aware, mirroring the board's own visibility.
--   coop    — one shared board, so the log is shared too.
--   compete — DURING PLAY you see only your own; at terminal everyone's open.
--
-- This is not politeness, and not anti-cheat either: every compete player
-- solves the SAME puzzle from the same scramble, and a swap carries both
-- positions and both letters — so replaying an opponent's log reconstructs
-- their board exactly, and their green tiles ARE correct letter positions.
-- A club-wide log would hand the answer to an honest player just reading it.
-- Same reason `_board_visible` hides the board itself; these two must agree,
-- or the weaker one decides.
drop policy if exists swaps_select on waffle.swaps;
create policy swaps_select on waffle.swaps
  for select to authenticated
  using (
    exists (
      select 1 from waffle.games g
       join common.games cg on cg.id = g.id
       where g.id = swaps.game_id
         and common.is_club_member(g.club_handle)
         and (g.mode = 'coop' or swaps.user_id = (select auth.uid()) or cg.is_terminal)
    )
  );

-- ============================================================
-- Hidden-answer helpers (SECURITY DEFINER) + read views
-- ============================================================
-- _solution_for reveals the solution only once the game is terminal
-- (the end-of-game reveal). _player_board_for / _player_colors_for
-- return a player's board + its color feedback, but only when the
-- caller is allowed to see that board: it's their OWN row, or the
-- game is coop (shared board), or the game is over. Otherwise they
-- return NULL — that's how a compete opponent's tiles stay hidden
-- mid-game. All run as definer so they can read the grant-hidden
-- `board` / `solution` columns; the security_invoker views call them
-- as the caller (so auth.uid() is the real caller), and base-table
-- RLS still gates which rows the caller sees.

create or replace function waffle._solution_for(g_id uuid)
returns text
language sql
stable
security definer
set search_path = waffle, common, public, extensions
as $$
  -- COOP exposes the solution during play: it's a collaborative solve, and the
  -- turn-history viewer recomputes each past board's colors on the FE, which needs
  -- the answer (colors are a pure function of board+solution). Per the trust model
  -- (server-authoritative for cleanliness, NOT anti-cheat) a friend who peeks at the
  -- shared answer just spoils their own puzzle — not worth gating against.
  -- COMPETE keeps it hidden until terminal: players race on independent boards, and
  -- compete writes no swap log, so there's no history feature that needs it there.
  select case when cg.is_terminal or wg.mode = 'coop' then wg.solution::text else null end
    from waffle.games wg
    join common.games cg on cg.id = wg.id
   where wg.id = g_id;
$$;

-- Visible iff the caller owns the row, or it's coop, or it's over.
create or replace function waffle._board_visible(wg waffle.games, cg common.games, row_user uuid)
returns boolean
language sql
stable                         -- auth.uid() is stable
as $$
  select row_user = auth.uid() or wg.mode = 'coop' or cg.is_terminal;
$$;
revoke execute on function waffle._board_visible(waffle.games, common.games, uuid) from public;

create or replace function waffle._player_board_for(g_id uuid, row_user uuid)
returns text
language sql
stable
security definer
set search_path = waffle, common, public, extensions
as $$
  select case when waffle._board_visible(wg, cg, row_user)
              then wp.board::text else null end
    from waffle.players wp
    join waffle.games wg on wg.id = wp.game_id
    join common.games cg on cg.id = wg.id
   where wp.game_id = g_id and wp.user_id = row_user;
$$;

create or replace function waffle._player_colors_for(g_id uuid, row_user uuid)
returns text
language sql
stable
security definer
set search_path = waffle, common, public, extensions
as $$
  select case when waffle._board_visible(wg, cg, row_user)
              then waffle.board_colors(wp.board, wg.solution) else null end
    from waffle.players wp
    join waffle.games wg on wg.id = wp.game_id
    join common.games cg on cg.id = wg.id
   where wp.game_id = g_id and wp.user_id = row_user;
$$;

revoke execute on function waffle._solution_for(uuid) from public;
revoke execute on function waffle._player_board_for(uuid, uuid) from public;
revoke execute on function waffle._player_colors_for(uuid, uuid) from public;
grant execute on function waffle._solution_for(uuid) to authenticated;
grant execute on function waffle._player_board_for(uuid, uuid) to authenticated;
grant execute on function waffle._player_colors_for(uuid, uuid) to authenticated;

-- ============================================================
-- Club-list title helpers
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

-- Recompute the club-list title from state. The title is a READOUT, not a
-- fixed name (the scrabble/stackdown pattern):
--
--   coop            → the correct words so far    "ARENA-EAGER-TOTEM"
--                     (falling back to "New game" before any word lands)
--   compete, mid-game → "New compete"
--   compete, terminal → the puzzle's own words    "ARENA-EAGER-TOTEM"
--
-- Coop shares one board, so its correct words are already on every screen —
-- surfacing them costs nothing. Compete does NOT get a mid-game readout: the
-- words ARE the solution, each racer has their own board, and the title is
-- club-wide readable — so a leader's progress would hand the trailing player
-- the answer. Compete waits for the terminal reveal, then names the game after
-- the puzzle it was.
--
-- Derived rather than assigned, so it's correct after ANY transition — a swap,
-- a timeout, a manual end, a give-up reveal, or a replay that rewinds the board
-- (which must un-tell the words). Every one of those calls this instead of
-- remembering its own formula.
create or replace function waffle._sync_title(g_id uuid)
returns void
language sql
security definer
set search_path = waffle, common, public, extensions
as $$
  update common.games cg
     set title = case
           when wg.mode = 'coop' then waffle._format_title(
             -- Any players row will do: coop rows are kept in lock-step.
             --
             -- The swaps_used gate keeps this a readout of what the players
             -- have DONE. A scramble can hand them a whole correct word for
             -- free, and naming an untouched game after it would be a lie —
             -- worse, a replayed board and a fresh board are in identical
             -- state, so they must read identically. A terminal game is
             -- exempt: its board is final, whatever the players did to it
             -- (a "reveal answer" writes the solution without a single swap).
             (select case when wp.swaps_used > 0 or cg.is_terminal
                          then waffle._correct_words(wp.board, wg.solution)
                          else '{}'::text[] end
                from waffle.players wp
               where wp.game_id = g_id limit 1),
             'New game')
           -- Terminal compete: the correct words on the FURTHEST player's own
           -- board — never the solution itself.
           --
           -- It used to read `_correct_words(wg.solution, wg.solution)`, i.e.
           -- the full six unconditionally, which spoiled a race nobody solved:
           -- waffle hides the answer on a loss so a Restart is a genuine second
           -- try, and the club-list title undid that from the outside where the
           -- board couldn't. (Fixed 2026-08-02, alongside the same bug in
           -- wordle._sync_title.)
           --
           -- One expression covers every ending, because a board is the
           -- evidence: a WINNER's board IS the solution, so a solved race still
           -- titles with all six; and an unsolved race names only what somebody
           -- actually got right — which is honest,
           -- since every board is visible at terminal anyway. The title can no
           -- longer name a word no player ever had.
           when cg.is_terminal then waffle._format_title(
             (select waffle._correct_words(wp.board, wg.solution)
                from waffle.players wp
               where wp.game_id = g_id
               order by coalesce(
                 array_length(waffle._correct_words(wp.board, wg.solution), 1), 0) desc
               limit 1),
             'New compete')
           else 'New compete'
         end
    from waffle.games wg
   where cg.id = g_id and wg.id = g_id;
$$;

revoke execute on function waffle._sync_title(uuid) from public;

drop view if exists waffle.games_state;
create view waffle.games_state with (security_invoker = true) as
  select wg.id,
         wg.club_handle,
         wg.mode,
         wg.scramble,
         wg.par_swaps,
         wg.max_swaps,
         wg.created_at,
         waffle._solution_for(wg.id) as solution   -- NULL until terminal
    from waffle.games wg;

drop view if exists waffle.players_state;
create view waffle.players_state with (security_invoker = true) as
  select wp.game_id,
         wp.user_id,
         wp.swaps_used,
         wp.solved,
         wp.solved_at,
         -- board/colors via the definer helpers — NULL for a compete
         -- opponent mid-game (the column grant hides wp.board directly).
         waffle._player_board_for(wp.game_id, wp.user_id)  as board,
         waffle._player_colors_for(wp.game_id, wp.user_id) as colors
    from waffle.players wp;

grant select on waffle.games_state to authenticated;
grant select on waffle.players_state to authenticated;

-- ============================================================
-- waffle.create_game — mode is a positional arg
-- ============================================================
-- Setup shape (server validates):
--   { "difficulty": 1..6,                        -- vocab band (UI offers a subset)
--     "extra_swaps": int (0..15, default 5),     -- budget = par + this
--     "timer": (none | countup | countdown{seconds}) }
-- `mode` ('coop' | 'compete') routes the gametype string and the
-- working-state semantics. `board` is the freshly-built puzzle from the
-- waffle-build-board edge function:
--   { "solution": 25-char, "scramble": 25-char, "par_swaps": int }
-- We store it (the game is self-contained) and seed one players row per
-- player (board = scramble). Board CONTENT is taken at face value (we
-- don't re-derive par in SQL — that's why generation is an edge
-- function); we sanity-check structure. The game title starts as a
-- placeholder and is rewritten from play (see waffle._sync_title).
create or replace function waffle.create_game(
  target_club     text,
  setup           jsonb,
  player_user_ids uuid[],
  mode            text,
  board           jsonb
)
returns table(id uuid)
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  new_id       uuid;
  s_extra      int;
  s_difficulty int;
  b_solution   text;
  b_scramble   text;
  b_par        int;
  budget       int;
  game_title   text;
  first_turn   uuid;
begin
  perform common.require_club_member(target_club);
  -- Must agree with numberOfPlayers in src/waffle/manifest.ts ([1,6]).
  perform common.require_player_count_max(player_user_ids, 6);

  perform common.require_valid_mode(mode);

  -- ─── Validate setup.extra_swaps (the swap-budget knob) ───
  s_extra := coalesce((setup->>'extra_swaps')::int, 5);
  if s_extra < 0 or s_extra > 15 then
    raise exception 'bad-extra-swaps|%|', s_extra
      using errcode = 'P0001',
      detail = 'setup.extra_swaps must be 0..15';
  end if;

  -- ─── Validate setup.difficulty (the vocab band) ──────────
  -- The server accepts the FULL band range 1..6 (all word-list levels
  -- exist); which bands the setup dialog actually OFFERS is a FE/UI
  -- choice (today 1..5 — see DIFFICULTY_OPTIONS), changeable without a
  -- DB change since boards are generated on demand per band.
  s_difficulty := coalesce((setup->>'difficulty')::int, 2);
  if s_difficulty not between 1 and 6 then
    raise exception 'bad-band|%|', s_difficulty
      using errcode = 'P0001',
      detail = 'setup.difficulty must be 1..6';
  end if;

  perform common.require_valid_timer(setup->'timer');

  -- ─── Validate the passed board (structure, not content) ──────
  b_solution := board->>'solution';
  b_scramble := board->>'scramble';
  b_par      := (board->>'par_swaps')::int;
  if b_solution is null or length(b_solution) <> 25
     or b_scramble is null or length(b_scramble) <> 25 then
    raise exception 'bad-board|'
      using errcode = 'P0001',
      detail = 'solution and scramble must both be 25-char strings';
  end if;
  if b_par is null or b_par < 1 then
    raise exception 'bad-par-swaps|%|', b_par
      using errcode = 'P0001',
      detail = 'board.par_swaps must be a positive int';
  end if;
  -- Holes ('.') at the four interior cells (1-based 7, 9, 17, 19).
  if substr(b_solution, 7, 1) <> '.' or substr(b_solution, 9, 1) <> '.'
     or substr(b_solution, 17, 1) <> '.' or substr(b_solution, 19, 1) <> '.' then
    raise exception 'bad-board-holes|'
      using errcode = 'P0001',
      detail = 'board.solution holes must sit at 7/9/17/19';
  end if;
  -- Integrity: the scramble is a rearrangement of the solution (same
  -- letters), so it's solvable by swaps alone.
  if (select array_agg(c order by c)
        from regexp_split_to_table(b_solution, '') c)
     is distinct from
     (select array_agg(c order by c)
        from regexp_split_to_table(b_scramble, '') c) then
    raise exception 'scramble-mismatch|'
      using errcode = 'P0001',
      detail = 'scramble must be a permutation of solution';
  end if;

  budget := b_par + s_extra;

  -- Game title: a placeholder that play rewrites — see waffle._sync_title for
  -- the two modes' formulas. Coop starts at the app-wide 'New game'; compete
  -- says 'New compete' because it KEEPS the placeholder for the whole race
  -- (its words can't be shown until the end), so the label may as well say
  -- which kind of game is sitting there.
  game_title := case mode when 'coop' then 'New game' else 'New compete' end;

  new_id := common.create_game(
    target_club, 'waffle_' || mode, player_user_ids, game_title, setup,
    -- saved_default strips first_turn_user_id (per-game "who goes first" pick,
    -- not a per-club preference; coop_style rides).
    setup - 'first_turn_user_id'
  );

  -- Opt-in turn-by-turn coop: when setup.coop_style='turns', seat the common
  -- rotation so submit_swap gates each swap. Free-for-all / compete leave the
  -- pointer null. Runs after common.create_game seeds game_players.
  if mode = 'coop' and setup->>'coop_style' = 'turns' then
    first_turn := (setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(player_user_ids)) then
      raise exception 'bad-first-turn|'
        using errcode = 'P0001',
      detail = 'setup.first_turn_user_id must be one of the players';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  insert into waffle.games
    (id, club_handle, mode, scramble, par_swaps, max_swaps, solution)
  values
    (new_id, target_club, mode, b_scramble, b_par, budget, b_solution);

  insert into waffle.players (game_id, user_id, board)
  select new_id, uid, b_scramble
    from unnest(player_user_ids) uid;

  -- The listing-label payload. The swap COUNTERS are coop-only: compete
  -- deliberately never updates them (a live count would leak how far along a
  -- racer is — see submit_swap), so seeding them there would leave a permanent
  -- 0 for a label to read as fact. Absent is honest; the label omits what
  -- isn't there.
  perform common.update_state(
    new_id,
    'playing',
    jsonb_build_object('mode', mode, 'solved', false)
      || case when mode = 'coop'
              then jsonb_build_object('max_swaps', budget, 'swaps_used', 0)
              else '{}'::jsonb
         end
  );

  return query select new_id;
end;
$$;

revoke execute on function waffle.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function waffle.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

-- ============================================================
-- waffle._maybe_finish_compete — end the compete game if it's over
-- ============================================================
-- A compete game ends when NO player is still racing — racing means not
-- conceded, not solved, swaps left. Shared by submit_swap (a swap can be
-- the last move) and waffle.concede (a drop-out can be, if everyone else
-- already finished). Winner = fewest swaps among solved, non-conceded
-- players (a drop-out forfeits). NULL if nobody eligible solved.
-- Returns true when it ended the game.
create or replace function waffle._maybe_finish_compete(target_game uuid)
returns boolean
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  winner_id      uuid;
  player_results jsonb;
  term_state     text;
  v_outcome      text;
  v_max          int;
begin
  select max_swaps into v_max from waffle.games where id = target_game;

  if exists (
    select 1
      from waffle.players wp
      join common.game_players gp
        on gp.game_id = wp.game_id and gp.user_id = wp.user_id
     where wp.game_id = target_game
       and not gp.conceded
       and not wp.solved
       and wp.swaps_used < v_max
  ) then
    return false;
  end if;

  select wp.user_id into winner_id
    from waffle.players wp
    join common.game_players gp
      on gp.game_id = wp.game_id and gp.user_id = wp.user_id
   where wp.game_id = target_game and wp.solved and not gp.conceded
   order by wp.swaps_used asc, wp.solved_at asc
   limit 1;

  select jsonb_object_agg(
           wp.user_id::text,
           jsonb_build_object(
             'won',    coalesce(wp.user_id = winner_id, false),
             'solved', wp.solved,
             'swaps',  wp.swaps_used
           )
         )
    into player_results
    from waffle.players wp
   where wp.game_id = target_game;

  term_state := case when winner_id is not null
                     then 'won_compete' else 'lost_compete' end;

  -- Why a no-winner race ended, for the club-list label. The two ways to get
  -- here look identical on the row otherwise, and read very differently to a
  -- player: everyone played their swaps out and nobody solved it, versus
  -- everyone walked away. 'conceded' only when EVERY player conceded — a
  -- mixed table (one quit, one ran out) is 'exhausted', because somebody did
  -- play it to the end.
  select case
           when winner_id is not null then 'solved'
           when not exists (select 1 from common.game_players gp
                             where gp.game_id = target_game and not gp.conceded)
             then 'conceded'
           else 'exhausted'
         end
    into v_outcome;

  perform common.end_game(
    target_game, term_state,
    jsonb_build_object('mode', 'compete', 'outcome', v_outcome,
                       'winner_user_id', winner_id,
                       'winner_username', (select username from common.profiles where user_id = winner_id),
                       -- The WINNER's own count — `swaps_used` in a compete
                       -- status is meaningless (each racer has their own board,
                       -- and a live count would leak their progress), so the
                       -- winning number is named separately at terminal.
                       'winner_swaps', (select wp.swaps_used from waffle.players wp
                                         where wp.game_id = target_game
                                           and wp.user_id = winner_id)),
    player_results
  );

  -- Realtime touch: common.end_game writes only common.games, so wake the
  -- waffle.* subscription to load the terminal reveal (solution +
  -- opponents' boards). submit_swap's terminal already writes waffle.players
  -- /swaps so it wakes on its own, but the concede path (waffle.concede →
  -- here) writes nothing to the waffle schema — without this, the reveal
  -- never appears for anyone. Same trick as submit_timeout / end_game.
  update waffle.games set club_handle = club_handle where id = target_game;
  return true;
end;
$$;

revoke execute on function waffle._maybe_finish_compete(uuid) from public;

-- ============================================================
-- waffle.submit_swap — the core move
-- ============================================================
-- Swap the letters of two filled cells. Returns the resulting per-
-- tile colors + the new swap count + whether the board is solved +
-- whether the game just terminated.
--
-- The `for update` lock on the games row serializes concurrent coop
-- swaps (two friends swapping at once): the second waits, then reads
-- the first's committed board. The working board lives in
-- waffle.players, so the games-row lock is purely the mutex.
create or replace function waffle.submit_swap(
  target_game uuid,
  pos_a       int,
  pos_b       int
)
returns jsonb
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  caller_id          uuid;
  g_row              waffle.games%rowtype;
  current_play_state text;
  p_board            char(25);
  p_swaps            int;
  p_solved           boolean;
  a1                 int;
  b1                 int;
  new_board          char(25);
  new_swaps          int;
  did_solve          boolean;
  out_terminal       boolean := false;
  term_state         text;
  player_results     jsonb;
begin
  caller_id := common.require_game_player(target_game);

  select * into g_row from waffle.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no waffle.games row for target_game';
  end if;

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game-not-in-play|'
      using errcode = 'P0001',
      detail = 'swaps require an active play_state';
  end if;

  -- A conceded player is out of the race — no more swaps. The FE gates
  -- on myConceded, so this only fires on a race (a swap in flight when
  -- concede commits, or a stale second tab).
  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you-conceded|' using errcode = 'P0001',
      detail = 'caller already dropped out of this compete race';
  end if;

  -- Turn-order gate (opt-in turn-by-turn coop). No-op for free-for-all
  -- (pointer null) and compete; raises 'not your turn' otherwise. All the
  -- swap soft-rejects below `raise` (rolling back), so a rejected swap never
  -- advances; the accepted coop branch advances only when non-terminal.
  perform common._require_turn(target_game, caller_id);

  -- ─── Validate the two positions ──────────────────────────
  if pos_a is null or pos_b is null or pos_a = pos_b
     or pos_a < 0 or pos_a > 24 or pos_b < 0 or pos_b > 24 then
    raise exception 'bad-swap-cells|'
      using errcode = 'P0001',
      detail = 'swap needs two distinct cells in 0..24';
  end if;
  if pos_a in (6, 8, 16, 18) or pos_b in (6, 8, 16, 18) then
    raise exception 'swap-on-hole|' using errcode = 'P0001',
      detail = 'cells 7/9/17/19 are holes and hold no tile';
  end if;

  -- The caller's working board (coop rows are identical; compete is
  -- the caller's own).
  select board, swaps_used, solved into p_board, p_swaps, p_solved
    from waffle.players
   where game_id = target_game and user_id = caller_id;
  -- A solved player is locked (matters in compete, where the game
  -- continues for others after one player solves).
  if p_solved then
    raise exception 'already-solved|' using errcode = 'P0001',
      detail = 'this player has already solved the grid';
  end if;
  if p_swaps >= g_row.max_swaps then
    raise exception 'no-swaps-left|' using errcode = 'P0001',
      detail = 'the swap budget for this player/team is spent';
  end if;

  -- Apply the swap (overlay/substr are 1-based). Both placements use
  -- the ORIGINAL board so the two cells exchange cleanly.
  a1 := pos_a + 1;
  b1 := pos_b + 1;
  new_board := overlay(p_board placing substr(p_board, b1, 1) from a1 for 1);
  new_board := overlay(new_board placing substr(p_board, a1, 1) from b1 for 1);
  new_swaps := p_swaps + 1;
  did_solve := (new_board = g_row.solution);

  -- Append to the move log, in BOTH modes (compete gained one 2026-08-02).
  -- The letters come from the PRE-swap board (p_board) so the entry is
  -- self-contained, and `new_swaps` is the caller's own count — which is why
  -- user_id is in the primary key. Compete's rows are RLS-private until the
  -- game ends; see the swaps_select policy for why that's load-bearing.
  insert into waffle.swaps
    (game_id, user_id, seq, pos_a, pos_b, letter_a, letter_b)
  values
    (target_game, caller_id, new_swaps, pos_a, pos_b,
     substr(p_board, a1, 1), substr(p_board, b1, 1));

  if g_row.mode = 'coop' then
    -- Lock-step: every player's row mirrors the shared board + count.
    update waffle.players
       set board      = new_board,
           swaps_used = new_swaps,
           solved     = did_solve,
           solved_at  = case when did_solve then now() else solved_at end
     where game_id = target_game;

    if did_solve then
      term_state := 'won';
      out_terminal := true;
    elsif new_swaps >= g_row.max_swaps then
      term_state := 'lost';
      out_terminal := true;
    end if;

    if out_terminal then
      -- Coop: everyone shares the outcome.
      select jsonb_object_agg(user_id::text, jsonb_build_object('won', did_solve))
        into player_results
        from common.game_players
       where game_id = target_game;
      -- Every terminal write states its `outcome` explicitly. Under the
      -- merging common.end_game an omitted key would inherit whatever was on
      -- the row, so "no outcome" is not a safe way to mean "solved normally".
      perform common.end_game(
        target_game, term_state,
        jsonb_build_object('mode', 'coop', 'solved', did_solve,
                           'outcome', case when did_solve then 'solved' else 'exhausted' end,
                           'swaps_used', new_swaps, 'max_swaps', g_row.max_swaps),
        player_results
      );
    end if;

    -- Turn-order: an accepted, non-terminal coop swap hands the turn to the
    -- next player (no-op for free-for-all). Skipped when this swap solved the
    -- puzzle or spent the last swap (the pointer is left as-is at terminal).
    if not out_terminal then
      perform common._advance_turn(target_game);
      -- Keep the club-list readout current. Only the swap COUNT moves, so
      -- that's all this states — common.update_state merges, so the rest of
      -- the blob create_game seeded stays put.
      --
      -- Coop only: compete's boards are independent and private, and this
      -- column is club-wide readable, so a shared "swaps used" would be both
      -- meaningless (whose?) and a progress leak.
      perform common.update_state(
        target_game, 'playing',
        jsonb_build_object('swaps_used', new_swaps));
    end if;
  else
    -- Compete: apply the swap to the caller's own row only.
    update waffle.players
       set board      = new_board,
           swaps_used = new_swaps,
           solved     = did_solve,
           solved_at  = case when did_solve then now() else solved_at end
     where game_id = target_game and user_id = caller_id;

    -- The game ends when EVERY player is done — solved, out of swaps,
    -- or conceded. Shared with waffle.concede (a drop-out can be the
    -- move that empties the racing set). Returns true when it ended.
    out_terminal := waffle._maybe_finish_compete(target_game);
  end if;

  -- Club-list title: coop now reads the words this swap got right; a compete
  -- race that just ended now reads the puzzle's words. Runs after the terminal
  -- branches so it sees the settled is_terminal.
  perform waffle._sync_title(target_game);

  return jsonb_build_object(
    'colors',     waffle.board_colors(new_board, g_row.solution),
    'swaps_used', new_swaps,
    'solved',     did_solve,
    'terminal',   out_terminal
  );
end;
$$;

revoke execute on function waffle.submit_swap(uuid, int, int) from public;
grant execute on function waffle.submit_swap(uuid, int, int) to authenticated;

-- ============================================================
-- waffle.concede — a player drops out of a compete race
-- ============================================================
-- waffle is an ELIMINATION game (a player can be done — solved or out
-- of swaps — without the table ending), so it can't use the generic
-- common.concede: after flipping the shared flag it re-runs its own
-- terminal check, which now counts a conceder as done and excludes
-- them from the win. Compete only (coop ends via the shared End).
create or replace function waffle.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
begin
  perform common.require_compete((select mode from waffle.games where id = target_game));
  perform common._set_conceded(target_game);
  perform waffle._maybe_finish_compete(target_game);
  -- A concede can be the move that empties the racing set, ending the game —
  -- in which case the title becomes the puzzle's words.
  perform waffle._sync_title(target_game);
end;
$$;

revoke execute on function waffle.concede(uuid) from public;
grant execute on function waffle.concede(uuid) to authenticated;

-- ============================================================
-- waffle.submit_timeout — countdown-timer expiry
-- ============================================================
-- Called by the FE (every player races to fire it) when a countdown
-- timer hits 0. Idempotent on the play_state check: the first call
-- ends the game, the rest raise "not in progress" which the manifest
-- swallows. Coop: the shared board wasn't solved → lost. Compete:
-- time's up — the winner is whoever solved in the fewest swaps (the
-- same rule as a natural finish); nobody solved → lost_compete.
create or replace function waffle.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  g_row              waffle.games%rowtype;
  current_play_state text;
  winner_id          uuid;
  term_state         text;
  player_results     jsonb;
begin
  select * into g_row from waffle.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no waffle.games row for target_game';
  end if;

  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;

  if g_row.mode = 'coop' then
    select jsonb_object_agg(user_id::text, jsonb_build_object('won', false))
      into player_results
      from common.game_players
     where game_id = target_game;
    perform common.end_game(
      target_game, 'lost',
      jsonb_build_object('mode', 'coop', 'solved', false, 'outcome', 'timeout'),
      player_results
    );
  else
    -- Compete: winner among whoever solved before the clock ran out,
    -- excluding conceders (a drop-out forfeits any win).
    select wp.user_id into winner_id
      from waffle.players wp
      join common.game_players gp
        on gp.game_id = wp.game_id and gp.user_id = wp.user_id
     where wp.game_id = target_game and wp.solved and not gp.conceded
     order by wp.swaps_used asc, wp.solved_at asc
     limit 1;
    select jsonb_object_agg(
             user_id::text,
             jsonb_build_object(
               'won',    coalesce(user_id = winner_id, false),
               'solved', solved,
               'swaps',  swaps_used
             )
           )
      into player_results
      from waffle.players
     where game_id = target_game;
    term_state := case when winner_id is not null
                       then 'won_compete' else 'lost_compete' end;
    perform common.end_game(
      target_game, term_state,
      jsonb_build_object('mode', 'compete', 'outcome', 'timeout',
                         'winner_user_id', winner_id, 'winner_username', (select username from common.profiles where user_id = winner_id)),
      player_results
    );
  end if;

  -- The game is over either way — a compete title stops saying "New compete".
  perform waffle._sync_title(target_game);

  -- Realtime touch: common.end_game writes common.games, not waffle.*,
  -- so the FE's useGame subscription (on waffle.{games,players}) would
  -- never wake. A no-op self-update produces a WAL entry it picks up,
  -- refetching games_state (now revealing the solution).
  update waffle.games set club_handle = club_handle where id = target_game;
end;
$$;

revoke execute on function waffle.submit_timeout(uuid) from public;
grant execute on function waffle.submit_timeout(uuid) to authenticated;

-- ============================================================
-- waffle.end_game — manual stop
-- ============================================================
--
-- The friends' explicit "we're done" button, available in BOTH
-- modes. waffle already has intrinsic terminals — coop 'won' /
-- 'lost', compete 'won_compete' / 'lost_compete' (see submit_swap
-- and submit_timeout). This RPC is a *different* thing: a neutral
-- stop that nobody wins or loses. It writes the UNIFORM terminal
-- play_state 'ended' (the same value spellingbee/codenamesduet/etc. use for
-- a manual end), NOT one of waffle's intrinsic verdicts — so the
-- FE renders the neutral green "Game ended" card rather than a
-- win/lose result.
--
-- Distinct from suspend: suspend leaves play_state='playing' and is
-- the "back to club, start a new game" path. end_game is terminal,
-- so the game lands in the club's completed section and the
-- terminal verdict renders.
--
-- Shape mirrors submit_timeout, with three deliberate differences:
--   - play_state is always 'ended' (no mode/solver branching)
--   - every player gets {"won": false} — there is no winner
--   - status.outcome = 'manual'
-- Any game player may fire it (it's a user-driven menu action, not
-- a timer race), and it's idempotent on the play_state check the
-- same way submit_timeout is: a second click raises P0001, which
-- the manifest swallows.
create or replace function waffle.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  g_row              waffle.games%rowtype;
  current_play_state text;
  player_results     jsonb;
begin
  select * into g_row from waffle.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no waffle.games row for target_game';
  end if;

  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    -- Idempotency: a second click (or a click racing the countdown
    -- timer's submit_timeout) raises this; the FE swallows it.
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;

  -- Nobody won — the friends agreed to stop. Same {"won": false}
  -- for every player regardless of mode.
  select jsonb_object_agg(user_id::text, jsonb_build_object('won', false))
    into player_results
    from common.game_players
   where game_id = target_game;

  perform common.end_game(
    target_game, 'ended',
    jsonb_build_object('outcome', 'manual', 'mode', g_row.mode),
    player_results
  );

  -- Terminal now, so a compete title stops saying "New compete".
  perform waffle._sync_title(target_game);

  -- Realtime touch: same trick as submit_timeout. common.end_game
  -- writes common.games, not waffle.*, so the FE's useGame
  -- subscription (on waffle.{games,players}) would never wake. A
  -- no-op self-update produces a WAL entry it picks up, refetching
  -- games_state — which now reveals the solution (and, in compete,
  -- opponents' boards) because common.end_game set is_terminal=true.
  update waffle.games set club_handle = club_handle where id = target_game;
end;
$$;

revoke execute on function waffle.end_game(uuid) from public;
grant execute on function waffle.end_game(uuid) to authenticated;

-- ============================================================
-- (removed 2026-08-03) waffle.reveal_answer — the mid-game give-up
-- ============================================================
-- Was: overwrite every waffle.players.board with the solution, then end
-- the game as a neutral give-up. Gone so waffle matches every other
-- game: End the game (which ends it for everyone), THEN Reveal — where
-- Reveal is a local FE display toggle (docs/ui.md → Terminal results),
-- terminal-only because the solution doesn't reach a compete client before
-- then. The FE's display swap covers what
-- the board rewrite did, without destroying the boards the players
-- actually built — which also makes the turn-history viewer honest after
-- a reveal.


-- ============================================================
-- waffle.replay_board — restart this board from scratch
-- ============================================================
-- The "Replay board" game-menu item: reset the working state to the
-- original scramble on the SAME game row. The frozen puzzle
-- (solution / scramble / par / max_swaps / mode) stays; everything
-- the players did is wiped. Any game player may call it, from a
-- finished game OR mid-game (no play_state guard — it's a restart).
-- Both modes reset ALL players (a group "run it back", per the
-- friends trust model).
--
-- Resets the waffle-specific working state (every player's board →
-- scramble, swaps zeroed, unsolved; the coop swap log cleared), then
-- hands the common-layer reset to common.reset_game (un-terminal,
-- fresh initial status, clear per-player results + concede).
--
-- No realtime touch needed (unlike end_game, which writes only
-- common.games): the players update + swaps delete wake useGame
-- (subscribed to waffle.{games,players,swaps}), and reset_game's
-- common.games write wakes useCommonGame — so the board, turn log,
-- and terminal state all reset live for every player.
create or replace function waffle.replay_board(target_game uuid)
returns void
language plpgsql
security definer
set search_path = waffle, common, public, extensions
as $$
declare
  g_row waffle.games;
begin
  perform common.require_game_player(target_game);
  -- FOR UPDATE: a replay racing a move must not interleave with it (the move
  -- RPCs lock the same row), or the reset could land on a half-applied move —
  -- a stray log row in the "fresh" game, or worse, an in-flight game-ENDING
  -- move re-terminalling the board that was just reset.
  select * into g_row from waffle.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no waffle.games row for target_game';
  end if;

  update waffle.players
     set board = g_row.scramble,
         swaps_used = 0,
         solved = false,
         solved_at = null
   where game_id = target_game;

  delete from waffle.swaps where game_id = target_game;

  -- Turn-order coop: rewind to the original opener. Matches no row (so it's a
  -- no-op) in a free-for-all game, whose pointer is null.
  update common.games
     set current_turn_user_id = (
           select gp.user_id from common.game_players gp
            where gp.game_id = target_game and gp.turn_seat = 0
         )
   where id = target_game and current_turn_user_id is not null;

  -- Same shape create_game seeds (counters coop-only) — a restart must land on
  -- a status indistinguishable from a fresh game's.
  perform common.reset_game(
    target_game,
    jsonb_build_object('mode', g_row.mode, 'solved', false)
      || case when g_row.mode = 'coop'
              then jsonb_build_object('max_swaps', g_row.max_swaps, 'swaps_used', 0)
              else '{}'::jsonb
         end
  );

  -- Back to the placeholder: every board is the scramble again (no word is
  -- correct) and reset_game cleared is_terminal, so the title must stop
  -- advertising words the players no longer have.
  perform waffle._sync_title(target_game);
end;
$$;

revoke execute on function waffle.replay_board(uuid) from public;
grant execute on function waffle.replay_board(uuid) to authenticated;
