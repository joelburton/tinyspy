-- ============================================================
-- Test: strands path validation — every malformed path gets a DESIGNED error
-- ============================================================
-- submit_path's structural guards, planted one by one. The rule: a broken
-- path raises a named P0001 — never a raw cast failure (22P02) or a not-null
-- violation (23502) leaking out of the internals. (The original guard here
-- used `rs @> array[null]` — which array containment can never match, so the
-- guard could not fire; this file exists so a regression to that state fails.)
--
-- One deliberate acceptance: an INTEGRAL float coordinate (2.0) normalizes to
-- its int rather than raising, so "a client sending 2.0 can't dodge a match"
-- — the promise the normalization comment makes.

begin;

set search_path = strands, common, public, extensions;

select plan(10);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
-- (bea is a member but not a player — a club needs two members, a coop game
-- is fine with one player.)
select common.create_club('Malformed club', array['ada','bea']) as handle;
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;

create temp table g on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix)),
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop');

-- A tiny local shorthand: run submit_path against the fixture game with a
-- literal path.
create function pg_temp.submit(p text) returns text
language sql as $$
  select format('select strands.submit_path(%L::uuid, %L::jsonb)',
                (select id from g), p)
$$;

-- ── Not even a path ──
select throws_ok(pg_temp.submit('"zigzag"'),
  'P0001', 'path must be a json array',
  'a JSON string is refused by name');

select throws_ok(pg_temp.submit('[]'),
  'P0001', 'path must have at least one cell',
  'an empty array is refused by name');

-- ── Malformed cells: every shape gets the SAME designed error ──
select throws_ok(pg_temp.submit('[[0,0],[2]]'),
  'P0001', 'each path cell must be [row, col]',
  'a one-element cell is refused by name (not a 23502 from the insert)');

select throws_ok(pg_temp.submit('[[0,0],["a",1]]'),
  'P0001', 'each path cell must be [row, col]',
  'a non-numeric member is refused by name (not a 22P02 from the cast)');

select throws_ok(pg_temp.submit('[[0,0],[0,1.5]]'),
  'P0001', 'each path cell must be [row, col]',
  'a fractional coordinate is refused by name');

-- ── …but an INTEGRAL float is normalized, not refused ──
select is(
  (select strands.submit_path((select id from g), '[[0,0],[0,1.0]]'::jsonb))->>'result',
  'too_short',
  'an integral 1.0 normalizes to 1 and the path classifies normally'
);

-- ── Geometry ──
select throws_ok(pg_temp.submit('[[0,5],[0,6]]'),
  'P0001', 'path cell 1 is off the board',
  'an off-board cell is refused, naming WHICH cell');

select throws_ok(pg_temp.submit('[[0,0],[2,2]]'),
  'P0001', 'path cells 0 and 1 are not adjacent',
  'a jump is refused — 8-way adjacency is the rule');

select throws_ok(pg_temp.submit('[[0,0],[0,1],[0,0]]'),
  'P0001', 'path revisits a cell',
  'a self-crossing trace is refused');

-- ── Spent tiles lock ──
select strands.submit_path((select id from g), pg_temp.strands_row_path(0));
select throws_ok(pg_temp.submit(pg_temp.strands_prefix_path(0, 4)::text),
  'P0001', 'path crosses an already-found word',
  'a found word''s tiles are spent — tracing through them is refused');

select * from finish();
rollback;
