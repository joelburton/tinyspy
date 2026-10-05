-- cs-unmet

-- ============================================================
-- Test: stackdown RLS — the club-member gate
-- ============================================================
--
-- stackdown shipped without an rls_test. The
-- hidden-solution reveal is covered in reveal_test.sql; this file covers the
-- ROW-visibility policies, which had no test:
--
--   games_select       club-member gate (both modes identical).
--   players_select     club-member gate (n_found_words is a public tally).
--   events_select      club-member gate, in both modes, mid-race or not. Who
--                      may see a rival's rows mid-race is the hook's rule
--                      (src/stackdown/hooks/useGame.ts), applied to the page
--                      blob; nothing reads this table from the client.
--
-- Direct-INSERT setup (as postgres) so the read policy is exercised on its own.
-- Personas: ada + bea + cade in the club; dee is the outsider.

begin;

set search_path = stackdown, common, public, extensions;

select plan(10);

\ir ../_shared/setup.psql

-- ============================================================
-- Set up: 3-member club + a COOP game with a submission per player
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;

reset role;
create temp table coop_game (id uuid) on commit drop;
grant select on coop_game to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, mode, title, setup)
  values (
    gen_random_uuid(),
    (select handle from club),
    'stackdown_coop',
    'coop',
    'Stack',
    '{"timer": {"kind": "none"}}'::jsonb
  )
  returning id
)
insert into coop_game (id) select id from ins;

-- tiles/solution are required-not-null; their exact values don't matter to
-- the row-visibility policies (solution is column-hidden anyway).
insert into stackdown.games (game_id, tiles, solution)
values (
  (select id from coop_game),
  '[]'::jsonb, array['eagle','table','plans','apple','juice','lemon']
);

insert into stackdown.players (game_id, user_id, n_found_words) values
  ((select id from coop_game), 'ada11111-1111-1111-1111-111111111111', 1),
  ((select id from coop_game), 'bea22222-2222-2222-2222-222222222222', 1),
  ((select id from coop_game), 'cade3333-3333-3333-3333-333333333333', 1);

insert into stackdown.events (game_id, user_id, kind, word, tile_ids, valid, took_turn) values
  ((select id from coop_game), 'ada11111-1111-1111-1111-111111111111', 'word', 'EAGLE', array[19,11,15,24,10], true, true),
  ((select id from coop_game), 'bea22222-2222-2222-2222-222222222222', 'word', 'TABLE', array[6,20,5,2,0], true, true),
  ((select id from coop_game), 'cade3333-3333-3333-3333-333333333333', 'word', 'PLANS', array[7,12,16,3,8], true, true);

-- ============================================================
-- Coop mode: every club member sees the whole shared log (branch a)
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from stackdown.events where game_id = (select id from coop_game)),
  3::bigint,
  'coop / ada (member): sees all 3 submissions'
);

select is(
  (select count(*) from stackdown.players where game_id = (select id from coop_game)),
  3::bigint,
  'coop / ada (member): sees all 3 player rows (players_select membership gate)'
);

-- ============================================================
-- Non-member sees nothing — games, players, submissions
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

select is(
  (select count(*) from stackdown.games where game_id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from stackdown.games'
);

select is(
  (select count(*) from stackdown.players where game_id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from stackdown.players'
);

select is(
  (select count(*) from stackdown.events where game_id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from stackdown.events'
);

-- ============================================================
-- Direct INSERT into stackdown.events is blocked at the grant layer
-- ============================================================
-- No INSERT grant for authenticated; writes go through submit_word. Pins the
-- boundary so a future migration doesn't widen it.

select throws_ok(
  format(
    $$ insert into stackdown.events (game_id, user_id, kind, word, tile_ids, valid, took_turn)
       values (%L::uuid, 'dee44444-4444-4444-4444-444444444444', 'word', 'SNEAK', array[0,1,2,3,4], true, true) $$,
    (select id from coop_game)
  ),
  '42501',
  'permission denied for table events',
  'direct INSERT into stackdown.events is blocked for authenticated'
);

-- ============================================================
-- Compete mode: a racer reads every row, mid-race
-- ============================================================

reset role;
create temp table compete_game (id uuid) on commit drop;
grant select on compete_game to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, mode, title, setup)
  values (
    gen_random_uuid(),
    (select handle from club),
    'stackdown_compete',
    'compete',
    'Stack compete',
    '{"timer": {"kind": "none"}}'::jsonb
  )
  returning id
)
insert into compete_game (id) select id from ins;

insert into stackdown.games (game_id, tiles, solution)
values (
  (select id from compete_game),
  '[]'::jsonb, array['eagle','table','plans','apple','juice','lemon']
);

insert into stackdown.events (game_id, user_id, kind, word, tile_ids, valid, took_turn) values
  ((select id from compete_game), 'ada11111-1111-1111-1111-111111111111', 'word', 'EAGLE', array[19,11,15,24,10], true, true),
  ((select id from compete_game), 'bea22222-2222-2222-2222-222222222222', 'word', 'TABLE', array[6,20,5,2,0], true, true),
  ((select id from compete_game), 'cade3333-3333-3333-3333-333333333333', 'word', 'PLANS', array[7,12,16,3,8], true, true);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from stackdown.events where game_id = (select id from compete_game)),
  3::bigint,
  'compete mid-game / ada: reads all 3 rows'
);

select is(
  (select count(distinct user_id) from stackdown.events where game_id = (select id from compete_game)),
  3::bigint,
  'compete mid-game / ada: her own and both rivals'''
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from stackdown.events where game_id = (select id from compete_game)),
  3::bigint,
  'compete mid-game / bea: reads all 3 rows too'
);

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*) from stackdown.events where game_id = (select id from compete_game)),
  0::bigint,
  'compete / dee (outsider): none of a race''s rows'
);

-- ============================================================
select * from finish();
rollback;
