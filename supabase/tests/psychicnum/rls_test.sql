-- ============================================================
-- Test: RLS + the games_state view + per-mode guess visibility
-- ============================================================
--
-- Three users: ada + bea play together (in different games); dee
-- is signed in but outside their club.
--
-- What we check:
--   - dee's SELECTs against any psychicnum table return zero rows
--   - dee's mutating RPCs throw
--   - games_state hides secrets while playing, surfaces post-terminal
--   - **Mode-aware guess RLS**:
--       coop:    ada sees bea's guesses and vice versa
--       compete: each player sees ONLY their own guesses
--   - players table is club-wide visible in BOTH modes (the
--     "opponents see my budget but not my guesses" property)
--
-- The column-level grant on `secrets` (storage-layer protection)
-- is checked in create_game_test.sql; not duplicated here.

begin;

set search_path = psychicnum, common, public, extensions;

select plan(16);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada','bea']) as handle;

-- ============================================================
-- COOP RLS — guesses are club-wide visible
-- ============================================================

create temp table coop_g on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);

-- ada guesses a wrong word.
reset role;
update psychicnum.games
   set words = array['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel'],
       secrets = array['alpha','bravo','charlie']
 where id = (select id from coop_g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from coop_g), 'delta');

-- (1) ada sees her own guess
select is(
  (select count(*)::int from psychicnum.guesses where game_id = (select id from coop_g)),
  1,
  'coop: ada sees her own guess (1 row)'
);

-- (2) bea sees ada's guess too (coop = club-wide visibility)
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from psychicnum.guesses where game_id = (select id from coop_g)),
  1,
  'coop: bea sees ada''s guess (club-wide RLS)'
);

-- (3) dee sees nothing
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from psychicnum.guesses where game_id = (select id from coop_g)),
  0,
  'coop: dee (non-member) sees zero guesses'
);

-- ============================================================
-- COMPETE RLS — guesses are caller-only
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table comp_g on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 5, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);

reset role;
update psychicnum.games
   set words = array['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel'],
       secrets = array['alpha','bravo','charlie']
 where id = (select id from comp_g);

-- Both ada and bea submit one wrong guess each.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from comp_g), 'delta');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from comp_g), 'echo');

-- (4) ada sees only HER own guess (1 row)
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from psychicnum.guesses where game_id = (select id from comp_g)),
  1,
  'compete: ada sees only her own guess (1 of 2 rows visible)'
);

-- (5) ada specifically does NOT see bea's guess
select is(
  (select count(*)::int from psychicnum.guesses
    where game_id = (select id from comp_g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  0,
  'compete: ada sees zero rows for bea''s guesses'
);

-- (6) bea sees only her own (1 row)
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from psychicnum.guesses where game_id = (select id from comp_g)),
  1,
  'compete: bea sees only her own guess'
);

-- (7) ground-truth (postgres bypass) confirms both rows actually exist
reset role;
select is(
  (select count(*)::int from psychicnum.guesses where game_id = (select id from comp_g)),
  2,
  'compete: both rows exist in storage (postgres bypass confirms)'
);

-- ============================================================
-- Players table is club-wide visible in compete (budget strip)
-- ============================================================
-- The "opponents see my remaining budget but not my guesses"
-- property requires that psychicnum.players stay club-wide
-- visible even in compete mode. Both modes share the same
-- players_select policy.

-- (8) ada sees both player rows including bea's
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from psychicnum.players where game_id = (select id from comp_g)),
  2,
  'compete: ada can see both player rows (opponent budget strip)'
);

-- (9) bea sees both too
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from psychicnum.players where game_id = (select id from comp_g)),
  2,
  'compete: bea can see both player rows'
);

-- ============================================================
-- Dee (outsider) sees nothing in any table
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from psychicnum.games where id = (select id from comp_g)),
  0,
  'dee cannot SELECT psychicnum.games (RLS)'
);
select is(
  (select count(*)::int from psychicnum.players where game_id = (select id from comp_g)),
  0,
  'dee cannot SELECT psychicnum.players (RLS)'
);
select is(
  (select count(*)::int from psychicnum.guesses where game_id = (select id from comp_g)),
  0,
  'dee cannot SELECT psychicnum.guesses (RLS)'
);
select is(
  (select count(*)::int from psychicnum.games_state where id = (select id from comp_g)),
  0,
  'dee cannot SELECT games_state (RLS through underlying table)'
);
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 'alpha') $$, (select id from comp_g)),
  '42501',
  'not playing this game',
  'dee cannot call submit_guess (require_game_player gate)'
);

-- ============================================================
-- games_state.secrets gate
-- ============================================================
-- NULL during play (even for members); the real array after
-- terminal. End the coop_g game (ada finds all three secrets) and
-- check secrets surfaces for the OTHER member (bea), not just the
-- caller who ended it.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select secrets from psychicnum.games_state where id = (select id from coop_g)),
  null::text[],
  'games_state.secrets is NULL while playing'
);

select psychicnum.submit_guess((select id from coop_g), 'alpha');
select psychicnum.submit_guess((select id from coop_g), 'bravo');
select psychicnum.submit_guess((select id from coop_g), 'charlie');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select secrets from psychicnum.games_state where id = (select id from coop_g)),
  array['alpha', 'bravo', 'charlie'],
  'games_state.secrets surfaces to ANY club member once terminal'
);

-- ============================================================
select * from finish();
rollback;
