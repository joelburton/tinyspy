-- cs-unmet

-- ============================================================
-- Test: supabase_realtime publication membership — ALL schemas
-- ============================================================
--
-- THE load-bearing realtime invariant (docs/supabase.md → "The
-- publication invariant"): every table a channel subscribes to via
-- postgres_changes MUST be in the `supabase_realtime` publication, or
-- the Realtime server rejects the channel's ENTIRE subscription and
-- live updates silently die — no error, writes still persist, only a
-- manual refresh shows them. This regressed twice (spellingbee,
-- wordwheel) once the Realtime image began enforcing the rule.
--
-- This is the single, registry-driven guard for that invariant across
-- the whole app — the model is src/guards/schemaExposure.e2e.test.ts, which
-- probes every registered schema through PostgREST. The `expected`
-- VALUES list below IS the registry: one row per (schema, table) the FE
-- subscribes to. It is maintained BY HAND to mirror the hooks' table
-- subscriptions — when a hook adds or drops a postgres_changes subscription,
-- update this list. (Re-derive the truth any time with
-- `grep -rn "table:" src | grep -v .test.` — those are the filters.)
--
-- The single set_eq assertion catches BOTH failure directions, and
-- names the offending rows in either:
--   • a subscribed table MISSING from the publication → live updates die
--   • a table PUBLISHED but not subscribed            → pure replication
--     overhead (the 2026-07-12 review pruned two such — common.clubs and
--     crosswords.games — both correctly ABSENT below, so a thoughtless
--     re-add fails this test and has to justify itself).
--
-- Where the subscriptions live:
--   common.games             useClubGames (the club page's list)
--   common.game_players      useGameInvitations
--   common.game_scratchpads  useScratchpad
--   common.messages          useClubChat
--   common.clubs_members     HomePage
--
-- Deliberately NOT subscribed, therefore NOT published (their absence
-- from the list is itself the assertion):
--   common.clubs, common.profiles   no live subscriber
--   every game's own tables          a game page reads the blobs on
--                                    common.games and hears a move through
--                                    the `changed` Broadcast, not a row change
--                                    (src/common/realtime/doc.md)

begin;

set search_path = common, public, extensions;

select plan(1);

select set_eq(
  -- ACTUAL: every table our schemas publish to supabase_realtime.
  -- Scoped to our 16 schemas so Supabase-internal publications (if any)
  -- don't register as spurious "extra" rows.
  $$
    select schemaname::text, tablename::text
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = any (array[
         'common', 'codenamesduet', 'psychicnum', 'connections',
         'spellingbee', 'bananagrams', 'waffle', 'wordle', 'stackdown',
         'scrabble', 'boggle', 'crosswords', 'wordwheel', 'wordiply',
         'strands', 'letterboxed', 'setgame'])
  $$,
  -- EXPECTED: the FE postgres_changes subscription registry.
  $$
    values
      -- app shell (common)
      ('common'::text, 'games'::text),
      ('common', 'game_players'),
      ('common', 'game_scratchpads'),
      ('common', 'messages'),
      ('common', 'clubs_members')
  $$,
  'supabase_realtime membership == the FE postgres_changes subscription registry (missing ⇒ live updates die; extra ⇒ replication overhead)'
);

select * from finish();
rollback;
