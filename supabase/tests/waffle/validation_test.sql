-- ============================================================
-- Test: waffle.create_game — input validation (the reject paths)
-- ============================================================
-- create_game is server-authoritative for board integrity: boards are
-- normally built by the waffle-build-board edge function, but the RPC
-- re-validates everything the client sends so a hand-crafted call can't
-- inject an unsolvable or malformed board. create_game_test covers the
-- happy path; this file exercises every `raise exception` branch.
--
-- Each case keeps the valid fixtures (waffle_setup / waffle_board) and
-- breaks exactly ONE field via a jsonb merge (`||`), so the assertion
-- pins down which check fired. All are P0001 (rule violations).
--
-- The two integrity guards (#5 holes, #6 rearrangement) are the point
-- of the exercise — they're what stops a client claiming a "solution"
-- whose letters don't match the scramble, or holes in the wrong cells.

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(7);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

create temp table club on commit drop as
select common.create_club('Waffle validation', array['ada', 'bea']) as handle;

-- Shorthand: the call with valid setup + board, parameterized by the
-- mode and board overrides each case substitutes in.
-- (Written out per-case below for readability rather than a macro.)

-- ─── (1) mode must be coop or compete ─────────────────────────
select throws_ok(
  format(
    $$ select waffle.create_game(%L, pg_temp.waffle_setup(5),
         array['ada11111-1111-1111-1111-111111111111'::uuid],
         'solo', pg_temp.waffle_board()) $$,
    (select handle from club)
  ),
  'P0001', 'mode must be coop or compete (got solo)',
  'mode outside {coop, compete} is rejected'
);

-- ─── (2) setup.extra_swaps must be 0..15 ──────────────────────
select throws_ok(
  format(
    $$ select waffle.create_game(%L,
         pg_temp.waffle_setup(5) || '{"extra_swaps": 99}'::jsonb,
         array['ada11111-1111-1111-1111-111111111111'::uuid],
         'coop', pg_temp.waffle_board()) $$,
    (select handle from club)
  ),
  'P0001', 'setup.extra_swaps must be 0..15 (got 99)',
  'extra_swaps above 15 is rejected'
);

-- ─── (3) setup.difficulty must be 1..6 ────────────────────────
select throws_ok(
  format(
    $$ select waffle.create_game(%L,
         pg_temp.waffle_setup(5) || '{"difficulty": 9}'::jsonb,
         array['ada11111-1111-1111-1111-111111111111'::uuid],
         'coop', pg_temp.waffle_board()) $$,
    (select handle from club)
  ),
  'P0001', 'setup.difficulty must be 1..6 (got 9)',
  'difficulty outside 1..6 is rejected'
);

-- ─── (4) board.solution / scramble must be 25 chars ───────────
select throws_ok(
  format(
    $$ select waffle.create_game(%L, pg_temp.waffle_setup(5),
         array['ada11111-1111-1111-1111-111111111111'::uuid],
         'coop', pg_temp.waffle_board() || '{"solution": "abc"}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001', 'board.solution / board.scramble must be 25-char strings',
  'a solution that is not 25 chars is rejected'
);

-- ─── (5) board.par_swaps must be a positive int ───────────────
select throws_ok(
  format(
    $$ select waffle.create_game(%L, pg_temp.waffle_setup(5),
         array['ada11111-1111-1111-1111-111111111111'::uuid],
         'coop', pg_temp.waffle_board() || '{"par_swaps": 0}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001', 'board.par_swaps must be a positive int (got 0)',
  'a non-positive par_swaps is rejected'
);

-- ─── (6) board.solution holes must be at cells 7/9/17/19 ──────
-- A 25-char all-letter solution (no holes) passes the length check but
-- has no holes where the lattice requires them.
select throws_ok(
  format(
    $$ select waffle.create_game(%L, pg_temp.waffle_setup(5),
         array['ada11111-1111-1111-1111-111111111111'::uuid],
         'coop', pg_temp.waffle_board() ||
           jsonb_build_object(
             'solution', 'abcdefghijklmnopqrstuvwxy',
             'scramble', 'abcdefghijklmnopqrstuvwxy')) $$,
    (select handle from club)
  ),
  'P0001', 'board.solution holes must be at cells 7/9/17/19',
  'a solution without holes at the interior cells is rejected'
);

-- ─── (7) board.scramble must be a rearrangement of solution ───
-- The integrity guard: same length + holes, but one letter swapped for
-- a letter the solution doesn't contain, so the multisets differ and
-- the puzzle wouldn't be solvable by swaps alone.
select throws_ok(
  format(
    $$ select waffle.create_game(%L, pg_temp.waffle_setup(5),
         array['ada11111-1111-1111-1111-111111111111'::uuid],
         'coop', pg_temp.waffle_board() ||
           '{"scramble": "zacdef.g.hijklmn.o.pqrstu"}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001', 'board.scramble must be a rearrangement of board.solution',
  'a scramble whose letters differ from the solution is rejected'
);

select * from finish();
rollback;
