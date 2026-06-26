-- ============================================================
-- Test: scrabble.end_game (manual) + scrabble.submit_timeout
-- ============================================================
-- end_game is the uniform neutral stop (nobody wins; outcome 'manual';
-- a realtime touch wakes the FE). submit_timeout runs final scoring (a
-- Scrabble score is real, so the leader wins, even on timeout).

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(9);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select common.create_club('Endgames', array['ada', 'bea']) as handle;
reset role;

-- ─── Manual end (neutral) ────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gm on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"difficulty": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');
reset role;

-- Capture the ctid before, to prove the realtime touch fires.
create temp table ct on commit drop as
  select ctid as tid from scrabble.games where id = (select id from gm);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.end_game((select id from gm));
reset role;

select is((select play_state from common.games where id = (select id from gm)),
  'ended', 'manual end → neutral play_state ended');
select ok((select is_terminal from common.games where id = (select id from gm)),
  'the game is terminal');
select is((select status->>'outcome' from common.games where id = (select id from gm)),
  'manual', 'status.outcome is manual');
select is((select result->>'won' from common.game_players
           where game_id = (select id from gm) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'false', 'nobody wins a manual end');
select isnt((select ctid from scrabble.games where id = (select id from gm)),
  (select tid from ct), 'the realtime touch rewrote the scrabble.games row');

-- Idempotent: a second end_game (or a race) is rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok($$ select scrabble.end_game((select id from gm)) $$,
  'P0001', null, 'ending an already-terminal game is rejected');
reset role;

-- ─── Timeout (coop) crowns a gentle score report ─────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gt on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"difficulty": 6, "timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');
reset role;
update scrabble.games set team_score = 12, shared_rack = array['Q']  -- leftover 10
  where id = (select id from gt);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.submit_timeout((select id from gt));
reset role;
select is((select play_state from common.games where id = (select id from gt)),
  'won', 'coop timeout is still a green "won" (never a loss — no opponent)');
select is((select status->>'outcome' from common.games where id = (select id from gt)),
  'timeout', 'status.outcome is timeout');
select is((select team_score from scrabble.games where id = (select id from gt)), 2,
  'leftover tiles (Q = 10) are subtracted: 12 − 10 = 2');

select * from finish();
rollback;
