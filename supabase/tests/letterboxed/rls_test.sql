-- ============================================================
-- Test: letterboxed.events RLS — the three-arm select policy
-- ============================================================
-- In compete the events table IS the private data: every row names a word,
-- and a rival reading your rows mid-race is reading your chain. The policy's
-- three OR arms (the wordwheel shape), each pinned here:
--   (1) mode='coop'          — one shared chain; the whole club reads the log
--                              (including a club member who isn't seated —
--                              "watching" is club-membership, not playerhood).
--   (2) user_id = auth.uid() — you always see your own moves.
--   (3) is_terminal          — the race is over; open to everyone so the
--                              terminal can show how it was solved.
-- gameplay_test covers the players_state CHAIN mask; this file is about the
-- log rows themselves.

begin;

set search_path = letterboxed, common, public, extensions;

select plan(6);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('RLS club', array['ada','bea','cade']) as handle;

-- ── (1) Coop: the whole club reads the shared log ───────────
create temp table gco on commit drop as
select * from letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.lb_board()
);
select letterboxed.submit_word((select id from gco), 'adg');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from letterboxed.events where game_id = (select id from gco)),
  1,
  'coop: a teammate reads the other player''s log row'
);

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select count(*)::int from letterboxed.events where game_id = (select id from gco)),
  1,
  'coop: a club member who is not seated still reads the log (watching)'
);

-- ── (2) Compete mid-race: own rows only ─────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gcp on commit drop as
select * from letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.lb_board()
);
select letterboxed.submit_word((select id from gcp), 'adg');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.submit_word((select id from gcp), 'adg');

-- Two rows exist; each racer sees exactly their own.
select is(
  (select count(*)::int from letterboxed.events where game_id = (select id from gcp)),
  1,
  'compete mid-race: a racer sees only ONE of the two rows'
);
select is(
  (select distinct user_id from letterboxed.events where game_id = (select id from gcp)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  '…and it is their own'
);

-- ── (3) Terminal: the log opens ─────────────────────────────
-- The manual stop is the cheapest terminal to reach; the arm keys on
-- common.games.is_terminal, not on HOW it ended.
select letterboxed.end_game((select id from gcp));

select is(
  (select count(*)::int from letterboxed.events where game_id = (select id from gcp)),
  2,
  'compete terminal: both players'' rows are readable'
);
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select count(*)::int from letterboxed.events where game_id = (select id from gcp)),
  2,
  '…by the whole club, seated or not'
);

select * from finish();
rollback;
