-- cs-blessed-psychicnum

-- ============================================================
-- Test: RLS — a club member reads every row, an outsider none
-- ============================================================
--
-- Three users: ada + bea play together (in different games); dee
-- is signed in but outside their club.
--
-- What we check:
--   - a club member sees every row of games, players and events, in both
--     modes: what a racer may see of a rival mid-race is the hook's rule
--     (src/psychicnum/hooks/useGame.ts), applied to the playarea blob, not
--     a policy's — the client reads none of these tables
--   - dee's SELECTs against any psychicnum table return zero rows
--   - dee's mutating RPCs throw
--
-- The column-level grant on `secrets` (storage-layer protection)
-- is checked in create_game_test.sql; not duplicated here.

begin;

set search_path = psychicnum, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada','bea']) as handle;

-- ============================================================
-- COOP — guesses are club-wide visible
-- ============================================================

create temp table coop_g on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 7, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
)->'data'->>'id')::uuid as id;

-- ada guesses a wrong word.
reset role;
update psychicnum.games
   set words = array['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel'],
       secrets = array['alpha','bravo','charlie']
 where game_id = (select id from coop_g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from coop_g), 'delta');

-- (1) ada sees her own guess
select is(
  (select count(*)::int from psychicnum.events where game_id = (select id from coop_g)),
  1,
  'coop: ada sees her own guess (1 row)'
);

-- (2) bea sees ada's guess too (club-wide visibility)
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from psychicnum.events where game_id = (select id from coop_g)),
  1,
  'coop: bea sees ada''s guess (club-wide RLS)'
);

-- (3) dee sees nothing
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from psychicnum.events where game_id = (select id from coop_g)),
  0,
  'coop: dee (non-member) sees zero guesses'
);

-- ============================================================
-- COMPETE — the same: every row, every club member
-- ============================================================
-- An opponent's guesses are their strategy, and a racer must not see them
-- mid-race — but the client never reads this table. The playarea blob carries
-- every row, and the hook withholds a rival's; that rule is pinned in
-- src/psychicnum/hooks/useGame.test.ts.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table comp_g on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 5, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
)->'data'->>'id')::uuid as id;

reset role;
update psychicnum.games
   set words = array['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel'],
       secrets = array['alpha','bravo','charlie']
 where game_id = (select id from comp_g);

-- Both ada and bea submit one wrong guess each.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from comp_g), 'delta');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from comp_g), 'echo');

-- (4) ada sees both rows
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from psychicnum.events where game_id = (select id from comp_g)),
  2,
  'compete: ada sees both guesses — the policy is the club''s, the seat rule is the hook''s'
);

-- (5) bea sees both too
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from psychicnum.events where game_id = (select id from comp_g)),
  2,
  'compete: bea sees both guesses'
);

-- ============================================================
-- Players table is club-wide visible in compete (budget strip)
-- ============================================================

-- (6) ada sees both player rows including bea's
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from psychicnum.players where game_id = (select id from comp_g)),
  2,
  'compete: ada can see both player rows'
);

-- (7) bea sees both too
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
  (select count(*)::int from psychicnum.games where game_id = (select id from comp_g)),
  0,
  'dee cannot SELECT psychicnum.games (RLS)'
);
select is(
  (select count(*)::int from psychicnum.players where game_id = (select id from comp_g)),
  0,
  'dee cannot SELECT psychicnum.players (RLS)'
);
select is(
  (select count(*)::int from psychicnum.events where game_id = (select id from comp_g)),
  0,
  'dee cannot SELECT psychicnum.events (RLS)'
);
select is(
  (select count(*)::int from common.games where id = (select id from comp_g)),
  0,
  'dee cannot SELECT the game''s common row, where the page blobs live (RLS)'
);
select pg_temp.envelope_is(
  psychicnum.submit_guess((select id from comp_g), 'alpha'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'dee cannot call submit_guess (_require_game_player gate)'
);

-- ============================================================
select * from finish();
rollback;
