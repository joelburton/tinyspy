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
-- coop/compete terminal logic, the vendored puzzle pipeline).
--
-- ─── BUILD STATUS ───────────────────────────────────────────
-- Phase 1: the schema + the per-tile COLOR-FEEDBACK algorithm only
-- (no tables / RPCs yet — those land in Phase 3). The color helpers
-- are pure functions of (board, solution); the game wires them into
-- a security_invoker view later so the FE gets colors without ever
-- seeing the hidden solution.

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
