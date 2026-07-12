-- ============================================================
-- Test: wordiply baseline schema invariants
-- ============================================================
--
-- A fork of wordwheel's schema_test. The migration laid down the tables,
-- grants, and view; this file exercises the schema *directly* — inserting
-- rows as the postgres superuser (bypassing the "no INSERT grant on
-- authenticated" rule) to set up the state we want to assert about.
--
-- What this file covers:
--   1. Both gametypes (wordiply_coop + wordiply_compete) are registered.
--   2. wordiply.games + wordiply.guesses exist with RLS ENABLED and the
--      authenticated SELECT grants the FE needs.
--   3. Nothing is hidden: the games_state view exposes base / difficulty /
--      max_word_length / longest_words / legal_words (the "reveal scores at
--      terminal" rule is an FE display choice, not a server gate).
--   4. BOTH wordiply.games AND wordiply.guesses are members of the
--      supabase_realtime publication — the load-bearing LIVE-play invariant.
--      useGame subscribes to postgres_changes on both (guesses for the live
--      guess log, games for replay_board's realtime touch), and Realtime
--      rejects a channel's WHOLE postgres_changes subscription if any bound
--      table is unpublished — so a missing games line silently kills guesses
--      delivery too. These two assertions guard both lines.
--
-- RLS membership / coop-vs-compete visibility lives in gameplay_test.sql.

begin;

set search_path = wordiply, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql

-- ============================================================
-- Gametype registration
-- ============================================================

select is(
  (
    select array_agg(gametype order by gametype)
      from common.gametypes where gametype like 'wordiply%'
  ),
  array['wordiply_compete', 'wordiply_coop'],
  'wordiply_coop + wordiply_compete both registered in common.gametypes'
);

-- ============================================================
-- RLS enabled on both tables
-- ============================================================

select is(
  (select relrowsecurity from pg_class
    where oid = 'wordiply.games'::regclass),
  true,
  'RLS is enabled on wordiply.games'
);

select is(
  (select relrowsecurity from pg_class
    where oid = 'wordiply.guesses'::regclass),
  true,
  'RLS is enabled on wordiply.guesses'
);

-- ============================================================
-- Set up: a wordiply game in ada+bea's club (direct insert)
-- ============================================================
-- A non-terminal game we'll later flip terminal. The FK target row in
-- common.games goes in first, then the wordiply.games row.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

reset role;

create temp table common_g (id uuid) on commit drop;
grant select on common_g to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, title, setup, play_state, is_terminal)
  values (
    gen_random_uuid(),
    (select handle from club),
    'wordiply_coop',
    'AR · best 7',
    '{"difficulty": 5, "timer": {"kind": "none"}}'::jsonb,
    'playing',
    false
  )
  returning id
)
insert into common_g (id) select id from ins;

insert into wordiply.games
  (id, club_handle, mode, base, difficulty,
   max_word_length, longest_words, legal_words)
values (
  (select id from common_g),
  (select handle from club),
  'coop',
  'ar',
  5,
  7,
  '["hangars"]'::jsonb,
  '["bar","car","arc","hangars"]'::jsonb
);

-- A guess row so the guesses grant is exercised too.
insert into wordiply.guesses (game_id, user_id, word, length, guess_index)
values (
  (select id from common_g),
  'ada11111-1111-1111-1111-111111111111',
  'hangars', 7, 1
);

-- ============================================================
-- authenticated can SELECT the (un-hidden) columns
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select base from wordiply.games where id = (select id from common_g)),
  'ar',
  'authenticated CAN SELECT wordiply.games.base (nothing hidden)'
);

select is(
  (select legal_words from wordiply.games where id = (select id from common_g)),
  '["bar","car","arc","hangars"]'::jsonb,
  'authenticated CAN SELECT legal_words directly (trust model: not withheld)'
);

select is(
  (select word from wordiply.guesses where game_id = (select id from common_g)),
  'hangars',
  'authenticated CAN SELECT wordiply.guesses rows (club member, coop)'
);

-- ============================================================
-- games_state view exposes everything (no terminal gate)
-- ============================================================

select is(
  (select base from wordiply.games_state where id = (select id from common_g)),
  'ar',
  'games_state.base is exposed during play'
);

select is(
  (select difficulty from wordiply.games_state where id = (select id from common_g)),
  5::smallint,
  'games_state.difficulty is exposed'
);

select is(
  (select max_word_length from wordiply.games_state where id = (select id from common_g)),
  7,
  'games_state.max_word_length is exposed'
);

select is(
  (select longest_words from wordiply.games_state where id = (select id from common_g)),
  '["hangars"]'::jsonb,
  'games_state.longest_words is exposed (FE only RENDERS it at terminal)'
);

-- ============================================================
-- Realtime publication membership (LIVE-play invariant)
-- ============================================================
-- BOTH guesses AND games must be in supabase_realtime. useGame subscribes to
-- postgres_changes on each, and Realtime rejects a channel's ENTIRE
-- postgres_changes subscription if any bound table is unpublished — so a
-- missing games line silently kills guesses delivery too. This guards both.

reset role;
select is(
  (select count(*)::int
     from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'wordiply'
      and tablename = 'guesses'),
  1,
  'wordiply.guesses is published to supabase_realtime (live guess-log updates)'
);
select is(
  (select count(*)::int
     from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'wordiply'
      and tablename = 'games'),
  1,
  'wordiply.games is published to supabase_realtime (replay touch; keeps the whole channel valid)'
);

-- ============================================================
select * from finish();
rollback;
