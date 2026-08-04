-- ============================================================
-- Test: FK on-delete rules — the deletion firewall (2026-08-04)
-- ============================================================
--
-- Users, clubs, and gametypes are never deleted through the app; the
-- only ways a delete could reach them are a bug or a fat-fingered psql
-- statement. These six FKs are therefore ON DELETE RESTRICT — a
-- firewall that turns "one statement silently erased every club the
-- user created, and every game in them" into an immediate error:
--
--   profiles → auth.users        deleting an auth user with a profile
--   clubs.created_by → profiles  deleting a profile that created clubs
--   clubs_members → profiles     deleting a profile in any club
--   clubs_members → clubs        deleting a club with members (i.e. all:
--                                the creator is always a member)
--   games → clubs                deleting a club with games
--   games → gametypes            deleting a gametype with games — a
--                                gametype removal must delete its games
--                                FIRST, deliberately
--
-- Everything BELOW the firewall stays CASCADE on purpose: those edges
-- can no longer be reached by an accidental top-level delete, but a
-- deliberate ordered teardown (delete_game today; a future delete_club
-- RPC) still gets clean leaf removal for free. Assertion 2 pins the
-- load-bearing half of that: every FK referencing common.games must
-- cascade, or common.delete_game() stops being a total teardown and
-- starts throwing FK errors (or worse, leaving orphans).
--
-- Both assertions are set_eq over pg_constraint, so they catch BOTH
-- directions: a RESTRICT quietly reverted to CASCADE, and a new
-- RESTRICT nobody meant to add.

begin;

set search_path = common, public, extensions;

select plan(2);

-- 1. The firewall: exactly these six FKs RESTRICT, nothing else.
select set_eq(
  -- (schema-qualified by hand: regclass::text drops the "common." prefix
  -- for anything on the search_path, which set_eq would then mismatch)
  $$
    select chn.nspname || '.' || ch.relname as child,
           pan.nspname || '.' || pa.relname as parent
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      join pg_class ch  on ch.oid = c.conrelid
      join pg_namespace chn on chn.oid = ch.relnamespace
      join pg_class pa  on pa.oid = c.confrelid
      join pg_namespace pan on pan.oid = pa.relnamespace
     where c.contype = 'f'
       and c.confdeltype = 'r'
       and n.nspname = any (array[
         'common', 'codenamesduet', 'psychicnum', 'connections',
         'spellingbee', 'bananagrams', 'waffle', 'wordle', 'stackdown',
         'scrabble', 'boggle', 'crosswords', 'wordwheel', 'wordiply'])
  $$,
  $$
    values
      ('common.profiles'::text,      'auth.users'::text),
      ('common.clubs',               'common.profiles'),
      ('common.clubs_members',       'common.clubs'),
      ('common.clubs_members',       'common.profiles'),
      ('common.games',               'common.clubs'),
      ('common.games',               'common.gametypes')
  $$,
  'the six firewall FKs are RESTRICT — and only those six'
);

-- 2. The teardown: every FK into common.games cascades, so
--    common.delete_game() removes a game completely in one statement.
select set_eq(
  $$
    select chn.nspname || '.' || ch.relname as child
      from pg_constraint c
      join pg_class ch  on ch.oid = c.conrelid
      join pg_namespace chn on chn.oid = ch.relnamespace
     where c.contype = 'f'
       and c.confrelid = 'common.games'::regclass
       and c.confdeltype = 'c'
  $$,
  $$
    values
      ('common.game_players'::text),
      ('common.game_scratchpads'),
      ('common.timers'),
      ('bananagrams.games'),
      ('boggle.games'),
      ('codenamesduet.games'),
      ('connections.games'),
      ('crosswords.games'),
      ('psychicnum.games'),
      ('scrabble.games'),
      ('spellingbee.games'),
      ('stackdown.games'),
      ('waffle.games'),
      ('wordiply.games'),
      ('wordle.games'),
      ('wordwheel.games')
  $$,
  'every FK into common.games cascades — delete_game stays a total teardown'
);

select * from finish();
rollback;
