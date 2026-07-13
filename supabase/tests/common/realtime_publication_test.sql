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
-- the whole app — the model is src/schemaExposure.e2e.test.ts, which
-- probes every registered schema through PostgREST. The `expected`
-- VALUES list below IS the registry: one row per (schema, table) the FE
-- subscribes to. It is maintained BY HAND to mirror the TS channel
-- registry — when a hook adds or drops a postgres_changes subscription,
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
--   common     useCommonGame / useGameInvitations / useScratchpad /
--              useClubChat / ClubPage / HomePage
--   <game>     each game's hooks/useGame.ts (codenamesduet also
--              useBoard + useClues; crosswords via useCells; spellingbee
--              + wordwheel via the shared makeFoundWordsGame factory)
--
-- Deliberately NOT subscribed, therefore NOT published (their absence
-- from the list is itself the assertion):
--   common.clubs, common.profiles   no live subscriber
--   crosswords.games                 useGame is a one-shot fetch; status
--                                    flows through common.games instead
--   bananagrams has no game-schema `games` table — its live surface is
--   progress + player_boards; the game header flows through common.games.

begin;

set search_path = common, public, extensions;

select plan(1);

select set_eq(
  -- ACTUAL: every table our schemas publish to supabase_realtime.
  -- Scoped to our 14 schemas so Supabase-internal publications (if any)
  -- don't register as spurious "extra" rows.
  $$
    select schemaname::text, tablename::text
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = any (array[
         'common', 'codenamesduet', 'psychicnum', 'connections',
         'spellingbee', 'bananagrams', 'waffle', 'wordle', 'stackdown',
         'scrabble', 'boggle', 'crosswords', 'wordwheel', 'wordiply'])
  $$,
  -- EXPECTED: the FE postgres_changes subscription registry.
  $$
    values
      -- app shell (common)
      ('common'::text, 'games'::text),
      ('common', 'game_players'),
      ('common', 'game_scratchpads'),
      ('common', 'messages'),
      ('common', 'clubs_members'),
      -- codenamesduet (useGame + useBoard + useClues)
      ('codenamesduet', 'games'),
      ('codenamesduet', 'words'),
      ('codenamesduet', 'clues'),
      ('codenamesduet', 'guesses'),
      -- psychicnum
      ('psychicnum', 'games'),
      ('psychicnum', 'players'),
      ('psychicnum', 'guesses'),
      -- connections
      ('connections', 'games'),
      ('connections', 'players'),
      ('connections', 'guesses'),
      -- spellingbee (makeFoundWordsGame)
      ('spellingbee', 'games'),
      ('spellingbee', 'found_words'),
      -- bananagrams (no game-schema games table)
      ('bananagrams', 'progress'),
      ('bananagrams', 'player_boards'),
      -- waffle
      ('waffle', 'games'),
      ('waffle', 'players'),
      ('waffle', 'swaps'),
      -- wordle
      ('wordle', 'games'),
      ('wordle', 'players'),
      ('wordle', 'guesses'),
      -- stackdown
      ('stackdown', 'games'),
      ('stackdown', 'players'),
      ('stackdown', 'submissions'),
      -- scrabble
      ('scrabble', 'games'),
      ('scrabble', 'players'),
      ('scrabble', 'plays'),
      -- boggle
      ('boggle', 'games'),
      ('boggle', 'found_words'),
      -- crosswords (per-cell CDC only; games is one-shot, NOT published)
      ('crosswords', 'cells'),
      -- wordwheel (makeFoundWordsGame)
      ('wordwheel', 'games'),
      ('wordwheel', 'found_words'),
      -- wordiply
      ('wordiply', 'games'),
      ('wordiply', 'guesses')
  $$,
  'supabase_realtime membership == the FE postgres_changes subscription registry (missing ⇒ live updates die; extra ⇒ replication overhead)'
);

select * from finish();
rollback;
