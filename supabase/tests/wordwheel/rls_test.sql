-- cs-blessed-wordwheel

-- ============================================================
-- Test: wordwheel RLS — club gating
-- ============================================================
--
-- One layer of access control on wordwheel.found_words and wordwheel.games: a
-- reader must be a member of the game's club (the same shape as every other
-- gametype's SELECT RLS). The tables carry no mode arm: who may see a rival's
-- finds mid-race is the page's rule, the hook's seat rule over `game_data`
-- (src/wordwheel/doc.md → Schema).
--
-- This file sets state with direct INSERTs as postgres, so the gate is proved
-- on its own, apart from the RPCs. Personas: ada + bea + cade in the test
-- club; dee is the outsider. (Naming convention: see ../_shared/setup.psql.)

begin;

set search_path = wordwheel, common, public, extensions;

select plan(7);

\ir ../_shared/setup.psql

-- ============================================================
-- Set up: 3-member club + a wordwheel game in COOP mode + finds
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;

reset role;
-- A coop game still in play. CTE wrapping the INSERT…RETURNING
-- because `CREATE TEMP TABLE ... AS INSERT` isn't valid syntax
-- in Postgres (only AS SELECT is). Temp tables created as
-- postgres need an explicit grant to authenticated so the
-- as_user-switched test body can read them back.
create temp table coop_game (id uuid) on commit drop;
grant select on coop_game to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, mode, title, setup)
  values (
    gen_random_uuid(),
    (select handle from club),
    'wordwheel_coop',
    'coop',
    'E·CABDFGHI',
    '{"timer": {"kind": "none"}}'::jsonb
  )
  returning id
)
insert into coop_game (id) select id from ins;

insert into wordwheel.games
  (game_id, outer_letters, center_letter,
   required_words_score, required_words_count, required_words, bonus_words,
   required_band, legal_band)
values (
  (select id from coop_game),
  'cabdfghi', 'e', 24, 2,
  '[]'::jsonb, '[]'::jsonb, 3, 5
);

-- Three found_words rows, one per player. Every member sees all three. Words are isograms of
-- the wheel + center 'e'.
insert into wordwheel.found_words (game_id, user_id, word, points, is_pangram, is_bonus) values
  ((select id from coop_game),
   'ada11111-1111-1111-1111-111111111111', 'bead', 1, false, false),
  ((select id from coop_game),
   'bea22222-2222-2222-2222-222222222222', 'face', 1, false, false),
  ((select id from coop_game),
   'cade3333-3333-3333-3333-333333333333', 'abcdefghi', 24, true, false);

-- ============================================================
-- Coop mode: everyone in the club sees everyone's finds
-- ============================================================


select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from wordwheel.found_words
    where game_id = (select id from coop_game)),
  3::bigint,
  'coop / ada (member): sees all 3 found_words including bea''s + cade''s'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from wordwheel.found_words
    where game_id = (select id from coop_game)),
  3::bigint,
  'coop / bea (member): sees all 3 found_words including ada''s + cade''s'
);

-- ============================================================
-- Non-member sees nothing — through games OR found_words
-- ============================================================
-- The club gate. dee is signed in but not in the club.

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

select is(
  (select count(*) from wordwheel.games where game_id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from wordwheel.games'
);

select is(
  (select count(*) from wordwheel.found_words
    where game_id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from wordwheel.found_words'
);

-- ============================================================
-- Direct INSERT into wordwheel tables is blocked at the grant layer
-- ============================================================
-- No INSERT grant for authenticated: writes go through the RPCs.
-- This pins the grant boundary so a future migration doesn't
-- accidentally widen it.

select throws_ok(
  format(
    $$ insert into wordwheel.found_words
         (game_id, user_id, word, points, is_pangram, is_bonus)
       values (%L::uuid,
               'dee44444-4444-4444-4444-444444444444',
               'sneaky', 1, false, false) $$,
    (select id from coop_game)
  ),
  '42501',
  'permission denied for table found_words',
  'direct INSERT into wordwheel.found_words is blocked for authenticated'
);

select throws_ok(
  format(
    $$ insert into wordwheel.games
         (game_id, outer_letters, center_letter,
          required_words_score, required_words_count, required_words, bonus_words,
          required_band, legal_band)
       values (%L::uuid,
               'aaaaaaaa', 'b', 1, 1, '[]'::jsonb, '[]'::jsonb, 3, 5) $$,
    (select id from coop_game)
  ),
  '42501',
  'permission denied for table games',
  'direct INSERT into wordwheel.games is blocked for authenticated'
);

-- ============================================================
-- Compete mode: the table shows a member every row
-- ============================================================
-- We seed a second game in the same club with mode=compete and put a row
-- from each player.

reset role;
create temp table compete_game (id uuid) on commit drop;
grant select on compete_game to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, mode, title, setup)
  values (
    gen_random_uuid(),
    (select handle from club),
    'wordwheel_compete',
    'compete',
    'E·CABDFGHI compete',
    '{"target_rank": 5, "timer": {"kind": "none"}}'::jsonb
  )
  returning id
)
insert into compete_game (id) select id from ins;

insert into wordwheel.games
  (game_id, outer_letters, center_letter,
   required_words_score, required_words_count, required_words, bonus_words, target_rank,
   required_band, legal_band)
values (
  (select id from compete_game),
  'cabdfghi', 'e', 24, 2,
  '[]'::jsonb, '[]'::jsonb, 5, 3, 5
);

insert into wordwheel.found_words (game_id, user_id, word, points, is_pangram, is_bonus) values
  ((select id from compete_game),
   'ada11111-1111-1111-1111-111111111111', 'bead', 1, false, false),
  ((select id from compete_game),
   'bea22222-2222-2222-2222-222222222222', 'face', 1, false, false),
  ((select id from compete_game),
   'cade3333-3333-3333-3333-333333333333', 'dice', 1, false, false);

-- Ada sees every racer's row: who may see a rival's finds mid-race is the
-- page's rule (the hook's seat rule over game_data), not the table's.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from wordwheel.found_words
    where game_id = (select id from compete_game)),
  3::bigint,
  'compete mid-game / ada (member): sees every racer''s row — the table carries no mode arm'
);

-- ============================================================
select * from finish();
rollback;
