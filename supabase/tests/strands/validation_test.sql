-- cs-unmet

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

select plan(11);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
-- (bea is a member but not a player — a club needs two members, a coop game
-- is fine with one player.)
select pg_temp.create_club('Malformed club', array['ada','bea']) as handle;
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;

-- The whole envelope is kept, not just the id: `data.result` is the field both
-- call sites filter the `ok` on.
create temp table created on commit drop as
select strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix)),
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop') as env;
create temp table g on commit drop as
select (env->'data'->>'id')::uuid as id from created;

select pg_temp.envelope_is(
  (select env from created),
  '{"type":"ok","data":{"result":"created"}}'::jsonb,
  'the answer names itself, so a call site has a case to assert');

-- A tiny local shorthand: submit a literal path against the fixture game.
-- No `format` any more — a refusal is a VALUE now, not an exception, so the
-- call needs no deferring.
create function pg_temp.submit(p text) returns jsonb
language sql as $$
  select strands.submit_path((select id from g), p::jsonb)
$$;

-- Every check below is a FAULT, and one rule covers them: the frontend BUILDS
-- the trace through `clickTile`, which only ever appends an adjacent,
-- unvisited, on-board cell. A shape that fails one of these did not come from
-- our board. The single exception is the last one.

-- ── Not even a path ──
select pg_temp.envelope_is(pg_temp.submit('"zigzag"'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN422",
    "message":"BUG: a trace that is not a path"}'::jsonb,
  'a JSON string is refused by name');

select pg_temp.envelope_is(pg_temp.submit('[]'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN423",
    "message":"BUG: an empty trace"}'::jsonb,
  'an empty array is refused by name');

-- ── Malformed cells: every shape gets the SAME designed error ──
select pg_temp.envelope_is(pg_temp.submit('[[0,0],[2]]'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN424",
    "message":"BUG: a trace cell that is not [row, col]"}'::jsonb,
  'a one-element cell is refused by name (not a 23502 from the insert)');

select pg_temp.envelope_is(pg_temp.submit('[[0,0],["a",1]]'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN424",
    "message":"BUG: a trace cell that is not [row, col]"}'::jsonb,
  'a non-numeric member is refused by name (not a 22P02 from the cast)');

select pg_temp.envelope_is(pg_temp.submit('[[0,0],[0,1.5]]'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN424",
    "message":"BUG: a trace cell that is not [row, col]"}'::jsonb,
  'a fractional coordinate is refused by name');

-- ── …but an INTEGRAL float is normalized, not refused ──
-- And `too_short` is an OK: the frontend does not gate on min_word_length, so
-- the server's verdict is the first anyone knows rather than a stale check.
select pg_temp.envelope_is(pg_temp.submit('[[0,0],[0,1.0]]'),
  '{"type":"ok","outcome":"warning","data":{"result":"too_short"}}'::jsonb,
  'an integral 1.0 normalizes to 1 and the path classifies normally');

-- ── Geometry ──
select pg_temp.envelope_is(pg_temp.submit('[[0,5],[0,6]]'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN425",
    "message":"BUG: a trace off the board"}'::jsonb,
  'an off-board cell is refused, and the detail names WHICH cell');

select pg_temp.envelope_is(pg_temp.submit('[[0,0],[2,2]]'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN426",
    "message":"BUG: a trace that jumps"}'::jsonb,
  'a jump is refused — 8-way adjacency is the rule');

select pg_temp.envelope_is(pg_temp.submit('[[0,0],[0,1],[0,0]]'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN427",
    "message":"BUG: a trace that crosses itself"}'::jsonb,
  'a self-crossing trace is refused');

-- ── Spent tiles lock ──
-- THE ONE RACE among the path checks: a teammate found a word overlapping the
-- path you were drawing, which the frontend cannot have known when it built it.
select strands.submit_path((select id from g), pg_temp.strands_row_path(0));
select pg_temp.envelope_is(pg_temp.submit(pg_temp.strands_prefix_path(0, 4)::text),
  '{"type":"not-ok","severity":"race","dbcode":"PN421",
    "message":"Crosses a found word"}'::jsonb,
  'a found word''s tiles are spent — tracing through them is refused');

select * from finish();
rollback;
