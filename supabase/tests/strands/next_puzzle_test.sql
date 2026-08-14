-- ============================================================
-- Test: strands.next_puzzle_for_club — the whole puzzle choice
-- ============================================================
--
-- The setup dialog has no picker any more: the server decides which puzzle
-- you get. So this function IS the feature, and two of its properties are the
-- ones it would be easiest to break without noticing:
--
--   1. It looks ACROSS CLUBS. ada plays a puzzle in her SOLO club; an
--      ada+bea game must not be offered that puzzle, even though the ada+bea
--      club has never touched it. This is why the function is security
--      definer — ada's solo games are invisible to bea under RLS, and they
--      still have to count.
--   2. It is PER-PLAYER, not per-club. Only the people being SEATED burn a
--      puzzle. The cruder "any club sharing a member" rule would pass a test
--      that checked (1) alone, so (6) below is the one that separates them.
--
-- Plus: ascending by date, and the exhausted case returning zero rows so
-- create_game can raise `no-unplayed-puzzle|` instead of inserting a null id.
--
-- Puzzles are SYNTHETIC and dated 1999 (setup.psql's convention — the real
-- archive starts 2024-03-04, so these sort first and the assertions hold
-- whether or not a database has the import).

begin;

set search_path = strands, common, public, extensions;

select plan(10);

\ir ../_shared/setup.psql
\ir setup.psql

-- Two more fixture puzzles beside setup.psql's 1999-01-01 one, so "the next
-- one" is a real, checkable answer rather than "whatever the archive holds".
create function pg_temp.strands_puzzle_on(d date, tag text) returns uuid
language plpgsql security definer as $$
declare new_id uuid;
begin
  insert into strands.puzzles (source_id, puzzle_date, board, clue, solution)
  values (tag, d, pg_temp.strands_board(), 'Rows of nonsense',
          pg_temp.strands_solution())
  returning id into new_id;
  return new_id;
end;
$$;

-- Three days, because the discriminating assertion below needs somewhere
-- WRONG for the answer to land: under a club-membership rule cade gets
-- pushed past day 2 to day 3, and a two-puzzle fixture couldn't tell.
create temp table p on commit drop as
select pg_temp.strands_puzzle_on('1999-01-01', 'fixture-day-1') as day1,
       pg_temp.strands_puzzle_on('1999-01-02', 'fixture-day-2') as day2,
       pg_temp.strands_puzzle_on('1999-01-03', 'fixture-day-3') as day3;

create temp table ids on commit drop as
select 'ada11111-1111-1111-1111-111111111111'::uuid as ada,
       'bea22222-2222-2222-2222-222222222222'::uuid as bea,
       'cade3333-3333-3333-3333-333333333333'::uuid as cade;

-- These are created as the superuser but read back after as_user() has
-- switched the session to `authenticated`, which owns neither — so without
-- this the first read after the switch fails with "permission denied for
-- table p" rather than anything to do with the code under test.
grant select on p, ids to public;

-- ============================================================
-- (1)-(2) An untouched player gets the EARLIEST puzzle
-- ============================================================

select is(
  (select puzzle_date from strands.next_puzzle_for_club(array[(select ada from ids)])),
  '1999-01-01'::date,
  'an untouched player is offered the earliest puzzle (ascending, not newest-first)'
);

select is(
  (select label from strands.next_puzzle_for_club(array[(select ada from ids)])),
  '1999-01-01: Rows of nonsense',
  'the row carries the date + clue label the dialog shows as "next up"'
);

-- ============================================================
-- (3)-(6) ada plays day 1 in her SOLO club
-- ============================================================

select pg_temp.as_user((select ada from ids));

create temp table g1 on commit drop as
select id from strands.create_game(
  '=ada',
  pg_temp.strands_setup((select day1 from p)),
  array[(select ada from ids)],
  'coop');

select is(
  (select puzzle_date from strands.next_puzzle_for_club(array[(select ada from ids)])),
  '1999-01-02'::date,
  'having played day 1, ada is moved on to day 2'
);

