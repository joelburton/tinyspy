-- ============================================================
-- Test: freebee baseline schema invariants
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
--   2. The freebee.pangrams reference table is readable by
--      `authenticated` (the word list itself is now common.words).
--   3. The column-level grant on freebee.games blocks direct
--      SELECT of required_words / bonus_words for the
--      `authenticated` role.
--   4. The games_state view exposes the required_words answer key
--      conditionally on common.games.is_terminal: NULL pre-terminal,
--      the real value post-terminal. (bonus_words is never exposed.)
--   5. found_words.user_id ≠ caller-only — schema lets us
--      record a row attributed to ANY player.
--
-- RLS membership / coop-vs-compete visibility lives in
-- rls_test.sql. The two test files together form the
-- baseline assertions.
--
-- See ../tinyspy/create_game_test.sql for the pgTAP primer.

begin;

set search_path = freebee, common, public, extensions;

select plan(8);

\ir ../_shared/setup.psql

-- ============================================================
-- Gametype registration
-- ============================================================

select is(
  (
    select array_agg(gametype order by gametype)
      from common.gametypes where gametype like 'freebee%'
  ),
  array['freebee_compete', 'freebee_coop'],
  'freebee_coop + freebee_compete both registered in common.gametypes'
);

-- ============================================================
-- Public reference tables readable as authenticated
-- ============================================================
-- These are reference data — public SELECT, no RLS, no club
-- gating. The import script writes them; everyone reads them.

-- Seed a sentinel row as postgres so we have something to read.
-- (The actual data lands via the import script in normal use; here
-- we just confirm the read path.) The word reference itself now
-- lives in common.words, not freebee — only the freebee-specific
-- pangram seed pool is checked here.
reset role;
insert into freebee.pangrams (mask, required_words_count, has_rare_letters)
values (1::bigint, 30, false);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select count(*) from freebee.pangrams where mask = 1::bigint),
  1::bigint,
  'authenticated can SELECT from freebee.pangrams'
);

-- ============================================================
-- Set up: a freebee game in ada+bea's club
-- ============================================================
-- Direct insert (no RPC yet). Builds a non-terminal game first;
-- we'll flip it to terminal partway through to exercise the
-- conditional-exposure case.

create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

-- Switch to postgres to insert into freebee tables directly
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
    'freebee_coop',
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
insert into freebee.games
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
  array['oceaned']
);

-- ============================================================
-- Column-level grant blocks direct SELECT of hidden columns
-- ============================================================
-- The grant on freebee.games to authenticated enumerates every
-- column EXCEPT required_words and bonus_words. A direct
-- SELECT of either column should raise 42501.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- Match SQLSTATE only — Postgres reports "permission denied for
-- table games" (rather than column-specific text) when the
-- requested column has no grant, even on a table that has
-- column-level grants for other columns. Same pattern psychicnum
-- uses for its target-column denial test.
select throws_ok(
  format(
    $$ select required_words from freebee.games where id = %L::uuid $$,
    (select id from common_g)
  ),
  '42501',
  null,
  'direct SELECT of freebee.games.required_words is denied (column-level grant blocks it)'
);

select throws_ok(
  format(
    $$ select bonus_words from freebee.games where id = %L::uuid $$,
    (select id from common_g)
  ),
  '42501',
  null,
  'direct SELECT of freebee.games.bonus_words is denied (column-level grant blocks it)'
);

-- The non-hidden columns ARE selectable — sanity check that
-- the grant didn't accidentally exclude something it shouldn't.
select is(
  (select outer_letters from freebee.games where id = (select id from common_g)),
  'cabdno'::char(6),
  'authenticated CAN SELECT non-hidden columns (outer_letters) — column grant is precise'
);

-- ============================================================
-- games_state view: pre-terminal exposure rules
-- ============================================================
-- The view exposes required_words THROUGH the _required_words_for
-- helper. While common.games.is_terminal is false, it should be
-- NULL even for a club member. (bonus_words is never exposed.)

select is(
  (select required_words from freebee.games_state where id = (select id from common_g)),
  null::jsonb,
  'games_state.required_words is NULL while is_terminal=false (member sees row but not the answers)'
);

-- And the non-hidden columns DO surface via the view (sanity
-- check on the join inside the helpers).
select is(
  (select outer_letters from freebee.games_state where id = (select id from common_g)),
  'cabdno'::char(6),
  'games_state surfaces non-hidden columns regardless of terminal state'
);

-- ============================================================
-- games_state view: post-terminal exposure
-- ============================================================
-- Flip is_terminal to true (the terminal transition that
-- common.end_game would do in production), then re-query the
-- view. The required_words answer key should materialize.

reset role;
update common.games set is_terminal = true, play_state = 'ended'
 where id = (select id from common_g);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select required_words from freebee.games_state where id = (select id from common_g)),
  '[{"word":"acedone","points":17,"is_pangram":true},
    {"word":"bead","points":1,"is_pangram":false}]'::jsonb,
  'games_state.required_words surfaces post-terminal (helper CASE flips the gate)'
);

-- ============================================================
select * from finish();
rollback;
