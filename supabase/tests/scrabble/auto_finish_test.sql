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

select plan(23);

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
select pg_temp.sc_coop((select id from gco), array['a','t'], '{}');  -- empty bag

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table rco on commit drop as
  select scrabble.play_word((select id from gco), 0,
    '[{"x":7,"y":7,"letter":"a","blank":false},
      {"x":8,"y":7,"letter":"t","blank":false}]'::jsonb, array['at'], 2) as res;
reset role;
select is((select res -> 'data' ->> 'result' from rco), 'accepted', 'the going-out word is played');
select isnt((select ended_at from common.games where id = (select id from gco)), null,
  'common.games ended_at is set');
select is((select game_ended_outcome from common.games where id = (select id from gco)),
  'won', 'coop completion is a win for the team');
select is(scrabble._team_score((select id from gco)), 2,
  'the team''s score = the players'' sum − leftovers (0 here, and no row for a zero)');
select is((select count(*)::int from scrabble.events
            where game_id = (select id from gco) and kind in ('leftovers', 'went_out')),
  0, 'going out in coop writes no scoring row: the rack is empty, and there is no bonus');
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
select pg_temp.sc_rack((select id from gcp), 'ada11111-1111-1111-1111-111111111111', array['a','t']);
select pg_temp.sc_rack((select id from gcp), 'bea22222-2222-2222-2222-222222222222', array['q','z']);
select pg_temp.sc_bag((select id from gcp), '{}');  -- empty bag

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.play_word((select id from gcp), 0,
  '[{"x":7,"y":7,"letter":"a","blank":false},
    {"x":8,"y":7,"letter":"t","blank":false}]'::jsonb, array['at'], 2);
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
select is((select pg_temp.winner_ids(summary_data) from common.games where id = (select id from gcp)),
  '["ada11111-1111-1111-1111-111111111111"]'::jsonb, 'the winner lands on the club line');
-- Every scoring step is a row: the opponent's leftovers in their name, the
-- going-out bonus in the out-player's.
select is((select string_agg(kind || ':' || score || ':' || left(user_id::text, 3), ',' order by id)
             from scrabble.events where game_id = (select id from gcp) and not took_turn),
  'leftovers:-20:bea,went_out:20:ada',
  'the leftovers and the going-out bonus are logged, each in the right player''s name');
select is((select tile_count from scrabble.events
            where game_id = (select id from gcp) and kind = 'leftovers'),
  2, 'a leftovers row counts the tiles left');

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
update scrabble.players set score = 10, rack = array['a']
  where game_id = (select id from gbl) and user_id = 'ada11111-1111-1111-1111-111111111111';
update scrabble.players set score = 3, rack = array['q']
  where game_id = (select id from gbl) and user_id = 'bea22222-2222-2222-2222-222222222222';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table rbl on commit drop as
  select scrabble.pass_turn((select id from gbl), 0) as res;
reset role;
select isnt((select ended_at from common.games where id = (select id from gbl)), null,
  'the last player passing ends the game (blocked)');
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
select is((select pg_temp.winner_ids(summary_data) from common.games where id = (select id from gtie)),
  '["ada11111-1111-1111-1111-111111111111", "bea22222-2222-2222-2222-222222222222"]'::jsonb,
  'a tie names both winners — the shared rank carries it');
select is((select (summary_data->>'winnerScore')::int from common.games where id = (select id from gtie)),
  5, 'and the score they share');

select * from finish();
rollback;
