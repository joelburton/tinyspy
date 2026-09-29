-- cs-unmet

-- ============================================================
-- Test: scrabble AUTOMATIC finish (_finish) + final scoring
-- ============================================================
-- The game-ends-itself paths, as opposed to the player-initiated
-- stop_game / submit_timeout in stop_game_test.sql (named the standard
-- per-game way; this file is split out so the two aren't one keystroke
-- apart). Going-out (bag empty + rack empty) and blocked (every player still
-- in passed in a row) trigger _finish: coop playing the bag out is a win for
-- the whole team (resource_exhausted / complete, everyone ranked 1); compete
-- subtracts each player's leftover tiles, gives the out-player the
-- opponents' leftovers, and ranks by final score, ties sharing a rank.

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(20);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select pg_temp.create_club('Endgame', array['ada', 'bea']) as handle;
reset role;

-- ─── Coop going-out ──────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gco on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;
reset role;
select pg_temp.sc_coop((select id from gco), array['A','T'], '{}');  -- empty bag

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table rco on commit drop as
  select scrabble.play_word((select id from gco), 0,
    '[{"x":7,"y":7,"letter":"A","blank":false},
      {"x":8,"y":7,"letter":"T","blank":false}]'::jsonb, array['AT'], 2) as res;
reset role;
select is((select res -> 'data' ->> 'terminal' from rco), 'true', 'coop going-out ends the game');
select isnt((select ended_at from common.games where id = (select id from gco)), null,
  'common.games ended_at is set');
select is((select game_ended_outcome from common.games where id = (select id from gco)),
  'won', 'coop completion is a win for the team');
select is((select coop_score from scrabble.games where game_id = (select id from gco)), 2,
  'coop_score = score earned − leftover (0 here)');
select is((select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_by_user_id::text
             from common.games where id = (select id from gco)),
  'resource_exhausted/complete/ada11111-1111-1111-1111-111111111111',
  'the reason is resource_exhausted / complete, ended by the player who went out');
select is((select count(*)::int from common.game_players
           where game_id = (select id from gco) and final_ranking = 1 and outcome = 'won'),
  2, 'coop completion ranks every player 1, won');

-- ─── Compete going-out + the going-out bonus ─────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gcp on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
select pg_temp.sc_turn((select id from gcp), 'ada11111-1111-1111-1111-111111111111');
select pg_temp.sc_rack((select id from gcp), 'ada11111-1111-1111-1111-111111111111', array['A','T']);
select pg_temp.sc_rack((select id from gcp), 'bea22222-2222-2222-2222-222222222222', array['Q','Z']);
select pg_temp.sc_bag((select id from gcp), '{}');  -- empty bag

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.play_word((select id from gcp), 0,
  '[{"x":7,"y":7,"letter":"A","blank":false},
    {"x":8,"y":7,"letter":"T","blank":false}]'::jsonb, array['AT'], 2);
reset role;
select is((select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
             from common.games where id = (select id from gcp)),
  'resource_exhausted/complete/won', 'compete going-out ends the game, won');
select is((select score from scrabble.players
           where game_id = (select id from gcp) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  22, 'going-out player: 2 played − 0 own leftover + 20 (Q+Z) opponent leftover = 22');
select is((select score from scrabble.players
           where game_id = (select id from gcp) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  -20, 'opponent: 0 − 20 leftover = −20');
select is((select final_ranking || '/' || outcome from common.game_players
           where game_id = (select id from gcp) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won', 'the higher final score wins');
select is((select final_ranking || '/' || outcome from common.game_players
           where game_id = (select id from gcp) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '2/near', 'the lower score is ranked second, near');
select is((select (clubpage_info->>'winner_user_id')::uuid from common.games where id = (select id from gcp)),
  'ada11111-1111-1111-1111-111111111111'::uuid, 'the winner lands on the club line');

-- ─── Compete blocked (everyone passed in a row) ──────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gbl on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
-- Two players, so one pass is already banked and ada's is the last; known leftovers.
update scrabble.games set consecutive_passes = 1 where game_id = (select id from gbl);
select pg_temp.sc_turn((select id from gbl), 'ada11111-1111-1111-1111-111111111111');
update scrabble.players set score = 10, rack = array['A']
  where game_id = (select id from gbl) and user_id = 'ada11111-1111-1111-1111-111111111111';
update scrabble.players set score = 3, rack = array['Q']
  where game_id = (select id from gbl) and user_id = 'bea22222-2222-2222-2222-222222222222';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table rbl on commit drop as
  select scrabble.pass_turn((select id from gbl), 0) as res;
reset role;
select is((select res -> 'data' ->> 'terminal' from rbl), 'true', 'the last player passing ends the game (blocked)');
select is((select game_ended_outcome from common.games where id = (select id from gbl)),
  'won', 'blocked compete still crowns the leader');
select is((select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_by_user_id::text
             from common.games where id = (select id from gbl)),
  'all_passed/blocked/ada11111-1111-1111-1111-111111111111',
  'the reason is all_passed / blocked, ended by the last passer');
select is((select final_ranking || '/' || outcome from common.game_players
           where game_id = (select id from gbl) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won', 'no going-out bonus: 10−1=9 beats 3−10=−7, ada wins');

-- ─── Compete tie → a shared rank ─────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gtie on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
update scrabble.games set consecutive_passes = 1 where game_id = (select id from gtie);
select pg_temp.sc_turn((select id from gtie), 'ada11111-1111-1111-1111-111111111111');
update scrabble.players set score = 5, rack = '{}' where game_id = (select id from gtie);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.pass_turn((select id from gtie), 0);
reset role;
select is((select final_ranking || '/' || outcome from common.game_players
           where game_id = (select id from gtie) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won', 'tie: ada is ranked 1');
select is((select final_ranking || '/' || outcome from common.game_players
           where game_id = (select id from gtie) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '1/won', 'tie: bea is ranked 1 too');
select is((select clubpage_info->'winner_user_id' from common.games where id = (select id from gtie)),
  'null'::jsonb, 'a tie names no single winner (the shared rank carries it)');
select is((select clubpage_info->'winner_score' from common.games where id = (select id from gtie)),
  'null'::jsonb, 'a tie has no winner_score (the label shows a tie)');

select * from finish();
rollback;
