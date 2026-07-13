-- ============================================================
-- Test: stackdown RLS — club gating + the compete-mode submissions policy
-- ============================================================
--
-- stackdown shipped without an rls_test (docs/test-audit.md → rec #3). The
-- hidden-solution reveal is covered in reveal_test.sql; this file covers the
-- ROW-visibility policies, which had no test:
--
--   games_select       club-member gate (both modes identical).
--   players_select     club-member gate (found_count/solved are public tallies).
--   submissions_select  the load-bearing mode-aware one (mirrors wordle.guesses):
--        (a) mode = 'coop'          — the whole log is club-readable (shared board)
--        (b) user_id = auth.uid()   — compete: own rows only, mid-game
--        (c) is_terminal = true     — compete: opponents' words reveal post-game
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
select common.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;

reset role;
create temp table coop_game (id uuid) on commit drop;
grant select on coop_game to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, title, setup, play_state, is_terminal)
  values (
    gen_random_uuid(),
    (select handle from club),
    'stackdown_coop',
    'Stack',
    '{"timer": {"kind": "none"}}'::jsonb,
    'playing',
    false
  )
  returning id
)
insert into coop_game (id) select id from ins;

-- tiles/solution are required-not-null; their exact values don't matter to
-- the row-visibility policies (solution is column-hidden anyway).
insert into stackdown.games (id, club_handle, mode, tiles, solution, band)
values (
  (select id from coop_game), (select handle from club), 'coop',
  '[]'::jsonb, array['eagle','table','plans','apple','juice','lemon'], 1
);

insert into stackdown.players (game_id, user_id, found_count) values
  ((select id from coop_game), 'ada11111-1111-1111-1111-111111111111', 1),
  ((select id from coop_game), 'bea22222-2222-2222-2222-222222222222', 1),
  ((select id from coop_game), 'cade3333-3333-3333-3333-333333333333', 1);

insert into stackdown.submissions (game_id, user_id, seq, kind, word, tile_ids, valid) values
  ((select id from coop_game), 'ada11111-1111-1111-1111-111111111111', 1, 'word', 'EAGLE', array[19,11,15,24,10], true),
  ((select id from coop_game), 'bea22222-2222-2222-2222-222222222222', 1, 'word', 'TABLE', array[6,20,5,2,0],   true),
  ((select id from coop_game), 'cade3333-3333-3333-3333-333333333333', 1, 'word', 'PLANS', array[7,12,16,3,8],  true);

-- ============================================================
-- Coop mode: every club member sees the whole shared log (branch a)
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from stackdown.submissions where game_id = (select id from coop_game)),
  3::bigint,
  'coop / ada (member): sees all 3 submissions (branch a: shared board)'
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
  (select count(*) from stackdown.games where id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from stackdown.games'
);

select is(
  (select count(*) from stackdown.players where game_id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from stackdown.players'
);

select is(
  (select count(*) from stackdown.submissions where game_id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from stackdown.submissions'
);

-- ============================================================
-- Direct INSERT into stackdown.submissions is blocked at the grant layer
-- ============================================================
-- No INSERT grant for authenticated; writes go through submit_word. Pins the
-- boundary so a future migration doesn't widen it.

select throws_ok(
  format(
    $$ insert into stackdown.submissions (game_id, user_id, seq, kind, word, tile_ids, valid)
       values (%L::uuid, 'dee44444-4444-4444-4444-444444444444', 9, 'word', 'SNEAK', array[0,1,2,3,4], true) $$,
    (select id from coop_game)
  ),
  '42501',
  'permission denied for table submissions',
  'direct INSERT into stackdown.submissions is blocked for authenticated'
);

-- ============================================================
-- Compete mode: viewer sees ONLY their own submissions while playing (b)
-- ============================================================

reset role;
create temp table compete_game (id uuid) on commit drop;
grant select on compete_game to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, title, setup, play_state, is_terminal)
  values (
    gen_random_uuid(),
    (select handle from club),
    'stackdown_compete',
    'Stack compete',
    '{"timer": {"kind": "none"}}'::jsonb,
    'playing',
    false
  )
  returning id
)
insert into compete_game (id) select id from ins;

insert into stackdown.games (id, club_handle, mode, tiles, solution, band)
values (
  (select id from compete_game), (select handle from club), 'compete',
  '[]'::jsonb, array['eagle','table','plans','apple','juice','lemon'], 1
);

insert into stackdown.submissions (game_id, user_id, seq, kind, word, tile_ids, valid) values
  ((select id from compete_game), 'ada11111-1111-1111-1111-111111111111', 1, 'word', 'EAGLE', array[19,11,15,24,10], true),
  ((select id from compete_game), 'bea22222-2222-2222-2222-222222222222', 1, 'word', 'TABLE', array[6,20,5,2,0],   true),
  ((select id from compete_game), 'cade3333-3333-3333-3333-333333333333', 1, 'word', 'PLANS', array[7,12,16,3,8],  true);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from stackdown.submissions where game_id = (select id from compete_game)),
  1::bigint,
  'compete mid-game / ada: sees only her own submission (branch b)'
);

select is(
  (select user_id from stackdown.submissions where game_id = (select id from compete_game)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'compete mid-game / ada: the row she sees IS her own'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from stackdown.submissions where game_id = (select id from compete_game)),
  1::bigint,
  'compete mid-game / bea: sees only her own submission'
);

-- ============================================================
-- Compete mode + terminal: branch (c) opens the reveal
-- ============================================================

reset role;
update common.games set is_terminal = true, play_state = 'won_compete'
 where id = (select id from compete_game);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from stackdown.submissions where game_id = (select id from compete_game)),
  3::bigint,
  'compete post-terminal / ada: sees all 3 submissions (branch c: is_terminal)'
);

-- ============================================================
select * from finish();
rollback;
