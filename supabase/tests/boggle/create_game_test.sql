-- ============================================================
-- Test: boggle.create_game
-- ============================================================
-- Covers: coop happy path (header + per-game row + status), compete happy path,
-- and the validation guards (mode, compete player floor, band, ladder, dice_set,
-- the rejected setup.mode field, non-member).
-- See ../codenamesduet/create_game_test.sql for the pgTAP primer.

begin;
set search_path = boggle, common, public, extensions;
select plan(16);

\ir ../_shared/setup.psql
\ir setup.psql

-- ── Coop happy path ───────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Boggle Club', array['ada', 'bea', 'cade']) as handle;

create temp table g on commit drop as
select * from boggle.create_game(
  (select handle from club),
  pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.boggle_board()
);

select isnt((select id from g), null, 'create_game (coop) returns an id');
select is(
  (select count(*) from boggle.games where id = (select id from g)), 1::bigint,
  'create_game inserts one boggle.games row');
select is(
  (select mode from boggle.games where id = (select id from g)), 'coop',
  'boggle.games.mode = coop');
select is(
  (select required_words_count from boggle.games where id = (select id from g)), 6,
  'required_words_count cached = 6');
select is(
  (select n from boggle.games where id = (select id from g)), 4,
  'board side length n = 4');
select is(
  (select gametype from common.games where id = (select id from g)), 'boggle_coop',
  'common.games.gametype = boggle_coop');
select is(
  (select status->>'mode' from common.games where id = (select id from g)), 'coop',
  'status seeded with mode coop');
select is(
  (select (status->>'found_words_count')::int from common.games where id = (select id from g)), 0,
  'status found_words_count starts at 0');

-- ── Compete happy path ────────────────────────────────────
create temp table cg on commit drop as
select * from boggle.create_game(
  (select handle from club),
  pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.boggle_board()
);
select is(
  (select mode from boggle.games where id = (select id from cg)), 'compete',
  'create_game (compete) sets mode compete');
select is(
  (select status->>'mode' from common.games where id = (select id from cg)), 'compete',
  'compete status seeded with leaderboard');

-- ── Validation guards ─────────────────────────────────────
select throws_ok(
  $$ select boggle.create_game((select handle from club), pg_temp.boggle_setup(),
       array['ada11111-1111-1111-1111-111111111111'::uuid], 'sideways', pg_temp.boggle_board()) $$,
  'P0001', null, 'rejects an unknown mode');

select throws_ok(
  $$ select boggle.create_game((select handle from club), pg_temp.boggle_setup(),
       array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete', pg_temp.boggle_board()) $$,
  'P0001', null, 'compete with 1 player is rejected');

select throws_ok(
  $$ select boggle.create_game((select handle from club),
       pg_temp.boggle_setup() || '{"band": 9}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid,'bea22222-2222-2222-2222-222222222222'::uuid],
       'coop', pg_temp.boggle_board()) $$,
  'P0001', null, 'rejects band out of range');

select throws_ok(
  $$ select boggle.create_game((select handle from club),
       pg_temp.boggle_setup() || '{"scoring_ladder": "wacky"}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid,'bea22222-2222-2222-2222-222222222222'::uuid],
       'coop', pg_temp.boggle_board()) $$,
  'P0001', null, 'rejects an unknown scoring_ladder');

select throws_ok(
  $$ select boggle.create_game((select handle from club),
       pg_temp.boggle_setup() || '{"mode": "coop"}'::jsonb,
       array['ada11111-1111-1111-1111-111111111111'::uuid,'bea22222-2222-2222-2222-222222222222'::uuid],
       'coop', pg_temp.boggle_board()) $$,
  'P0001', null, 'rejects a stale setup.mode field');

-- Non-member (dee) cannot create in this club.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  $$ select boggle.create_game((select handle from club), pg_temp.boggle_setup(),
       array['dee44444-4444-4444-4444-444444444444'::uuid], 'coop', pg_temp.boggle_board()) $$,
  '42501', null, 'non-member is rejected with 42501');

select * from finish();
rollback;
