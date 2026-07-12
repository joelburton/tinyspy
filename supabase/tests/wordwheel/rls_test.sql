-- ============================================================
-- Test: wordwheel RLS — club gating + the compete-mode policy
-- ============================================================
--
-- A fork of spellingbee's rls_test. Two layers of access control on
-- wordwheel.found_words:
--
--   1. Outer gate: must be a club member of the game's club.
--   2. Inner gate (three OR branches):
--         (a) mode = 'coop'          — everyone sees all
--         (b) user_id = auth.uid()   — see your own
--         (c) is_terminal = true     — post-game reveal
--
-- This file exercises every branch with direct-INSERT setup (the test
-- sets state by switching to postgres and writing rows directly).
--
-- THE FORK: outer_letters is char(8), so the direct-insert boards use
-- 8-letter outer strings.
--
-- Personas: ada + bea + cade in the test club; dee is the outsider.

begin;

set search_path = wordwheel, common, public, extensions;

select plan(11);

\ir ../_shared/setup.psql

-- ============================================================
-- Set up: 3-member club + a wordwheel game in COOP mode + finds
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;

reset role;
-- A non-terminal coop game.
create temp table coop_game (id uuid) on commit drop;
grant select on coop_game to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, title, setup, play_state, is_terminal)
  values (
    gen_random_uuid(),
    (select handle from club),
    'wordwheel_coop',
    'E·CABDFGHI',
    '{"timer": {"kind": "none"}}'::jsonb,
    'playing',
    false
  )
  returning id
)
insert into coop_game (id) select id from ins;

insert into wordwheel.games
  (id, club_handle, mode, outer_letters, center_letter,
   required_words_score, required_words_count, required_words, bonus_words)
values (
  (select id from coop_game),
  (select handle from club),
  'coop',
  'cabdfghi', 'e', 24, 2,
  '[]'::jsonb, '[]'::jsonb
);

-- Three found_words rows, one per player. Branch (a) (coop) means each
-- player should see ALL three. Words are isograms of the wheel + center 'e'.
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
-- Branch (a) of the policy.

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
-- The outer gate (club membership) wins even before any inner OR
-- branch matters. dee is signed in but not in the club.

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

select is(
  (select count(*) from wordwheel.games where id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from wordwheel.games'
);

select is(
  (select count(*) from wordwheel.found_words
    where game_id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from wordwheel.found_words'
);

select is(
  (select count(*) from wordwheel.games_state where id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from wordwheel.games_state (RLS inherits via security_invoker)'
);

-- ============================================================
-- Direct INSERT into wordwheel tables is blocked at the grant layer
-- ============================================================
-- No INSERT grant for authenticated. Writes go through RPCs. This pins
-- the grant boundary so a future migration doesn't accidentally widen it.

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
         (id, club_handle, mode, outer_letters, center_letter,
          required_words_score, required_words_count, required_words, bonus_words)
       values (gen_random_uuid(), %L, 'coop',
               'aaaaaaaa', 'b', 1, 1, '[]'::jsonb, '[]'::jsonb) $$,
    (select handle from club)
  ),
  '42501',
  'permission denied for table games',
  'direct INSERT into wordwheel.games is blocked for authenticated'
);

-- ============================================================
-- Compete mode: viewer sees ONLY their own finds while playing
-- ============================================================
-- Branch (b) of the policy. A second game in the same club with
-- mode=compete and a row from each player.

reset role;
create temp table compete_game (id uuid) on commit drop;
grant select on compete_game to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, title, setup, play_state, is_terminal)
  values (
    gen_random_uuid(),
    (select handle from club),
    'wordwheel_compete',
    'E·CABDFGHI compete',
    '{"target_rank": 5, "timer": {"kind": "none"}}'::jsonb,
    'playing',
    false
  )
  returning id
)
insert into compete_game (id) select id from ins;

insert into wordwheel.games
  (id, club_handle, mode, outer_letters, center_letter,
   required_words_score, required_words_count, required_words, bonus_words)
values (
  (select id from compete_game),
  (select handle from club),
  'compete',
  'cabdfghi', 'e', 24, 2,
  '[]'::jsonb, '[]'::jsonb
);

insert into wordwheel.found_words (game_id, user_id, word, points, is_pangram, is_bonus) values
  ((select id from compete_game),
   'ada11111-1111-1111-1111-111111111111', 'bead', 1, false, false),
  ((select id from compete_game),
   'bea22222-2222-2222-2222-222222222222', 'face', 1, false, false),
  ((select id from compete_game),
   'cade3333-3333-3333-3333-333333333333', 'dice', 1, false, false);

-- Ada sees only her one row (branch (b)).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from wordwheel.found_words
    where game_id = (select id from compete_game)),
  1::bigint,
  'compete mid-game / ada: sees only her own found_word (branch b: user_id = auth.uid())'
);

-- And it's her row specifically, not someone else's.
select is(
  (select user_id from wordwheel.found_words
    where game_id = (select id from compete_game)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'compete mid-game / ada: the row she sees IS her own'
);

-- Bea symmetrically sees only her one row.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from wordwheel.found_words
    where game_id = (select id from compete_game)),
  1::bigint,
  'compete mid-game / bea: sees only her own found_word'
);

-- ============================================================
-- Compete mode + terminal: branch (c) opens the reveal
-- ============================================================

reset role;
update common.games set is_terminal = true, play_state = 'won_compete'
 where id = (select id from compete_game);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from wordwheel.found_words
    where game_id = (select id from compete_game)),
  3::bigint,
  'compete post-terminal / ada: sees all 3 finds (branch c: is_terminal)'
);

-- ============================================================
select * from finish();
rollback;
