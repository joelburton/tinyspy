-- ============================================================
-- Test: supabase_realtime publication membership (common schema)
-- ============================================================
--
-- The load-bearing invariant (see docs/supabase.md → "The publication
-- invariant"): every table a channel subscribes to via postgres_changes
-- MUST be in the `supabase_realtime` publication, or the Realtime server
-- rejects the channel's ENTIRE subscription and live updates silently die.
--
-- These common tables have live FE subscribers, so they MUST stay
-- published — this test is what catches an accidental removal (which
-- otherwise fails silently, with no error, just dead updates):
--   - clubs_members   HomePage home-clubs channel
--   - messages        useClubChat
--   - games           ClubPage club-games channel + useCommonGame
--   - game_players    useGameInvitations + useCommonGame
--   - game_scratchpads  useScratchpad
--
-- And these are deliberately UNpublished — pinned here so a thoughtless
-- re-add (pure replication overhead, no subscriber) gets a failing test
-- to explain itself against:
--   - clubs           no subscriber (the club-rename-liveness feature
--                     never shipped; removed 2026-07-12 supabase review)
--   - profiles        usernames are effectively immutable in a session

begin;

set search_path = common, public, extensions;

select plan(7);

-- Helper: 1 if the given common table is in the publication, else 0.
-- (Inline per-assertion rather than a temp function to keep it obvious.)

-- ── Must be published (live subscribers) ────────────────────────────
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'common' and tablename = 'clubs_members'),
  1, 'common.clubs_members is published (HomePage home-clubs channel)');

select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'common' and tablename = 'messages'),
  1, 'common.messages is published (useClubChat)');

select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'common' and tablename = 'games'),
  1, 'common.games is published (ClubPage list + useCommonGame)');

select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'common' and tablename = 'game_players'),
  1, 'common.game_players is published (invitations + useCommonGame)');

select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'common' and tablename = 'game_scratchpads'),
  1, 'common.game_scratchpads is published (useScratchpad)');

-- ── Deliberately NOT published (no subscriber) ──────────────────────
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'common' and tablename = 'clubs'),
  0, 'common.clubs is NOT published (no subscriber; club-rename liveness never shipped)');

select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'common' and tablename = 'profiles'),
  0, 'common.profiles is NOT published (usernames effectively immutable per session)');

select * from finish();
rollback;
