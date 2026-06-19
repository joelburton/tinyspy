-- ============================================================
-- Test: common.definitions table + common.cache_definition RPC
-- ============================================================
--
-- The shared word→definition cache that powers the click-to-define
-- popover + "look up any word" shortcut (see docs/common.md).
-- Coverage:
--   - grants: authenticated can SELECT (public reference data) but
--     CANNOT INSERT directly or EXECUTE cache_definition — writes
--     funnel through the Edge Function (service_role) so clients
--     can't inject junk defs.
--   - cache_definition logic: writes a NULL tombstone for a
--     not-found word; fills a tombstone on a later hit; and NEVER
--     clobbers an existing non-null def (the seeded Scrabble gloss
--     beats a later Wiktionary write).
--   - source CHECK constraint.
--
-- Self-contained: seeds its own synthetic words (prefix
-- `zzdeftest`) so it neither depends on the scrabble import having
-- run nor collides with the 192k real rows when it has.

begin;

set search_path = common, public, extensions;

\ir ../_shared/setup.psql

select plan(8);

-- Seed one "scrabble" row as postgres — stands in for an imported
-- gloss whose non-null def must survive a later API write.
reset role;
insert into common.definitions (word, def, source) values
  ('zzdeftestalpha', 'a synthetic test gloss [n]', 'scrabble');

-- ============================================================
-- Grants — what authenticated can and can't do
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select def from common.definitions where word = 'zzdeftestalpha'),
  'a synthetic test gloss [n]',
  'authenticated can SELECT definitions (public reference data)'
);

select throws_ok(
  $$ insert into common.definitions (word, def, source)
       values ('zzdeftesthack', 'x', 'scrabble') $$,
  '42501',
  'permission denied for table definitions',
  'authenticated cannot INSERT directly — writes funnel through cache_definition'
);

select throws_ok(
  $$ select common.cache_definition('zzdeftesthack', 'x', 'wiktionary') $$,
  '42501',
  NULL,
  'authenticated cannot EXECUTE cache_definition (service_role only — no junk injection)'
);

-- ============================================================
-- cache_definition logic — run as postgres (can execute the
-- service_role-granted definer)
-- ============================================================

reset role;

-- (4) not-found word → NULL tombstone (negative cache)
select common.cache_definition('zzdeftestgamma', NULL, 'wiktionary');
select ok(
  (select def is null from common.definitions where word = 'zzdeftestgamma'),
  'cache_definition writes a NULL tombstone for a not-found word'
);

-- (5) later hit fills the tombstone
select common.cache_definition('zzdeftestgamma', 'now defined', 'wiktionary');
select is(
  (select def from common.definitions where word = 'zzdeftestgamma'),
  'now defined',
  'cache_definition fills a NULL tombstone with a later definition'
);

-- (6) the never-clobber guard: a real def is not overwritten
select common.cache_definition('zzdeftestalpha', 'WIKTIONARY OVERWRITE', 'wiktionary');
select is(
  (select def from common.definitions where word = 'zzdeftestalpha'),
  'a synthetic test gloss [n]',
  'cache_definition never overwrites an existing non-null def (scrabble gloss preserved)'
);

-- (7) word key is lowercased
select common.cache_definition('ZZDEFTESTUPPER', 'mixed case key', 'wiktionary');
select ok(
  exists (select 1 from common.definitions where word = 'zzdeftestupper'),
  'cache_definition lowercases the word key'
);

-- (8) source CHECK rejects an unknown source
select throws_ok(
  $$ insert into common.definitions (word, def, source)
       values ('zzdeftestbad', 'y', 'google') $$,
  '23514',
  NULL,
  'source CHECK rejects an unknown source value'
);

select * from finish();
rollback;
