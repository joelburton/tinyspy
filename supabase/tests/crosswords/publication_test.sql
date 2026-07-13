-- ============================================================
-- Test: supabase_realtime publication membership (crosswords schema)
-- ============================================================
--
-- The load-bearing invariant (see docs/supabase.md → "The publication
-- invariant"): a table a channel subscribes to via postgres_changes MUST
-- be in `supabase_realtime`, or the Realtime server rejects the channel's
-- ENTIRE subscription and live updates silently die.
--
--   - cells   MUST be published — useCells subscribes to per-cell UPDATEs
--             (the direct-apply "newer wins" CDC hook). This is the whole
--             of crosswords' live play; guard it against silent removal.
--   - games   deliberately UNpublished — useGame is a one-shot fetch and
--             status flows through common.games, so nothing subscribes.
--             It was published-with-touch-updates as ready-made wiring;
--             pruned in the 2026-07-12 supabase review since a
--             published-but-unsubscribed table is pure overhead. Pinned
--             here so a re-add has to justify itself against a failing test.

begin;

set search_path = crosswords, public, extensions;

select plan(2);

select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'crosswords' and tablename = 'cells'),
  1, 'crosswords.cells is published (useCells per-cell CDC — load-bearing)');

select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'crosswords' and tablename = 'games'),
  0, 'crosswords.games is NOT published (useGame is one-shot; no subscriber)');

select * from finish();
rollback;
