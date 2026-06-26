-- ============================================================
-- Test: scrabble.end_game (manual) + scrabble.submit_timeout
-- ============================================================
-- COOP end_game FORFEITS the leftover-tile value from the team score (a
-- penalty, logged as a 'forfeit' row) so a team is pushed to play its last
-- tiles; a realtime touch wakes the FE. submit_timeout runs final scoring.

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(11);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select common.create_club('Endgames', array['ada', 'bea']) as handle;
reset role;

-- ─── Coop manual end forfeits leftover tiles ─────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gm on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');
reset role;
-- Known team score + a leftover rack worth 11 (Q=10 + A=1).
update scrabble.games set team_score = 5, shared_rack = array['Q','A']
  where id = (select id from gm);

-- Capture the ctid before, to prove the realtime touch fires.
create temp table ct on commit drop as
  select ctid as tid from scrabble.games where id = (select id from gm);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.end_game((select id from gm));
reset role;

select is((select play_state from common.games where id = (select id from gm)),
  'won', 'coop manual end runs final scoring (play_state won)');
select ok((select is_terminal from common.games where id = (select id from gm)),
  'the game is terminal');
select is((select status->>'outcome' from common.games where id = (select id from gm)),
  'manual', 'status.outcome is manual');
select is((select team_score from scrabble.games where id = (select id from gm)),
  -6, 'leftover tiles (Q+A = 11) are forfeited: 5 − 11 = −6');
select is((select kind || ':' || score from scrabble.plays
           where game_id = (select id from gm) and kind = 'forfeit'),
  'forfeit:-11', 'the forfeit is logged with the negative value lost');
select is((select result->>'won' from common.game_players
           where game_id = (select id from gm) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'true', 'coop completion is a (neutral green) win');
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
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
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
