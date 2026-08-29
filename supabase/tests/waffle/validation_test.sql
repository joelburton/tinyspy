-- cs-unmet

-- ============================================================
-- Test: waffle.create_game — input validation (the reject paths)
-- ============================================================
-- create_game is server-authoritative for board integrity: boards are
-- normally built by the waffle-build-board edge function, but the RPC
-- re-validates everything the client sends so a hand-crafted call can't
-- inject an unsolvable or malformed board. create_game_test covers the
-- happy path; this file exercises every refusal branch.
--
-- Each case keeps the valid fixtures (waffle_setup / waffle_board) and
-- breaks exactly ONE field via a jsonb merge (`||`), so the assertion
-- pins down which check fired.
--
-- Every one is a FAULT on `_`. Two settings and a board reach this RPC, and
-- the player composes none of them: the setup dialog's own controls bound
-- difficulty and the swap budget, and the board is built by an edge function
-- the player never sees. So nothing here is a sentence to put under a field —
-- each one means something upstream is broken, and the modal says so.
--
-- The two integrity guards (#6 holes, #7 rearrangement) are the point
-- of the exercise — they're what stops a client claiming a "solution"
-- whose letters don't match the scramble, or holes in the wrong cells.

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(7);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

create temp table club on commit drop as
select pg_temp.create_club('Waffle validation', array['ada', 'bea']) as handle;

-- Shorthand: the call with valid setup + board, parameterized by the
-- mode and board overrides each case substitutes in.
-- (Written out per-case below for readability rather than a macro.)

-- ─── (1) mode must be coop or compete ─────────────────────────
select pg_temp.envelope_is(
  waffle.create_game((select handle from club), pg_temp.waffle_setup(5),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'solo', pg_temp.waffle_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN040",
    "message":"BUG: game mode of ''solo''"}'::jsonb,
  'mode outside {coop, compete} is rejected'
);

-- ─── (2) setup.extra_swaps must be 0..15 ──────────────────────
select pg_temp.envelope_is(
  waffle.create_game((select handle from club),
    pg_temp.waffle_setup(5) || '{"extra_swaps": 99}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop', pg_temp.waffle_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN104",
    "message":"BUG: swap budget of 99"}'::jsonb,
  'extra_swaps above 15 is rejected'
);

-- ─── (3) setup.difficulty must be 1..6 ────────────────────────
select pg_temp.envelope_is(
  waffle.create_game((select handle from club),
    pg_temp.waffle_setup(5) || '{"difficulty": 9}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop', pg_temp.waffle_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN105",
    "message":"BUG: word difficulty of 9"}'::jsonb,
  'difficulty outside 1..6 is rejected'
);

-- ─── (4) board.solution / scramble must be 25 chars ───────────
select pg_temp.envelope_is(
  waffle.create_game((select handle from club), pg_temp.waffle_setup(5),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop', pg_temp.waffle_board() || '{"solution": "abc"}'::jsonb),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN106",
    "message":"BUG: generated board was not a pair of 25-square grids"}'::jsonb,
  'a solution that is not 25 chars is rejected'
);

-- ─── (5) board.par_swaps must be a positive int ───────────────
select pg_temp.envelope_is(
  waffle.create_game((select handle from club), pg_temp.waffle_setup(5),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop', pg_temp.waffle_board() || '{"par_swaps": 0}'::jsonb),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN107",
    "message":"BUG: generated board arrived with a par of 0"}'::jsonb,
  'a non-positive par_swaps is rejected'
);

-- ─── (6) board.solution holes must be at cells 7/9/17/19 ──────
-- A 25-char all-letter solution (no holes) passes the length check but
-- has no holes where the lattice requires them.
select pg_temp.envelope_is(
  waffle.create_game((select handle from club), pg_temp.waffle_setup(5),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop', pg_temp.waffle_board() ||
      jsonb_build_object(
        'solution', 'abcdefghijklmnopqrstuvwxy',
        'scramble', 'abcdefghijklmnopqrstuvwxy')),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN108",
    "message":"BUG: generated board had its holes in the wrong squares"}'::jsonb,
  'a solution without holes at the interior cells is rejected'
);

-- ─── (7) board.scramble must be a rearrangement of solution ───
-- The integrity guard: same length + holes, but one letter swapped for
-- a letter the solution doesn't contain, so the multisets differ and
-- the puzzle wouldn't be solvable by swaps alone.
select pg_temp.envelope_is(
  waffle.create_game((select handle from club), pg_temp.waffle_setup(5),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop', pg_temp.waffle_board() ||
      '{"scramble": "zacdef.g.hijklmn.o.pqrstu"}'::jsonb),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN109",
    "message":"BUG: generated board could not be solved by swapping"}'::jsonb,
  'a scramble whose letters differ from the solution is rejected'
);

select * from finish();
rollback;
