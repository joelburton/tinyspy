-- ============================================================
-- waffle (brand: SyrupSwap) — Waffle-style swap-to-solve puzzle
-- ============================================================
--
-- A 5×5 lattice of 6 interlocking 5-letter words (3 across on rows
-- 0/2/4, 3 down on cols 0/2/4). Every correct letter is on the board
-- but scrambled; players SWAP tile pairs to solve within a budget,
-- with Wordle-style green/yellow/gray feedback. Codename `waffle`
-- everywhere in code; the user-facing brand is "SyrupSwap" (manifest
-- title + end-user copy only).
--
-- See docs/games/waffle.md for the full design (schema, RPCs,
-- coop/compete terminal logic, the on-demand board generation).

create schema if not exists waffle;
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
create function waffle._color_rank(c text)
returns int
language sql
immutable
as $$
  select case c when 'g' then 3 when 'y' then 2 when 'x' then 1 else 0 end;
$$;

-- ============================================================
-- waffle._wordle_colors — color ONE 5-letter word, Wordle-style
-- ============================================================
-- Returns a same-length string of 'g' (right letter, right spot),
-- 'y' (in the word, wrong spot) or 'x' (not in the word), with the
-- standard duplicate-letter accounting: a letter only earns a yellow
-- if there's an unconsumed copy of it in the answer after greens are
-- removed. Two passes — greens first (so they claim their answer
-- letter), yellows second from the leftover pool.
create function waffle._wordle_colors(guess text, answer text)
returns text
language plpgsql
immutable
as $$
declare
  n    int := length(guess);
  res  text[] := array_fill('x'::text, array[n]);
  pool int[]  := array_fill(0, array[26]);   -- counts of answer letters left after greens
  i    int;
  gc   text;
  ac   text;
  idx  int;
begin
  guess  := lower(guess);
  answer := lower(answer);

  -- Pass 1: greens. Non-green answer letters go into the pool.
  for i in 1..n loop
    gc := substr(guess, i, 1);
    ac := substr(answer, i, 1);
    if gc = ac then
      res[i] := 'g';
    else
      idx := ascii(ac) - 96;                 -- 'a' -> 1 .. 'z' -> 26
      if idx between 1 and 26 then
        pool[idx] := pool[idx] + 1;
      end if;
    end if;
  end loop;

  -- Pass 2: yellows, consuming from the pool left-to-right.
  for i in 1..n loop
    if res[i] <> 'g' then
      idx := ascii(substr(guess, i, 1)) - 96;
      if idx between 1 and 26 and pool[idx] > 0 then
        res[i]    := 'y';
        pool[idx] := pool[idx] - 1;
      end if;
    end if;
  end loop;

  return array_to_string(res, '');
end;
$$;

-- ============================================================
-- waffle.compute_colors — color a whole board against the solution
-- ============================================================
-- Pure function of (board, solution): both 25-char strings. Colors
-- each of the 6 words independently with _wordle_colors, then merges
-- per cell — an intersection cell (in two words) shows the STRONGER
-- of its two colors (green > yellow > gray). Holes stay '.'.
--
-- This is the single source of truth for feedback; submit_swap will
-- return it and the read-view will expose it, both reading the hidden
-- solution server-side so the FE never holds the answer.
create function waffle.compute_colors(board text, solution text)
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

    wc := waffle._wordle_colors(bw, sw);

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

-- ============================================================
-- waffle.games — one row per playthrough
-- ============================================================
-- Boards are generated on demand by the `waffle-build-board` edge
-- function (no pre-generated puzzle library) and stored here, so the
-- game is self-contained. `solution` is the answer key — HIDDEN via a
-- column-level grant and revealed only post-terminal through
-- games_state (the freebee/psychicnum hidden-answer pattern).
-- `scramble` is the starting board (public).
create table waffle.games (
  id          uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  -- Sibling-manifest mode axis; agrees with the gametype string
  -- ('waffle_coop' / 'waffle_compete') by construction in create_game.
  mode        text not null check (mode in ('coop', 'compete')),
  scramble    char(25) not null,   -- starting board, holes '.'
  par_swaps   int not null,        -- minimum swaps to solve (from the build)
  max_swaps   int not null,        -- par + extra (the swap budget)
  solution    char(25) not null,   -- HIDDEN answer key
  created_at  timestamptz not null default now()
);

