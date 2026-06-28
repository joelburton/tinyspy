-- ============================================================
-- Test: psychicnum.end_game — manual stop
-- ============================================================
--
-- end_game is the explicit "we're done, stop the game" action,
-- available in BOTH modes. Unlike submit_timeout (a genuine
-- loss), a manual stop is neutral: it writes the UNIFORM terminal
-- play_state='ended' with status.outcome='manual' and everyone's
-- result = {won: false}. We assert that shape for coop AND
-- compete, plus idempotency (a 2nd call raises P0001) and that a
-- non-player can't fire it.
--
-- Strategy mirrors gameplay_test.sql: build a club, create a
-- game, pin the target with a postgres-role UPDATE (irrelevant to
-- end_game, but keeps the setup identical), then drive with
-- as_user switching.

begin;

set search_path = psychicnum, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada','bea']) as handle;

-- ============================================================
-- COOP block
-- ============================================================

create temp table coop_g on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 5, "max_number": 10, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);
reset role;
update psychicnum.games set target = 7 where id = (select id from coop_g);

-- (1) Non-player (dee) cannot end the game
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select psychicnum.end_game(%L::uuid) $$, (select id from coop_g)),
  '42501', 'not playing this game',
  'coop: non-player end_game rejected'
);

-- (2) A game player ends the game — succeeds
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format($$ select psychicnum.end_game(%L::uuid) $$, (select id from coop_g)),
  'coop: game player can end the game'
);

reset role;
-- (3) play_state flips to the uniform neutral 'ended'
select is(
  (select play_state from common.games where id = (select id from coop_g)),
  'ended',
  'coop: end_game flips play_state to ended'
);

-- (4) is_terminal set (common.end_game marks the game terminal)
select is(
  (select is_terminal from common.games where id = (select id from coop_g)),
  true,
  'coop: end_game marks game terminal'
);

-- (5) status.outcome = 'manual'
select is(
  (select status->>'outcome' from common.games where id = (select id from coop_g)),
  'manual',
  'coop: end_game writes status.outcome = manual'
);

-- (6) every player's result = {won: false}
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from coop_g) and result = '{"won": false}'::jsonb),
  2,
  'coop: every player gets result = {won: false} on manual end'
);

-- (7) Idempotency — a 2nd end_game on a terminal game raises P0001
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select psychicnum.end_game(%L::uuid) $$, (select id from coop_g)),
  'P0001', 'game is not in progress',
  'coop: second end_game on terminal game raises P0001'
);

-- ============================================================
-- COMPETE block — same shape, mode echoed into status
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table comp_g on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 3, "max_number": 10, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);
reset role;
update psychicnum.games set target = 7 where id = (select id from comp_g);

-- (8) A game player ends the compete game — succeeds
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format($$ select psychicnum.end_game(%L::uuid) $$, (select id from comp_g)),
  'compete: game player can end the game'
);

reset role;
-- (9) Compete also uses the UNIFORM 'ended' (not 'lost_compete')
select is(
  (select play_state from common.games where id = (select id from comp_g)),
  'ended',
  'compete: end_game flips play_state to the uniform ended (not lost_compete)'
);

-- (10) status echoes mode = compete alongside outcome = manual
select is(
  (select status->>'mode' from common.games where id = (select id from comp_g)),
  'compete',
  'compete: end_game echoes mode = compete into status'
);

-- (11) every player's result = {won: false} — no winner on manual end
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from comp_g) and result = '{"won": false}'::jsonb),
  2,
  'compete: every player gets result = {won: false} on manual end'
);

-- (12) Idempotency holds in compete too
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select psychicnum.end_game(%L::uuid) $$, (select id from comp_g)),
  'P0001', 'game is not in progress',
  'compete: second end_game on terminal game raises P0001'
);

-- ============================================================
select * from finish();
rollback;
