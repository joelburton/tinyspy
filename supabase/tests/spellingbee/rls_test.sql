-- ============================================================
-- Test: spellingbee RLS — club gating + the compete-mode policy
-- ============================================================
--
-- Two layers of access control on spellingbee.found_words:
--
--   1. Outer gate: must be a club member of the game's club.
--      (Same shape as every other gametype's SELECT RLS.)
--
--   2. Inner gate, written for both modes from day one even
--      though v1 ships co-op only — see docs/spellingbee.md →
--      "Designing for compete." Three OR branches:
--         (a) setup.mode = 'coop'         — everyone sees all
--         (b) user_id = auth.uid()        — see your own
--         (c) is_terminal = true          — post-game reveal
--
-- This file exercises every branch with direct-INSERT setup
-- (no RPCs in phase 1; the test sets state by switching to
-- postgres and writing rows directly).
--
-- Personas: ada + bea + cade in the test club; dee is the
-- outsider. (Naming convention: see ../_shared/setup.psql.)
-- We pick a 3-member club so compete mode has enough actors
-- to make the "only my own" vs "everyone's" distinction
-- visible.

begin;

set search_path = spellingbee, common, public, extensions;

select plan(11);

\ir ../_shared/setup.psql

-- ============================================================
-- Set up: 3-member club + a spellingbee game in COOP mode + finds
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;

reset role;
-- A non-terminal coop game. CTE wrapping the INSERT…RETURNING
-- because `CREATE TEMP TABLE ... AS INSERT` isn't valid syntax
-- in Postgres (only AS SELECT is). Temp tables created as
-- postgres need an explicit grant to authenticated so the
-- as_user-switched test body can read them back.
create temp table coop_game (id uuid) on commit drop;
grant select on coop_game to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, title, setup, play_state, is_terminal)
  values (
    gen_random_uuid(),
    (select handle from club),
    'spellingbee_coop',
    'E·CABDNO',
    '{"timer": {"kind": "none"}}'::jsonb,
    'playing',
    false
  )
  returning id
)
insert into coop_game (id) select id from ins;

insert into spellingbee.games
  (id, club_handle, mode, outer_letters, center_letter,
   required_words_score, required_words_count, required_words, bonus_words)
values (
  (select id from coop_game),
  (select handle from club),
  'coop',
  'cabdno', 'e', 17, 2,
  '[]'::jsonb, '[]'::jsonb
);

-- Three found_words rows, one per player. The RLS branch (a)
-- (coop) means each player should see ALL three.
insert into spellingbee.found_words (game_id, user_id, word, points, is_pangram, is_bonus) values
  ((select id from coop_game),
   'ada11111-1111-1111-1111-111111111111', 'bead', 1, false, false),
  ((select id from coop_game),
   'bea22222-2222-2222-2222-222222222222', 'bond', 1, false, false),
  ((select id from coop_game),
   'cade3333-3333-3333-3333-333333333333', 'acedone', 17, true, false);

-- ============================================================
-- Coop mode: everyone in the club sees everyone's finds
-- ============================================================
-- Branch (a) of the policy.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from spellingbee.found_words
    where game_id = (select id from coop_game)),
  3::bigint,
  'coop / ada (member): sees all 3 found_words including bea''s + cade''s'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from spellingbee.found_words
    where game_id = (select id from coop_game)),
  3::bigint,
  'coop / bea (member): sees all 3 found_words including ada''s + cade''s'
);

-- ============================================================
-- Non-member sees nothing — through games OR found_words
-- ============================================================
-- The outer gate (club membership) wins even before any inner
-- OR branch matters. dee is signed in but not in the club.

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

