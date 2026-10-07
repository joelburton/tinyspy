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

select plan(30);

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
select is((select coalesce(final_ranking::text, 'none') || '/' || outcome from common.game_players
           where game_id = (select id from gcp) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'none/lost', 'the opponent played no word, so has no place: lost');
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
select pg_temp.sc_score((select id from gbl), 'ada11111-1111-1111-1111-111111111111', 10);
select pg_temp.sc_rack((select id from gbl), 'ada11111-1111-1111-1111-111111111111', array['a']);
select pg_temp.sc_score((select id from gbl), 'bea22222-2222-2222-2222-222222222222', 3);
select pg_temp.sc_rack((select id from gbl), 'bea22222-2222-2222-2222-222222222222', array['q']);

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
-- Level before the leftovers too (empty racks), so the tiebreak cannot part
-- them.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gtie on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
update scrabble.games set consecutive_passes = 1 where game_id = (select id from gtie);
select pg_temp.sc_turn((select id from gtie), 'ada11111-1111-1111-1111-111111111111');
select pg_temp.sc_score((select id from gtie), 'ada11111-1111-1111-1111-111111111111', 5);
select pg_temp.sc_score((select id from gtie), 'bea22222-2222-2222-2222-222222222222', 5);
update scrabble.players set rack = '{}' where game_id = (select id from gtie);

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

-- ─── A tie on the final score, broken by the score before the leftovers ───
-- ada played 12 and holds A (1): 11. bea played 13 and holds D (2): 11. Level
-- at the end; bea scored more on the board, so bea wins (the official rule).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gtb on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
update scrabble.games set consecutive_passes = 1 where game_id = (select id from gtb);
select pg_temp.sc_turn((select id from gtb), 'ada11111-1111-1111-1111-111111111111');
select pg_temp.sc_score((select id from gtb), 'ada11111-1111-1111-1111-111111111111', 12);
select pg_temp.sc_rack((select id from gtb), 'ada11111-1111-1111-1111-111111111111', array['a']);
select pg_temp.sc_score((select id from gtb), 'bea22222-2222-2222-2222-222222222222', 13);
select pg_temp.sc_rack((select id from gtb), 'bea22222-2222-2222-2222-222222222222', array['d']);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.pass_turn((select id from gtb), 0);
reset role;
select is((select string_agg(left(user_id::text, 3) || ':' || score, ',' order by user_id)
             from scrabble.players where game_id = (select id from gtb)),
  'ada:11,bea:11', 'level on the final score');
select is((select final_ranking || '/' || outcome from common.game_players
           where game_id = (select id from gtb) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '1/won', 'the higher score before the leftovers wins the tie');
select is((select final_ranking || '/' || outcome from common.game_players
           where game_id = (select id from gtb) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '2/near', 'and the other is second');

-- ─── A player who played no word has no place ────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gnw on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
update scrabble.games set consecutive_passes = 1 where game_id = (select id from gnw);
select pg_temp.sc_turn((select id from gnw), 'ada11111-1111-1111-1111-111111111111');
select pg_temp.sc_score((select id from gnw), 'ada11111-1111-1111-1111-111111111111', 4);
update scrabble.players set rack = '{}' where game_id = (select id from gnw);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.pass_turn((select id from gnw), 0);
reset role;
select is((select final_ranking || '/' || outcome from common.game_players
           where game_id = (select id from gnw) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won', 'the one who played a word wins');
select is((select coalesce(final_ranking::text, 'none') || '/' || outcome from common.game_players
           where game_id = (select id from gnw) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'none/lost', 'the one who played none is unranked, lost');

-- ─── A timeout before anyone played: no winner ───────────
-- Every score is 0 less the leftovers, so ranking them would crown the
-- lightest rack.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gto on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
select pg_temp.sc_rack((select id from gto), 'ada11111-1111-1111-1111-111111111111', array['a']);
select pg_temp.sc_rack((select id from gto), 'bea22222-2222-2222-2222-222222222222', array['q']);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.submit_timeout((select id from gto));
reset role;
select is((select game_ended_reason || '/' || game_ended_outcome from common.games where id = (select id from gto)),
  'timeout/lost', 'a timeout before anyone played ends lost');
select is((select count(*)::int from common.game_players
            where game_id = (select id from gto) and final_ranking is null and outcome = 'lost'),
  2, 'nobody is ranked, not even the lighter rack');

select * from finish();
rollback;