create index waffle_games_club_handle_idx on waffle.games (club_handle);

-- Column-level grant: everything EXCEPT `solution`. The presence of
-- any column grant flips the table from "all columns visible" to
-- "only granted columns," so we enumerate the safe ones. games_state
-- exposes the solution conditionally via a SECURITY DEFINER helper.
grant select
  (id, club_handle, mode, scramble, par_swaps, max_swaps, created_at)
  on waffle.games to authenticated;

alter table waffle.games enable row level security;
-- Read gating: any club member can read any of the club's games
-- (viewing is club-gated; acting is player-gated in the RPCs).
create policy games_select on waffle.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- ============================================================
-- waffle.players — per-player working state
-- ============================================================
-- One row per player. `board` is the player's current arrangement,
-- starting equal to the scramble. In COOP every row is kept identical
-- and updated in lock-step on each swap (mirrors wordknit.players);
-- in COMPETE each row moves independently. `solved` / `solved_at`
-- drive the compete fewest-swaps + earliest-time tie-break.
create table waffle.players (
  game_id    uuid not null references waffle.games(id) on delete cascade,
  user_id    uuid not null references common.profiles(user_id) on delete cascade,
  board      char(25) not null,
  swaps_used int not null default 0,
  solved     boolean not null default false,
  solved_at  timestamptz,
  primary key (game_id, user_id)
);

create index waffle_players_game_id_idx on waffle.players (game_id);

-- Column grant EXCLUDING `board`: in compete you race independently, so
-- an opponent's board (and the deductions it reveals) is hidden until
-- the game ends. players_state exposes the board conditionally via a
-- SECURITY DEFINER helper; swaps_used / solved stay visible (the
-- opponent-progress strip). In coop the board is shared, so the helper
-- shows it to everyone.
grant select (game_id, user_id, swaps_used, solved, solved_at)
  on waffle.players to authenticated;