select is(
  (select count(*) from spellingbee.games where id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from spellingbee.games'
);

select is(
  (select count(*) from spellingbee.found_words
    where game_id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from spellingbee.found_words'
);

select is(
  (select count(*) from spellingbee.games_state where id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from spellingbee.games_state (RLS inherits via security_invoker)'
);

-- ============================================================
-- Direct INSERT into spellingbee tables is blocked at the grant layer
-- ============================================================
-- No INSERT grant for authenticated. Writes go through RPCs
-- (Phase 2). This test pins the grant boundary now so a future
-- migration doesn't accidentally widen it.

select throws_ok(
  format(
    $$ insert into spellingbee.found_words
         (game_id, user_id, word, points, is_pangram, is_bonus)
       values (%L::uuid,
               'dee44444-4444-4444-4444-444444444444',
               'sneaky', 1, false, false) $$,
    (select id from coop_game)
  ),
  '42501',
  'permission denied for table found_words',
  'direct INSERT into spellingbee.found_words is blocked for authenticated'
);

select throws_ok(
  format(
    $$ insert into spellingbee.games
         (id, club_handle, outer_letters, center_letter,
          required_words_score, required_words_count, required_words, bonus_words)
       values (gen_random_uuid(), %L,
               'aaaaaa', 'b', 1, 1, '[]'::jsonb, '[]'::jsonb) $$,
    (select handle from club)
  ),
  '42501',
  'permission denied for table games',
  'direct INSERT into spellingbee.games is blocked for authenticated'
);

-- ============================================================
-- Compete mode: viewer sees ONLY their own finds while playing
-- ============================================================
-- Branch (b) of the policy. We seed a second game in the same
-- club with mode=compete and put a row from each player.

reset role;
create temp table compete_game (id uuid) on commit drop;
grant select on compete_game to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, title, setup, play_state, is_terminal)
  values (
    gen_random_uuid(),
    (select handle from club),
    'spellingbee_compete',
    'E·CABDNO compete',
    '{"target_rank": 5, "timer": {"kind": "none"}}'::jsonb,
    'playing',
    false
  )
  returning id
)
insert into compete_game (id) select id from ins;

insert into spellingbee.games
  (id, club_handle, mode, outer_letters, center_letter,
   required_words_score, required_words_count, required_words, bonus_words)
values (
  (select id from compete_game),
  (select handle from club),
  'compete',
  'cabdno', 'e', 17, 2,
  '[]'::jsonb, '[]'::jsonb
);

insert into spellingbee.found_words (game_id, user_id, word, points, is_pangram, is_bonus) values
  ((select id from compete_game),
   'ada11111-1111-1111-1111-111111111111', 'bead', 1, false, false),
  ((select id from compete_game),
   'bea22222-2222-2222-2222-222222222222', 'bond', 1, false, false),
  ((select id from compete_game),
   'cade3333-3333-3333-3333-333333333333', 'cane', 1, false, false);

-- Ada sees only her one row (branch (b)).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from spellingbee.found_words
    where game_id = (select id from compete_game)),
  1::bigint,
  'compete mid-game / ada: sees only her own found_word (branch b: user_id = auth.uid())'
);

-- And it's her row specifically, not someone else's.
select is(
  (select user_id from spellingbee.found_words
    where game_id = (select id from compete_game)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'compete mid-game / ada: the row she sees IS her own'
);

-- Bea symmetrically sees only her one row.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from spellingbee.found_words
    where game_id = (select id from compete_game)),
  1::bigint,
  'compete mid-game / bea: sees only her own found_word'
);

-- ============================================================
-- Compete mode + terminal: branch (c) opens the reveal
-- ============================================================
-- The "what I missed" post-end view: once is_terminal=true,
-- every member sees every other member's finds, regardless of
-- mode. Flip the compete game to terminal and re-query.

reset role;
update common.games set is_terminal = true, play_state = 'won_compete'
 where id = (select id from compete_game);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from spellingbee.found_words
    where game_id = (select id from compete_game)),
  3::bigint,
  'compete post-terminal / ada: sees all 3 finds (branch c: is_terminal)'
);

-- ============================================================
select * from finish();
rollback;
