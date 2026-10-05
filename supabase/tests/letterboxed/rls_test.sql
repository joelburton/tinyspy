-- cs-unmet

-- ============================================================
-- Test: letterboxed.events RLS — the club-member gate
-- ============================================================
-- The policy is the member gate alone: a club member reads every row of the
-- log, in both modes, mid-race or not, and nobody outside the club reads any.
-- Who may see a rival's rows mid-race is the hook's rule
-- (src/letterboxed/hooks/useGame.ts), applied to `game_data`; nothing reads
-- this table from the client. Pinned here:
--   (1) coop: a teammate, and a member who isn't seated, read the log
--   (2) compete mid-race: a racer reads both racers' rows
--   (3) outside the club: nothing

begin;

set search_path = letterboxed, common, public, extensions;

select plan(6);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('RLS club', array['ada','bea','cade']) as handle;

-- ── (1) Coop: the whole club reads the shared log ───────────
create temp table gco on commit drop as
select (letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.lb_board()
)->'data'->>'id')::uuid as id;
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
  'coop: a club member who is not seated still reads the log'
);

-- ── (2) Compete mid-race: every row ─────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gcp on commit drop as
select (letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.lb_board()
)->'data'->>'id')::uuid as id;
select letterboxed.submit_word((select id from gcp), 'adg');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.submit_word((select id from gcp), 'adg');

-- Two rows exist, and a racer reads both: withholding the rival's is the hook's.
select is(
  (select count(*)::int from letterboxed.events where game_id = (select id from gcp)),
  2,
  'compete mid-race: a racer reads both rows'
);
select is(
  (select count(distinct user_id)::int from letterboxed.events where game_id = (select id from gcp)),
  2,
  '…their own and the rival''s'
);

-- ── (3) Outside the club: nothing ───────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from letterboxed.events where game_id = (select id from gco)),
  0,
  'a non-member reads none of a coop game''s log'
);
select is(
  (select count(*)::int from letterboxed.events where game_id = (select id from gcp)),
  0,
  '…nor of a race''s'
);

select * from finish();
rollback;