alter table waffle.players enable row level security;
-- Row visibility is club-member-wide (you can see that an opponent
-- row exists, with its swaps_used / solved). The board column-hiding
-- above is what keeps the opponent's actual tiles private mid-compete.
create policy players_select on waffle.players
  for select to authenticated
  using (
    exists (
      select 1 from waffle.games g
       where g.id = players.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- ============================================================
-- waffle.swaps — the per-swap move log (coop only)
-- ============================================================
-- One row per swap, the shared move history other games keep (cf.
-- psychicnum.guesses, wordknit's guess log). Written ONLY in coop:
-- there the board is shared and public, so the whole log is club-
-- readable and the FE renders it during and after the game. Compete
-- never writes here — an opponent's swap sequence would leak the
-- deductions their hidden board is meant to protect — and the FE hides
-- the log in compete anyway.
--
-- `swap_index` is the coop shared swap count after the move (1-based),
-- which the games-row `for update` lock in submit_swap keeps sequential
-- and collision-free. `letter_a` / `letter_b` are the letters that sat
-- on `pos_a` / `pos_b` *before* the swap — stored (not derived) so the
-- log is self-contained as the board moves on.
create table waffle.swaps (
  game_id    uuid not null references waffle.games(id) on delete cascade,
  user_id    uuid not null references common.profiles(user_id) on delete cascade,
  swap_index int  not null,          -- 1-based ordinal within the game
  pos_a      int  not null,          -- 0..24
  pos_b      int  not null,          -- 0..24
  letter_a   char(1) not null,       -- letter on pos_a before the swap
  letter_b   char(1) not null,       -- letter on pos_b before the swap
  created_at timestamptz not null default now(),
  primary key (game_id, swap_index)
);

create index waffle_swaps_game_id_idx on waffle.swaps (game_id);

-- No hidden columns (coop board is shared), so the FE reads the table
-- directly rather than through a security_invoker view.
grant select on waffle.swaps to authenticated;

alter table waffle.swaps enable row level security;
create policy swaps_select on waffle.swaps
  for select to authenticated
  using (
    exists (
      select 1 from waffle.games g
       where g.id = swaps.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- Realtime: coop sees the shared board update live; the in-game
-- subscription is on waffle.{games, players, swaps}.
alter publication supabase_realtime add table waffle.games;
alter publication supabase_realtime add table waffle.players;
alter publication supabase_realtime add table waffle.swaps;

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

create function waffle._solution_for(g_id uuid)
returns text
language sql
stable
security definer
set search_path = waffle, common, public, extensions
as $$
  select case when cg.is_terminal then wg.solution::text else null end
    from waffle.games wg
    join common.games cg on cg.id = wg.id
   where wg.id = g_id;
$$;

-- Visible iff the caller owns the row, or it's coop, or it's over.
create function waffle._board_visible(wg waffle.games, cg common.games, row_user uuid)
returns boolean
language sql
stable                         -- auth.uid() is stable
as $$
  select row_user = auth.uid() or wg.mode = 'coop' or cg.is_terminal;
$$;

create function waffle._player_board_for(g_id uuid, row_user uuid)
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

create function waffle._player_colors_for(g_id uuid, row_user uuid)
returns text
language sql
stable
security definer
set search_path = waffle, common, public, extensions
as $$
  select case when waffle._board_visible(wg, cg, row_user)
              then waffle.compute_colors(wp.board, wg.solution) else null end
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
-- Register the gametype(s)
-- ============================================================
-- The sibling-manifest pair: coop (shared board, lock-step) and
-- compete (own board each, fewest-swaps winner).
insert into common.gametypes (gametype, min_players) values
  ('waffle_coop', 1),
  ('waffle_compete', 2)
on conflict do nothing;

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
-- function); we sanity-check structure. The game title is the band's
-- label, derived from setup.difficulty.
create function waffle.create_game(
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
begin
  perform common.require_club_member(target_club);
  -- Must agree with numberOfPlayers in src/waffle/manifest.ts ([1,6]).
  perform common.require_player_count_max(player_user_ids, 6);

  if mode not in ('coop', 'compete') then
    raise exception 'mode must be coop or compete (got %)', mode
      using errcode = 'P0001';
  end if;

  -- ─── Validate setup.extra_swaps (the swap-budget knob) ───
  s_extra := coalesce((setup->>'extra_swaps')::int, 5);
  if s_extra < 0 or s_extra > 15 then
    raise exception 'setup.extra_swaps must be 0..15 (got %)', s_extra
      using errcode = 'P0001';
  end if;

  -- ─── Validate setup.difficulty (the vocab band) ──────────
  -- The server accepts the FULL band range 1..6 (all word-list levels
  -- exist); which bands the setup dialog actually OFFERS is a FE/UI
  -- choice (today 1..5 — see DIFFICULTY_OPTIONS), changeable without a
  -- DB change since boards are generated on demand per band.
  s_difficulty := coalesce((setup->>'difficulty')::int, 2);
  if s_difficulty not between 1 and 6 then
    raise exception 'setup.difficulty must be 1..6 (got %)', s_difficulty
      using errcode = 'P0001';
  end if;

  perform common.validate_timer(setup->'timer');

  -- ─── Validate the passed board (structure, not content) ──────
  b_solution := board->>'solution';
  b_scramble := board->>'scramble';
  b_par      := (board->>'par_swaps')::int;
  if b_solution is null or length(b_solution) <> 25
     or b_scramble is null or length(b_scramble) <> 25 then
    raise exception 'board.solution / board.scramble must be 25-char strings'
      using errcode = 'P0001';
  end if;
  if b_par is null or b_par < 1 then
    raise exception 'board.par_swaps must be a positive int (got %)', b_par
      using errcode = 'P0001';
  end if;
  -- Holes ('.') at the four interior cells (1-based 7, 9, 17, 19).
  if substr(b_solution, 7, 1) <> '.' or substr(b_solution, 9, 1) <> '.'
     or substr(b_solution, 17, 1) <> '.' or substr(b_solution, 19, 1) <> '.' then
    raise exception 'board.solution holes must be at cells 7/9/17/19'
      using errcode = 'P0001';
  end if;
  -- Integrity: the scramble is a rearrangement of the solution (same
  -- letters), so it's solvable by swaps alone.
  if (select array_agg(c order by c)
        from regexp_split_to_table(b_solution, '') c)
     is distinct from
     (select array_agg(c order by c)
        from regexp_split_to_table(b_scramble, '') c) then
    raise exception 'board.scramble must be a rearrangement of board.solution'
      using errcode = 'P0001';
  end if;

  budget := b_par + s_extra;

  -- Game title = the band's label (the difficulty the player picked).
  game_title := case s_difficulty
    when 1 then 'Universal' when 2 then 'Common' when 3 then 'Familiar'
    when 4 then 'Uncommon' when 5 then 'Obscure' else 'Expert' end;

  new_id := common.create_game(
    target_club, 'waffle_' || mode, player_user_ids, game_title, setup,
    setup
  );

  insert into waffle.games
    (id, club_handle, mode, scramble, par_swaps, max_swaps, solution)
  values
    (new_id, target_club, mode, b_scramble, b_par, budget, b_solution);

  insert into waffle.players (game_id, user_id, board)
  select new_id, uid, b_scramble
    from unnest(player_user_ids) uid;

  perform common.update_state(
    new_id,
    'playing',
    jsonb_build_object(
      'mode', mode,
      'max_swaps', budget,
      'swaps_used', 0,
      'solved', false
    )
  );

  return query select new_id;
end;
$$;

revoke execute on function waffle.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function waffle.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

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
create function waffle.submit_swap(
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
  winner_id          uuid;
  player_results     jsonb;
begin
  caller_id := common.require_game_player(target_game);

  select * into g_row from waffle.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'swaps only allowed during active play'
      using errcode = 'P0001';
  end if;

  -- ─── Validate the two positions ──────────────────────────
  if pos_a is null or pos_b is null or pos_a = pos_b
     or pos_a < 0 or pos_a > 24 or pos_b < 0 or pos_b > 24 then
    raise exception 'swap needs two distinct cells in 0..24'
      using errcode = 'P0001';
  end if;
  if pos_a in (6, 8, 16, 18) or pos_b in (6, 8, 16, 18) then
    raise exception 'cannot swap a hole cell' using errcode = 'P0001';
  end if;

  -- The caller's working board (coop rows are identical; compete is
  -- the caller's own).
  select board, swaps_used, solved into p_board, p_swaps, p_solved
    from waffle.players
   where game_id = target_game and user_id = caller_id;
  -- A solved player is locked (matters in compete, where the game
  -- continues for others after one player solves).
  if p_solved then
    raise exception 'you have already solved this puzzle' using errcode = 'P0001';
  end if;
  if p_swaps >= g_row.max_swaps then
    raise exception 'no swaps remaining' using errcode = 'P0001';
  end if;

  -- Apply the swap (overlay/substr are 1-based). Both placements use
  -- the ORIGINAL board so the two cells exchange cleanly.
  a1 := pos_a + 1;
  b1 := pos_b + 1;
  new_board := overlay(p_board placing substr(p_board, b1, 1) from a1 for 1);
  new_board := overlay(new_board placing substr(p_board, a1, 1) from b1 for 1);
  new_swaps := p_swaps + 1;
  did_solve := (new_board = g_row.solution);

  if g_row.mode = 'coop' then
    -- Lock-step: every player's row mirrors the shared board + count.
    update waffle.players
       set board      = new_board,
           swaps_used = new_swaps,
           solved     = did_solve,
           solved_at  = case when did_solve then now() else solved_at end
     where game_id = target_game;

    -- Append to the shared move log. Coop only; the letters are read
    -- from the PRE-swap board (p_board) so the entry is self-contained.
    insert into waffle.swaps
      (game_id, user_id, swap_index, pos_a, pos_b, letter_a, letter_b)
    values
      (target_game, caller_id, new_swaps, pos_a, pos_b,
       substr(p_board, a1, 1), substr(p_board, b1, 1));

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
      perform common.end_game(
        target_game, term_state,
        jsonb_build_object('mode', 'coop', 'solved', did_solve,
                           'swaps_used', new_swaps, 'max_swaps', g_row.max_swaps),
        player_results
      );
    end if;
  else
    -- Compete: apply the swap to the caller's own row only.
    update waffle.players
       set board      = new_board,
           swaps_used = new_swaps,
           solved     = did_solve,
           solved_at  = case when did_solve then now() else solved_at end
     where game_id = target_game and user_id = caller_id;

    -- The game ends when EVERY player is done — solved, or out of
    -- swaps. The finite budget guarantees this happens (no stall).
    if not exists (
      select 1 from waffle.players
       where game_id = target_game
         and not solved
         and swaps_used < g_row.max_swaps
    ) then
      out_terminal := true;
      -- Winner = solved with the FEWEST swaps; tie-break the earliest
      -- solved_at (least time). NULL if nobody solved.
      select user_id into winner_id
        from waffle.players
       where game_id = target_game and solved
       order by swaps_used asc, solved_at asc
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
        jsonb_build_object('mode', 'compete',
                           'winner', winner_id),
        player_results
      );
    end if;
  end if;

  return jsonb_build_object(
    'colors',     waffle.compute_colors(new_board, g_row.solution),
    'swaps_used', new_swaps,
    'solved',     did_solve,
    'terminal',   out_terminal
  );
end;
$$;

revoke execute on function waffle.submit_swap(uuid, int, int) from public;
grant execute on function waffle.submit_swap(uuid, int, int) to authenticated;

-- ============================================================
-- waffle.submit_timeout — countdown-timer expiry
-- ============================================================
-- Called by the FE (every player races to fire it) when a countdown
-- timer hits 0. Idempotent on the play_state check: the first call
-- ends the game, the rest raise "not in progress" which the manifest
-- swallows. Coop: the shared board wasn't solved → lost. Compete:
-- time's up — the winner is whoever solved in the fewest swaps (the
-- same rule as a natural finish); nobody solved → lost_compete.
create function waffle.submit_timeout(target_game uuid)
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
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
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
    -- Compete: winner among whoever solved before the clock ran out.
    select user_id into winner_id
      from waffle.players
     where game_id = target_game and solved
     order by swaps_used asc, solved_at asc
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
                         'winner', winner_id),
      player_results
    );
  end if;

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
-- play_state 'ended' (the same value freebee/tinyspy/etc. use for
-- a manual end), NOT one of waffle's intrinsic verdicts — so the
-- FE renders the neutral green "Game ended" card rather than a
-- win/lose result.
--
-- Distinct from suspend: suspend leaves play_state='playing' and is
-- the "back to club, start a new game" path. end_game is terminal,
-- so the game lands in the club's completed section and the
-- GameOverModal pops.
--
-- Shape mirrors submit_timeout, with three deliberate differences:
--   - play_state is always 'ended' (no mode/solver branching)
--   - every player gets {"won": false} — there is no winner
--   - status.outcome = 'manual'
-- Any game player may fire it (it's a user-driven menu action, not
-- a timer race), and it's idempotent on the play_state check the
-- same way submit_timeout is: a second click raises P0001, which
-- the manifest swallows.
create function waffle.end_game(target_game uuid)
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
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    -- Idempotency: a second click (or a click racing the countdown
    -- timer's submit_timeout) raises this; the FE swallows it.
    raise exception 'game is not in progress' using errcode = 'P0001';
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
