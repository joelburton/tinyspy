-- cs-unmet

-- ============================================================
-- Test: wordiply baseline schema invariants
-- ============================================================
--
-- The migration laid down the tables
-- and grants; this file exercises the schema *directly* — inserting
-- rows as the postgres superuser (bypassing the "no INSERT grant on
-- authenticated" rule) to set up the state we want to assert about.
--
-- What this file covers:
--   1. Both gametypes (wordiply_coop + wordiply_compete) are registered.
--   2. wordiply.games + wordiply.events exist with RLS ENABLED and the
--      authenticated SELECT grants the FE needs.
--   3. Nothing is hidden: base / max_word_len / longest_words /
--      legal_words are all granted (showing the longest word only once the
--      game has ended is the page's choice, not a server gate). The
--      games_state view the frontend read before the page blobs is gone.
--
-- RLS membership / coop-vs-compete visibility lives in rls_test.sql.

begin;

set search_path = wordiply, common, public, extensions;

select plan(8);

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
    where oid = 'wordiply.events'::regclass),
  true,
  'RLS is enabled on wordiply.events'
);

-- ============================================================
-- Set up: a wordiply game in ada+bea's club (direct insert)
-- ============================================================
-- A game still in play. The FK target row in common.games goes in first,
-- then the wordiply.games row.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada and Bea', array['ada','bea']) as handle;

reset role;

create temp table common_g (id uuid) on commit drop;
grant select on common_g to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, mode, title, setup)
  values (
    gen_random_uuid(),
    (select handle from club),
    'wordiply_coop',
    'coop',
    'AR',
    '{"dict_band": 5, "timer": {"kind": "none"}}'::jsonb
  )
  returning id
)
insert into common_g (id) select id from ins;

insert into wordiply.games
  (game_id, base, max_word_len, longest_words, legal_words)
values (
  (select id from common_g),
  'ar',
  7,
  '["hangars"]'::jsonb,
  '["bar","car","arc","hangars"]'::jsonb
);

-- A guess row so the events grant is exercised too.
insert into wordiply.events (game_id, user_id, kind, word, len, took_turn)
values (
  (select id from common_g),
  'ada11111-1111-1111-1111-111111111111',
  'guess', 'hangars', 7, true
);

-- ============================================================
-- authenticated can SELECT the (un-hidden) columns
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select base from wordiply.games where game_id = (select id from common_g)),
  'ar',
  'authenticated CAN SELECT wordiply.games.base (nothing hidden)'
);

select is(
  (select legal_words from wordiply.games where game_id = (select id from common_g)),
  '["bar","car","arc","hangars"]'::jsonb,
  'authenticated CAN SELECT legal_words directly (trust model: not withheld)'
);

select is(
  (select word from wordiply.events where game_id = (select id from common_g)),
  'hangars',
  'authenticated CAN SELECT wordiply.events rows (club member, coop)'
);

select is(
  (select max_word_len || ':' || (longest_words ->> 0)
     from wordiply.games where game_id = (select id from common_g)),
  '7:hangars',
  'authenticated CAN SELECT max_word_len and longest_words during play (the page waits to show them)'
);

-- ============================================================
-- The view the frontend read before the page blobs is gone
-- ============================================================

reset role;
select hasnt_view('wordiply', 'games_state', 'wordiply.games_state is gone: the page reads game_data');

-- Realtime publication membership for wordiply.games + guesses is guarded
-- centrally in ../common/realtime_publication_test.sql (the registry-driven
-- guard for every schema's subscribed tables).

select * from finish();
rollback;
