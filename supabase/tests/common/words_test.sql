-- ============================================================
-- Test: common.words definition columns + common.cache_definition
-- ============================================================
--
-- common.words is the shared master word list; its `definition` /
-- `definition_source` columns power the click-to-define popover +
-- "look up any word" shortcut (see docs/common.md → The word list).
-- Coverage:
--   - grants: authenticated can SELECT (public reference data) but
--     CANNOT UPDATE directly or EXECUTE cache_definition — writes
--     funnel through the Edge Function (service_role) so clients
--     can't inject junk defs.
--   - cache_definition logic: it's an UPDATE of an existing row —
--     fills a never-looked word, writes a NULL tombstone for a
--     not-found word, NEVER clobbers an existing (seeded) def, is a
--     NO-OP for a word not in the list (we never invent rows), and
--     lowercases the word key.
--   - the definition_source CHECK + the generated letter_mask column.
--
-- Self-contained: seeds its own synthetic words (prefix `zzwordtest`).
-- common.words is empty after db:reset (the bulk import is a separate
-- step), so these are the only rows; the prefix also keeps them from
-- colliding with the real list if the import has been run.

begin;

set search_path = common, public, extensions;

\ir ../_shared/setup.psql

select plan(10);

-- Seed synthetic rows as postgres. All NOT NULL columns supplied;
-- letter_mask is generated. `alpha` carries a seeded gloss whose
-- non-null def must survive a later API write; `beta`/`gamma`/`upper`
-- start with no definition (definition_source NULL = never looked up).
reset role;
insert into common.words
  (word, difficulty, american, british, canadian, australian, len,
   definition, definition_source)
values
  ('zzwordtestalpha', 1, true, true, true, true, 15,
   'a synthetic gloss {ref=n} [n]', 's'),
  ('zzwordtestbeta',  1, true, true, true, true, 14, null, null),
  ('zzwordtestgamma', 1, true, true, true, true, 15, null, null),
  ('zzwordtestupper', 1, true, true, true, true, 15, null, null);

-- ============================================================
-- Grants — what authenticated can and can't do
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select definition from common.words where word = 'zzwordtestalpha'),
  'a synthetic gloss {ref=n} [n]',
  'authenticated can SELECT definitions (public reference data)'
);

select throws_ok(
  $$ update common.words set definition = 'x' where word = 'zzwordtestalpha' $$,
  '42501',
  NULL,
  'authenticated cannot UPDATE common.words directly — writes funnel through cache_definition'
);

select throws_ok(
  $$ select common.cache_definition('zzwordtestbeta', 'x', 'w') $$,
  '42501',
  NULL,
  'authenticated cannot EXECUTE cache_definition (service_role only — no junk injection)'
);

-- ============================================================
-- cache_definition logic — run as postgres (can execute the
-- service_role-granted definer)
-- ============================================================

reset role;

-- (4) never-looked word, Wiktionary had nothing → NULL tombstone
select common.cache_definition('zzwordtestgamma', NULL, 'w');
select ok(
  (select definition is null and definition_source = 'w'
     from common.words where word = 'zzwordtestgamma'),
  'cache_definition writes a NULL tombstone (source w) for a not-found word'
);

-- (5) never-looked word, a real def → fills it
select common.cache_definition('zzwordtestbeta', 'now defined', 'w');
select is(
  (select definition from common.words where word = 'zzwordtestbeta'),
  'now defined',
  'cache_definition fills a never-looked word with a definition'
);

-- (6) the never-clobber guard: a seeded def is not overwritten
select common.cache_definition('zzwordtestalpha', 'WIKTIONARY OVERWRITE', 'w');
select is(
  (select definition from common.words where word = 'zzwordtestalpha'),
  'a synthetic gloss {ref=n} [n]',
  'cache_definition never overwrites an existing non-null def (seeded gloss preserved)'
);

-- (7) NO-OP for a word not in the list — we never invent rows
select common.cache_definition('zzwordtestabsent', 'should not appear', 'w');
select ok(
  not exists (select 1 from common.words where word = 'zzwordtestabsent'),
  'cache_definition is a no-op for a word not in common.words (never inserts)'
);

-- (8) word key is lowercased
select common.cache_definition('ZZWORDTESTUPPER', 'mixed case key', 'w');
select is(
  (select definition from common.words where word = 'zzwordtestupper'),
  'mixed case key',
  'cache_definition lowercases the word key'
);

-- (9) definition_source CHECK rejects an unknown one-char code
select throws_ok(
  $$ insert into common.words
       (word, difficulty, american, british, canadian, australian, len,
        definition_source)
     values ('zzwordtestbad', 1, true, true, true, true, 13, 'x') $$,
  '23514',
  NULL,
  'definition_source CHECK rejects an unknown code'
);

-- (10) letter_mask is generated correctly (bit 0 = a). 'bee' → b(1)+e(4)
select is(
  common.word_letter_mask('bee'),
  18::bigint,
  'word_letter_mask encodes distinct letters (bit 0 = a): bee = 18'
);

select * from finish();
rollback;
