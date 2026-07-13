-- ============================================================
-- Test: spellingbee baseline schema invariants
-- ============================================================
--
-- Phase-1 tests: the migration laid down the tables, grants,
-- helpers, and view. There are no RPCs yet (those land in
-- Phase 2), so this file exercises the schema *directly* —
-- inserting rows as the postgres superuser (bypassing the
-- "no INSERT grant on authenticated" rule) to set up the
-- state we want to assert about.
--
-- What this file covers:
--   1. The gametype is registered in common.gametypes.
--   2. The spellingbee.pangrams reference table is readable by
--      `authenticated` (the word list itself is now common.words).
--   3. The word lists are NOT hidden: required_words + bonus_words
--      are readable directly by `authenticated` (the FE validates
--      guesses against them locally; the trust model doesn't withhold).
--   4. The games_state view exposes both word lists unconditionally
--      (during play and at terminal) — the missed-words reveal is a
--      client-side `required − found` at terminal, not a server gate.
--
-- RLS membership / coop-vs-compete visibility lives in
-- rls_test.sql. The two test files together form the
-- baseline assertions.
--
-- See ../codenamesduet/create_game_test.sql for the pgTAP primer.

begin;

set search_path = spellingbee, common, public, extensions;

select plan(8);

\ir ../_shared/setup.psql

-- ============================================================
-- Gametype registration
-- ============================================================

select is(
  (
    select array_agg(gametype order by gametype)
      from common.gametypes where gametype like 'spellingbee%'
  ),
  array['spellingbee_compete', 'spellingbee_coop'],
  'spellingbee_coop + spellingbee_compete both registered in common.gametypes'
);

-- ============================================================
-- Public reference tables readable as authenticated
-- ============================================================
-- These are reference data — public SELECT, no RLS, no club
-- gating. The import script writes them; everyone reads them.

-- Seed a sentinel row as postgres so we have something to read.
-- (The actual data lands via the import script in normal use; here
-- we just confirm the read path.) The word reference itself now
-- lives in common.words, not spellingbee — only the spellingbee-specific
-- pangram seed pool is checked here.
reset role;
insert into spellingbee.pangrams (mask, required_words_count, has_rare_letters)
values (1::bigint, 30, false);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select count(*) from spellingbee.pangrams where mask = 1::bigint),
  1::bigint,
  'authenticated can SELECT from spellingbee.pangrams'
);

-- ============================================================
-- Set up: a spellingbee game in ada+bea's club
-- ============================================================
-- Direct insert (no RPC yet). Builds a non-terminal game first;
-- we'll flip it to terminal partway through to exercise the
-- conditional-exposure case.

create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

-- Switch to postgres to insert into spellingbee tables directly
-- (no INSERT grant exists on authenticated; this is the test-
-- only escape hatch).
reset role;

-- common.games first — the FK target. Setup is the canonical
-- coop shape we expect from create_game (Phase 2). Using a CTE
-- with the INSERT…RETURNING wrapped inside a `with ins as (...)`
-- because `CREATE TEMP TABLE ... AS INSERT` isn't valid syntax
-- in Postgres (only AS SELECT is).
--
-- The temp table is created while we're still in postgres-
-- superuser role, so we explicitly grant SELECT to authenticated
-- (the role we'll switch to below). Without the grant, the
-- subsequent `select id from common_g` raises 42501 — temp
-- tables inherit no implicit grants.
create temp table common_g (id uuid) on commit drop;
grant select on common_g to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, title, setup, play_state, is_terminal)
  values (
    gen_random_uuid(),
    (select handle from club),
    'spellingbee_coop',
    'E·CABDNO',
    '{"timer": {"kind": "none"}}'::jsonb,
    'playing',
    false
  )
  returning id
)
insert into common_g (id) select id from ins;

-- The hidden wordlists. Small synthetic lists; they only need
-- to be present + retrievable. mode column added in the
-- sibling-manifest migration; lock to 'coop' here to match the
-- common.games gametype above.
insert into spellingbee.games
  (id, club_handle, mode, outer_letters, center_letter,
   required_words_score, required_words_count, required_words, bonus_words)
values (
  (select id from common_g),
  (select handle from club),
  'coop',
  'cabdno',
  'e',
  17,
  2,
  '[{"word":"acedone","points":17,"is_pangram":true},
    {"word":"bead","points":1,"is_pangram":false}]'::jsonb,
  '[{"word":"oceaned","points":7,"is_pangram":false}]'::jsonb
);

-- ============================================================
-- The word lists are readable directly (no longer hidden)
-- ============================================================
-- The grant on spellingbee.games to authenticated now includes
-- required_words + bonus_words — the FE needs them to validate
-- guesses locally, and the trust model doesn't withhold them.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select required_words from spellingbee.games where id = (select id from common_g)),
  '[{"word":"acedone","points":17,"is_pangram":true},
    {"word":"bead","points":1,"is_pangram":false}]'::jsonb,
  'authenticated CAN SELECT required_words directly (un-gated)'
);

select is(
  (select bonus_words from spellingbee.games where id = (select id from common_g)),
  '[{"word":"oceaned","points":7,"is_pangram":false}]'::jsonb,
  'authenticated CAN SELECT bonus_words directly (un-gated)'
);

select is(
  (select outer_letters from spellingbee.games where id = (select id from common_g)),
  'cabdno'::char(6),
  'authenticated CAN SELECT the non-list columns (outer_letters) too'
);

-- ============================================================
-- games_state view: exposes both lists during play
-- ============================================================
-- No terminal gate anymore — required_words is present from game start (the
-- reveal is a client-side computation at terminal).

select is(
  (select required_words from spellingbee.games_state where id = (select id from common_g)),
  '[{"word":"acedone","points":17,"is_pangram":true},
    {"word":"bead","points":1,"is_pangram":false}]'::jsonb,
  'games_state.required_words is present during play (un-gated)'
);

select is(
  (select outer_letters from spellingbee.games_state where id = (select id from common_g)),
  'cabdno'::char(6),
  'games_state surfaces the non-list columns too'
);

-- ============================================================
-- games_state view: still exposed at terminal
-- ============================================================
-- Flip is_terminal to true; required_words stays exposed (it always was) — the
-- terminal transition no longer changes what the view returns.

reset role;
update common.games set is_terminal = true, play_state = 'ended'
 where id = (select id from common_g);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select required_words from spellingbee.games_state where id = (select id from common_g)),
  '[{"word":"acedone","points":17,"is_pangram":true},
    {"word":"bead","points":1,"is_pangram":false}]'::jsonb,
  'games_state.required_words remains exposed post-terminal'
);

-- Realtime publication membership for spellingbee.games + found_words is
-- guarded centrally in ../common/realtime_publication_test.sql (the
-- registry-driven guard for every schema's subscribed tables).

select * from finish();
rollback;
