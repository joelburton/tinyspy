-- cs-unmet

-- ============================================================
-- Test: scrabble.stop_game (manual) + scrabble.submit_timeout
-- ============================================================
-- The PLAYER-INITIATED ends (this file), as opposed to the game's own
-- automatic endings in auto_finish_test.sql. COOP stop_game FORFEITS the
-- leftover-tile value from the coop score (a penalty, logged as a 'leftovers'
-- row) so a team is pushed to play its last tiles. submit_timeout runs final
-- scoring.

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(14);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select pg_temp.create_club('Endgames', array['ada', 'bea']) as handle;
reset role;

-- ─── Coop manual end forfeits leftover tiles ─────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gm on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;
reset role;
-- A known score (ada's 5) + a leftover rack worth 11 (Q=10 + A=1).
update scrabble.games set team_rack = array['q','a'] where game_id = (select id from gm);
update scrabble.players set score = 5
  where game_id = (select id from gm) and user_id = 'ada11111-1111-1111-1111-111111111111';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.stop_game((select id from gm));
reset role;

select is((select game_ended_outcome from common.games where id = (select id from gm)),
  'neutral', 'coop manual end runs final scoring but stays neutral');
select isnt((select ended_at from common.games where id = (select id from gm)), null,
  'the game has ended');
select is((select game_ended_reason || '/' || game_ended_by_user_id::text
             from common.games where id = (select id from gm)),
  'stopped/ada11111-1111-1111-1111-111111111111', 'the reason is stopped, by the caller');
select is(scrabble._team_score((select id from gm)),
  -6, 'leftover tiles (Q+A = 11) are forfeited from the team''s score: 5 − 11 = −6');
select is((select score from scrabble.players
           where game_id = (select id from gm) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  5, 'a player''s own score is untouched — the leftovers are the team''s');
select is((select kind || ':' || score || ':' || took_turn || ':' || user_id from scrabble.events
           where game_id = (select id from gm) and kind = 'leftovers'),
  'leftovers:-11:false:ada11111-1111-1111-1111-111111111111',
  'the leftover tiles are logged with the negative value lost, in the stopper''s name — and spent no turn');
select is((select outcome from common.game_players
           where game_id = (select id from gm) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'neutral', 'nobody wins a stopped coop table — the score, not a verdict, is the result');
select is((select (summary_data->'team'->>'score')::int from common.games where id = (select id from gm)),
  -6, 'the club line carries the final team score');

-- Idempotent: a second stop_game (or a race) is rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  scrabble.stop_game((select id from gm)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'ending an already-ended game is rejected');
reset role;

-- ─── Timeout (coop) crowns a gentle score report ─────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gt on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;
reset role;
update scrabble.games set team_rack = array['q'] where game_id = (select id from gt);  -- leftover 10
update scrabble.players set score = 12
  where game_id = (select id from gt) and user_id = 'bea22222-2222-2222-2222-222222222222';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.submit_timeout((select id from gt));
reset role;
-- The clock is the ONE way a coop table can lose. Playing the bag out is a win
-- (see auto_finish_test) and stopping early is no result; failing to finish in
-- time is a real loss, the same reading every other game gives it.
select is((select game_ended_outcome from common.games where id = (select id from gt)),
  'lost', 'coop timeout is a loss — the table did not finish in time');
select is((select count(*)::int from common.game_players
            where game_id = (select id from gt) and final_ranking is null and outcome = 'lost'),
  2, 'coop timeout ranks nobody; every player lost');
select is((select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from gt)),
  'timeout/timeout', 'the reason is timeout');
select is(scrabble._team_score((select id from gt)), 2,
  'leftover tiles (Q = 10) are subtracted: 12 − 10 = 2');
-- The clock covers nobody's turn in free-for-all coop, so the row is in the
-- name of the client that reported it.
select is((select kind || ':' || score || ':' || user_id from scrabble.events
           where game_id = (select id from gt) and kind = 'leftovers'),
  'leftovers:-10:ada11111-1111-1111-1111-111111111111',
  'a timeout logs the leftovers too, in the reporting client''s name');

select * from finish();
rollback;
