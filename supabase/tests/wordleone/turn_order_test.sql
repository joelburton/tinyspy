-- cs-unmet

-- ============================================================
-- Test: wordleone turn order (opt-in turn-by-turn coop)
-- ============================================================
-- create_game seats the rotation when setup.coop_style = 'turns', and
-- submit_guess gates on _require_turn and hands the turn on after a miss.
-- Covers:
--   1. create_game seats the pointer on the chosen first player
--   2. an out-of-turn guess is refused
--   3. a miss advances the pointer
--   4. a soft reject does NOT advance
--   5. free-for-all leaves the pointer null and ungated
--   6. a first player who is not in the game is a fault
--   7. Restart rewinds the pointer to the opener

begin;
set search_path = wordleone, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(10);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordleone turns', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select (wordleone.create_game(
  (select handle from club),
  pg_temp.wordleone_setup() || jsonb_build_object(
    'coop_style', 'turns', 'first_turn_user_id', 'ada11111-1111-1111-1111-111111111111'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop', pg_temp.wordleone_puzzle())->'data'->>'id')::uuid as id;

-- (1)
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: create_game seats the pointer on the chosen first player');

-- (2)
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  wordleone.submit_guess((select id from g), 'crane'),
  '{"type":"not-ok","severity":"race","dbcode":"PN243","message":"Not your turn"}'::jsonb,
  'turns: the player not on turn is refused');

-- (3)
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordleone.submit_guess((select id from g), 'crane')->'data'->>'result',
  'miss', 'turns: the player on turn misses');
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: a miss hands the turn to bea');

-- (4)
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  wordleone.submit_guess((select id from g), 'crane')->'data'->>'result',
  'duplicate', 'turns: a duplicate is soft-rejected');
select is(
  wordleone.submit_guess((select id from g), 'vesre')->'data'->>'result',
  'notAWord', 'turns: so is a non-word that fits the colors');
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: a soft reject does NOT hand the turn on');

-- (5)
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
create temp table ffa on commit drop as
select (wordleone.create_game(
  (select handle from club), pg_temp.wordleone_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop', pg_temp.wordleone_puzzle())->'data'->>'id')::uuid as id;
select is(
  wordleone.submit_guess((select id from ffa), 'crane')->'data'->>'result',
  'miss', 'free-for-all: any player may guess in any order');

-- (6)
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club),
    pg_temp.wordleone_setup() || jsonb_build_object(
      'coop_style', 'turns', 'first_turn_user_id', 'dee44444-4444-4444-4444-444444444444'),
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop', pg_temp.wordleone_puzzle()),
  '{"type":"not-ok","severity":"fault","dbcode":"PN526"}'::jsonb,
  'turns: a first player who is not in the game is a fault');

-- (7)
select wordleone.replay_board((select id from g));
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: Restart rewinds the turn to the first-seated player');

select * from finish();
rollback;
