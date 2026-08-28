-- cs-unmet

-- ============================================================
-- Test: connections.next_puzzle_for_club + connections.puzzle_for_date
-- ============================================================
--
-- The two lookups the setup dialog runs to say what Start will play — and the
-- FIRST RPCs in the roster that answer a question rather than change anything.
-- That is what these tests are about:
--
--   1. `data` is ONE puzzle, not an array. They used to `return table(...)`,
--      so every caller wrote `data?.[0] ?? null` to get back to the single
--      answer the question actually has.
--   2. **Empty is `ok` with `outcome: 'warning'`.** Nothing failed and nobody
--      erred — these players have simply done them all, or nothing was
--      published that day. `warning` says so without claiming a fault, and
--      `data: null` is a VALUE the function chose rather than an absence a
--      caller has to infer. (It could not be one until the envelope stopped
--      stripping its nulls.)
--   3. The callers keep their own words. Neither RPC writes a `message`,
--      because "none left" reads differently in the setup dialog than it does
--      on the new-game path, where it comes with somewhere to go next.
-- ============================================================

begin;

set search_path = connections, common, public, extensions;

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(8);

-- A KNOWN ARCHIVE. The dev database carries a thousand imported puzzles, and
-- "there is nothing left" cannot be tested against an archive that large — so
-- this file empties it and keeps only its own fixture. Inside the transaction,
-- and rolled back with everything else. `on delete set null` on games.puzzle_id
-- means this is safe even where a game referenced one.
delete from connections.puzzles;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- The fixture puzzle is dated 1900-01-01 and nobody has played it.
select pg_temp.connections_puzzle() as pz_id \gset

-- ============================================================
-- (1–3) next_puzzle_for_club — a puzzle nobody has done
-- ============================================================

select pg_temp.envelope_is(
  connections.next_puzzle_for_club(array['ada11111-1111-1111-1111-111111111111'::uuid]),
  '{"type":"ok","outcome":null,"severity":null,"message":null}'::jsonb,
  'a puzzle is waiting: ok, and no outcome to report'
);

select is(
  (connections.next_puzzle_for_club(array['ada11111-1111-1111-1111-111111111111'::uuid])
     -> 'data' ->> 'id')::uuid,
  :'pz_id'::uuid,
  'data is the puzzle itself — one object, not a row in an array'
);

-- The label is what the dialog SHOWS, so it is worth pinning: the date leads,
-- then the two alphabetically-first tiles as a fingerprint.
select is(
  connections.next_puzzle_for_club(array['ada11111-1111-1111-1111-111111111111'::uuid])
    -> 'data' ->> 'label',
  '1900-01-01: ALPHA, ANGEL',
  'the label names the date and two tiles'
);

-- ============================================================
-- (4–5) next_puzzle_for_club — the archive is spent
-- ============================================================
-- Play it, and there is nothing left for ada. The walk excludes a puzzle any
-- SEATED player has done, which is why unchecking someone can bring one back.

select (connections.create_game(
  (select pg_temp.create_club('Next puzzle', array['ada', 'bea'])),
  pg_temp.connections_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop')->'data'->>'id')::uuid as g_id \gset

select pg_temp.envelope_is(
  connections.next_puzzle_for_club(array['ada11111-1111-1111-1111-111111111111'::uuid]),
  '{"type":"ok","data":null,"outcome":"warning","severity":null}'::jsonb,
  'nothing left: still ok, with data null and outcome warning'
);

-- Bea has played nothing, so the same puzzle is hers to have — the answer is
-- about the PLAYERS asked about, not about the archive as a whole.
select is(
  (connections.next_puzzle_for_club(array['bea22222-2222-2222-2222-222222222222'::uuid])
     -> 'data' ->> 'id')::uuid,
  :'pz_id'::uuid,
  'a player who has not played it still gets it'
);

-- ============================================================
-- (6–8) puzzle_for_date — the override
-- ============================================================
-- It filters NOTHING: a date this club has already played is handed back, which
-- is how replaying one deliberately works.

select is(
  (connections.puzzle_for_date('1900-01-01') -> 'data' ->> 'id')::uuid,
  :'pz_id'::uuid,
  'a played date is still returned — the override filters nothing'
);

select pg_temp.envelope_is(
  connections.puzzle_for_date('1899-01-01'),
  '{"type":"ok","data":null,"outcome":"warning","severity":null}'::jsonb,
  'no puzzle that day: ok, data null, outcome warning'
);

select is(
  connections.puzzle_for_date('1900-01-01') -> 'data' ->> 'label',
  '1900-01-01: ALPHA, ANGEL',
  'the override builds the same label as the walk'
);

select * from finish();
rollback;
