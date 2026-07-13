-- ============================================================
-- Test: wordiply RLS — club gating + the compete-mode guess policy
-- ============================================================
--
-- The guesses_select policy is the load-bearing piece for compete, and it
-- encodes a GAME RULE, not just privacy: during a compete game a player
-- sees only their OWN guess words (the FE shows opponents' guesses as
-- lengths only). A regression here leaks the words. wordiply shipped without
-- this test; it mirrors wordwheel/spellingbee's rls_test shape.
--
-- Two layers of access control on wordiply.guesses:
--   1. Outer gate: must be a club member of the game's club.
--   2. Inner gate (three OR branches, mirrors wordwheel.found_words_select):
--         (a) mode = 'coop'          — everyone in the club sees all guesses
--         (b) user_id = auth.uid()   — you always see your own (compete board)
--         (c) is_terminal = true     — post-game reveal (harmless in coop)
--
-- Direct-INSERT setup (switch to postgres, write rows) so the read policy is
-- exercised in isolation from submit_guess.
--
-- Personas: ada + bea + cade in the test club; dee is the outsider.

begin;

set search_path = wordiply, common, public, extensions;

select plan(11);

\ir ../_shared/setup.psql

-- ============================================================
-- Set up: 3-member club + a COOP wordiply game + one guess per player
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;

reset role;
-- A non-terminal coop game. common.games is the FK target.
create temp table coop_game (id uuid) on commit drop;
grant select on coop_game to authenticated;
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
insert into coop_game (id) select id from ins;

insert into wordiply.games
  (id, club_handle, mode, base, difficulty, max_word_length, longest_words, legal_words)
values (
  (select id from coop_game),
  (select handle from club),
  'coop', 'ar', 5, 7,
  '["hangars"]'::jsonb, '["bar","car","arc","hangars"]'::jsonb
);

-- One guess per player. Branch (a) (coop) means each member sees ALL three.
insert into wordiply.guesses (game_id, user_id, word, length, guess_index) values
  ((select id from coop_game), 'ada11111-1111-1111-1111-111111111111', 'bar',  3, 1),
  ((select id from coop_game), 'bea22222-2222-2222-2222-222222222222', 'cars', 4, 1),
  ((select id from coop_game), 'cade3333-3333-3333-3333-333333333333', 'arcs', 4, 1);

-- ============================================================
-- Coop mode: everyone in the club sees everyone's guesses (branch a)
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from wordiply.guesses where game_id = (select id from coop_game)),
  3::bigint,
  'coop / ada (member): sees all 3 guesses including bea''s + cade''s'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from wordiply.guesses where game_id = (select id from coop_game)),
  3::bigint,
  'coop / bea (member): sees all 3 guesses including ada''s + cade''s'
);

-- ============================================================
-- Non-member sees nothing — through games, guesses, or games_state
-- ============================================================
-- The outer gate (club membership) wins before any inner OR branch matters.

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

select is(
  (select count(*) from wordiply.games where id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from wordiply.games'
);

select is(
  (select count(*) from wordiply.guesses where game_id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from wordiply.guesses'
);

select is(
  (select count(*) from wordiply.games_state where id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from wordiply.games_state (RLS inherits via security_invoker)'
);

-- ============================================================
-- Direct INSERT into wordiply tables is blocked at the grant layer
-- ============================================================
-- No INSERT grant for authenticated. Writes go through submit_guess. This
-- pins the grant boundary so a future migration doesn't widen it.

select throws_ok(
  format(
    $$ insert into wordiply.guesses (game_id, user_id, word, length, guess_index)
       values (%L::uuid, 'dee44444-4444-4444-4444-444444444444', 'sneak', 5, 1) $$,
    (select id from coop_game)
  ),
  '42501',
  'permission denied for table guesses',
  'direct INSERT into wordiply.guesses is blocked for authenticated'
);

select throws_ok(
  format(
    $$ insert into wordiply.games
         (id, club_handle, mode, base, difficulty, max_word_length,
          longest_words, legal_words)
       values (gen_random_uuid(), %L, 'coop', 'ar', 5, 7,
               '["hangars"]'::jsonb, '["bar"]'::jsonb) $$,
    (select handle from club)
  ),
  '42501',
  'permission denied for table games',
  'direct INSERT into wordiply.games is blocked for authenticated'
);

-- ============================================================
-- Compete mode: viewer sees ONLY their own guesses while playing (branch b)
-- ============================================================

reset role;
create temp table compete_game (id uuid) on commit drop;
grant select on compete_game to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, title, setup, play_state, is_terminal)
  values (
    gen_random_uuid(),
    (select handle from club),
    'wordiply_compete',
    'AR · best 7 compete',
    '{"difficulty": 5, "timer": {"kind": "none"}}'::jsonb,
    'playing',
    false
  )
  returning id
)
insert into compete_game (id) select id from ins;

insert into wordiply.games
  (id, club_handle, mode, base, difficulty, max_word_length, longest_words, legal_words)
values (
  (select id from compete_game),
  (select handle from club),
  'compete', 'ar', 5, 7,
  '["hangars"]'::jsonb, '["bar","car","arc","hangars"]'::jsonb
);

insert into wordiply.guesses (game_id, user_id, word, length, guess_index) values
  ((select id from compete_game), 'ada11111-1111-1111-1111-111111111111', 'bar',  3, 1),
  ((select id from compete_game), 'bea22222-2222-2222-2222-222222222222', 'cars', 4, 1),
  ((select id from compete_game), 'cade3333-3333-3333-3333-333333333333', 'arcs', 4, 1);

-- Ada sees only her one row (branch b): opponents' words stay hidden.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from wordiply.guesses where game_id = (select id from compete_game)),
  1::bigint,
  'compete mid-game / ada: sees only her own guess (branch b: user_id = auth.uid())'
);

select is(
  (select user_id from wordiply.guesses where game_id = (select id from compete_game)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'compete mid-game / ada: the row she sees IS her own'
);

-- Bea symmetrically sees only her one row.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from wordiply.guesses where game_id = (select id from compete_game)),
  1::bigint,
  'compete mid-game / bea: sees only her own guess'
);

-- ============================================================
-- Compete mode + terminal: branch (c) opens the reveal
-- ============================================================

reset role;
update common.games set is_terminal = true, play_state = 'won_compete'
 where id = (select id from compete_game);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from wordiply.guesses where game_id = (select id from compete_game)),
  3::bigint,
  'compete post-terminal / ada: sees all 3 guesses (branch c: is_terminal)'
);

-- ============================================================
select * from finish();
rollback;