-- The claim the design rests on: a DIFFERENT set of players containing ada
-- must skip what ada burned elsewhere.
select is(
  (select puzzle_date from strands.next_puzzle_for_club(
     array[(select ada from ids), (select bea from ids)])),
  '1999-01-02'::date,
  'an ada+bea game skips it too — the exclusion crosses clubs, not just games'
);

-- ...and it is ADA's history doing that, not the puzzle being globally spent.
select is(
  (select puzzle_date from strands.next_puzzle_for_club(array[(select bea from ids)])),
  '1999-01-01'::date,
  'bea, who has played nothing, is still offered day 1 — exclusion is PER-PLAYER'
);

-- ── The assertion that separates per-player from per-club ──
-- Everything above passes under EITHER rule, so this is the one doing the
-- work. Build the case a membership rule gets wrong:
--
--   * ada and cade share a club.
--   * ada plays day 2 IN THAT SHARED CLUB, seated alone.
--   * cade plays day 1 (so day 1 is out for her and day 2 is next in line).
--
-- cade must now be offered day 2. Under "exclude anything played in a club
-- that shares a member" it would be skipped — cade's own club has a day-2
-- game on the books — and she'd be pushed to day 3 for a game she was never
-- part of and knows nothing about.
create temp table shared on commit drop as
select common.create_club('ada and cade', array['ada','cade']) as handle;
grant select on shared to public;

create temp table g2 on commit drop as
select id from strands.create_game(
  (select handle from shared),
  pg_temp.strands_setup((select day2 from p)),
  array[(select ada from ids)],           -- ada alone: cade is a member, not a player
  'coop');

select pg_temp.as_user((select cade from ids));
create temp table g3 on commit drop as
select id from strands.create_game(
  '=cade',
  pg_temp.strands_setup((select day1 from p)),
  array[(select cade from ids)],
  'coop');

select is(
  (select puzzle_date from strands.next_puzzle_for_club(array[(select cade from ids)])),
  '1999-01-02'::date,
  'a club-mate''s game she was NOT seated in leaves the puzzle available — per-player, not per-club'
);

-- ============================================================
-- (7)-(8) puzzle_for_date — the override filters NOTHING
-- ============================================================
-- The counterpart RPC: you name a date, you get that puzzle, whether or not
-- the people playing have already done it. ada finished day 1 above, and
-- next_puzzle_for_club has moved her on; the override must still hand it
-- back, because "yes, I mean it" is its entire job.

select is(
  (select puzzle_date from strands.puzzle_for_date('1999-01-01')),
  '1999-01-01'::date,
  'puzzle_for_date returns a puzzle ada has ALREADY PLAYED — it excludes nothing'
);

select is(
  (select count(*)::int from strands.puzzle_for_date('1998-12-25')),
  0,
  'a date with no puzzle returns no rows, so the dialog can say so'
);

-- ============================================================
-- (9)-(10) Exhaustion
-- ============================================================
-- Delete every other puzzle inside this rolled-back transaction, so "ada has
-- played everything left" is true without playing 884 games. The FK from
-- games is soft (on delete set null), so this is safe.
--
-- Back to the superuser first: `authenticated` has no DELETE on the archive
-- (correctly), and this is fixture surgery, not behaviour under test.
reset role;
select set_config('request.jwt.claims', '', true);

delete from strands.puzzles where puzzle_date <> '1999-01-01';

select is(
  (select count(*)::int from strands.next_puzzle_for_club(array[(select ada from ids)])),
  0,
  'with every remaining puzzle played, the function returns NO rows'
);

select throws_ok(
  format(
    $$ select strands.create_game(
         '=ada',
         '{"band":5,"hint_cost":3,"min_word_length":4,"timer":{"kind":"none"}}'::jsonb,
         array[%L]::uuid[], 'coop') $$,
    (select ada from ids)
  ),
  'P0001',
  'no-unplayed-puzzle|',
  'and create_game with no puzzleId raises no-unplayed-puzzle| rather than crashing'
);

select * from finish();
rollback;
