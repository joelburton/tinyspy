-- ============================================================
-- Test: waffle color-feedback algorithm
-- ============================================================
--
-- The per-tile green/yellow/gray feedback (waffle.compute_colors and
-- its per-word helper waffle._wordle_colors). This is the highest-
-- correctness-risk piece of the game — the Wordle duplicate-letter
-- accounting plus the intersection merge — so it gets pinned first,
-- before any tables or RPCs exist (Phase 1).
--
-- Pure functions of (board, solution); no game rows needed. Boards
-- are 25-char strings, holes = '.', filled cells lowercase a–z.
--
-- The reference solution used below has 21 distinct letters (a..u),
-- so there's no cross-word duplicate noise. Holes at 0-based 6,8,16,18:
--   row0 abcde   row1 f.g.h   row2 ijklm   row3 n.o.p   row4 qrstu
--   solution string = 'abcdef.g.hijklmn.o.pqrstu'

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql

select plan(10);

-- ============================================================
-- _wordle_colors — one 5-letter word, Wordle-style
-- ============================================================

select is(waffle._wordle_colors('abcde', 'abcde'), 'ggggg',
  'all correct → all green');

select is(waffle._wordle_colors('fghij', 'abcde'), 'xxxxx',
  'no shared letters → all gray');

select is(waffle._wordle_colors('bacde', 'abcde'), 'yyggg',
  'two adjacent letters swapped → two yellows, rest green');

select is(waffle._wordle_colors('edcba', 'abcde'), 'yygyy',
  'fully reversed (one fixed point) → green in the middle, yellows around');

-- Duplicate accounting: the guess has three b's but the answer has
-- only one. One earns a yellow; the extras gray.
select is(waffle._wordle_colors('aabbb', 'abxyz'), 'gxyxx',
  'duplicate guess letters only claim as many yellows as the answer has');

-- ============================================================
-- compute_colors — the whole board, with the intersection merge
-- ============================================================

-- Solved: board == solution → every filled cell green, holes '.'.
select is(
  waffle.compute_colors('abcdef.g.hijklmn.o.pqrstu', 'abcdef.g.hijklmn.o.pqrstu'),
  (select string_agg(
     case when i = any(array[6,8,16,18]) then '.' else 'g' end,
     '' order by i)
   from generate_series(0,24) i),
  'solved board → all filled cells green, holes preserved'
);

-- Swap the two letters in cells 0 and 1 (both in across-word a0;
-- cell 0 is also the first cell of down-word d0). Against the solution:
--   · in a0 ('bacde' vs 'abcde') both swapped letters are yellow,
--   · in d0 ('bfinq' vs 'afinq') the 'b' at cell 0 is gray ('b' isn't
--     in d0's answer),
-- so cell 0 merges yellow(a0) vs gray(d0) → YELLOW (stronger wins),
-- cell 1 is yellow, and every other cell stays green.
select is(
  waffle.compute_colors('bacdef.g.hijklmn.o.pqrstu', 'abcdef.g.hijklmn.o.pqrstu'),
  (select string_agg(
     case when i = any(array[6,8,16,18]) then '.'
          when i in (0,1) then 'y'
          else 'g' end,
     '' order by i)
   from generate_series(0,24) i),
  'one-word swap → swapped cells yellow (intersection keeps the stronger color)'
);

-- A cell gray in BOTH its words stays gray. Place 'z' (a letter in
-- neither the puzzle nor either of cell 12's words) at the center
-- intersection cell 12 (in a2 and d2): gray + gray → gray.
select is(
  substr(
    waffle.compute_colors('abcdef.g.hijzlmn.o.pqrstu', 'abcdef.g.hijklmn.o.pqrstu'),
    13, 1),                                            -- cell 12, 1-based 13
  'x',
  'a letter in neither of an intersection''s words → gray in the merge'
);

-- Holes are always '.' regardless of board content.
select is(
  array_to_string(array(
    select substr(
      waffle.compute_colors('bacdef.g.hijklmn.o.pqrstu', 'abcdef.g.hijklmn.o.pqrstu'),
      p + 1, 1)
    from unnest(array[6,8,16,18]) p), ''),
  '....',
  'hole cells are never colored'
);

-- The result is always 25 characters.
select is(
  length(waffle.compute_colors('bacdef.g.hijklmn.o.pqrstu', 'abcdef.g.hijklmn.o.pqrstu')),
  25,
  'compute_colors returns a 25-char string'
);

select * from finish();
rollback;
