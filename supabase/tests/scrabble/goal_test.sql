-- cs-unmet

-- ============================================================
-- Test: coop scrabble's point goal (setup.goal_score)
-- ============================================================
-- No goal by default, and the default changes nothing. With a goal, both
-- natural ends — every tile played and the timer — are judged on the FINAL
-- score, after the leftovers: at or over the goal the team wins, under it the
-- team loses. A Stop stays neutral. The goal rides on the team's blobs. With a
-- goal, the team may Pass: once every player has passed since the last word or
-- swap, the game ends all_passed / blocked and is judged the same way.

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(19);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select pg_temp.create_club('Goals', array['ada', 'bea']) as handle;
reset role;

-- A coop game for ada and bea, with this setup.
create function pg_temp.coop_game(p_setup jsonb)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  perform pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
  v_id := (scrabble.create_game((select handle from cl), p_setup,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid;
  reset role;
  return v_id;
end;
$$;

-- ─── The setup ───────────────────────────────────────────
create temp table gnone on commit drop as
  select pg_temp.coop_game('{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}') as id;
select is((select setup->'goal_score' from common.games where id = (select id from gnone)), 'null'::jsonb,
  'a coop game set up without a goal has none');
select is((select game_data->'team'->'goalScore' from common.games where id = (select id from gnone)), 'null'::jsonb,
  'and the team blob says so');

create temp table g300 on commit drop as
  select pg_temp.coop_game('{"dict_2": 6, "dict_3plus": 6, "goal_score": 300, "timer": {"kind": "none"}}') as id;
select is((select (game_data->'team'->>'goalScore')::int from common.games where id = (select id from g300)), 300,
  'a goal rides on the team''s game_data');
select is((select (summary_data->'team'->>'goalScore')::int from common.games where id = (select id from g300)), 300,
  'and on its summary_data');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "goal_score": 0, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN562",
    "message":"BUG: point goal of 0"}'::jsonb,
  'a goal under 1 is refused');
reset role;

-- ─── Every tile played, over the goal: won ───────────────
update scrabble.games set team_rack = array[]::text[] where game_id = (select id from g300);
select pg_temp.sc_score((select id from g300), 'ada11111-1111-1111-1111-111111111111', 310);
select scrabble._finish((select id from g300), 'resource_exhausted', 'complete',
  'ada11111-1111-1111-1111-111111111111', 'ada11111-1111-1111-1111-111111111111');
select is((select game_ended_outcome from common.games where id = (select id from g300)), 'won',
  'every tile played over the goal wins');
select is((select array_agg(distinct final_ranking) from common.game_players where game_id = (select id from g300)),
  array[1], 'the whole team ranked 1');

-- ─── Every tile played, short of the goal: lost ──────────
create temp table gshort on commit drop as
  select pg_temp.coop_game('{"dict_2": 6, "dict_3plus": 6, "goal_score": 300, "timer": {"kind": "none"}}') as id;
update scrabble.games set team_rack = array[]::text[] where game_id = (select id from gshort);
select pg_temp.sc_score((select id from gshort), 'ada11111-1111-1111-1111-111111111111', 250);
select scrabble._finish((select id from gshort), 'resource_exhausted', 'complete',
  'ada11111-1111-1111-1111-111111111111', 'ada11111-1111-1111-1111-111111111111');
select is((select array_agg(distinct outcome) from common.game_players where game_id = (select id from gshort)),
  array['lost'], 'every tile played short of the goal loses, the whole team');

-- ─── The timer, over the goal: won ───────────────────────
create temp table gtime on commit drop as
  select pg_temp.coop_game('{"dict_2": 6, "dict_3plus": 6, "goal_score": 300, "timer": {"kind": "none"}}') as id;
update scrabble.games set team_rack = array[]::text[] where game_id = (select id from gtime);
select pg_temp.sc_score((select id from gtime), 'bea22222-2222-2222-2222-222222222222', 300);
select scrabble._finish((select id from gtime), 'timeout', 'timeout', null, null);
select is((select game_ended_outcome from common.games where id = (select id from gtime)), 'won',
  'the timer with the goal reached (exactly) wins');

-- ─── The timer, pulled under by the leftovers: lost ──────
-- 305 in words, a Q left in the rack: the final score is 295.
create temp table gleft on commit drop as
  select pg_temp.coop_game('{"dict_2": 6, "dict_3plus": 6, "goal_score": 300, "timer": {"kind": "none"}}') as id;
update scrabble.games set team_rack = array['q'] where game_id = (select id from gleft);
select pg_temp.sc_score((select id from gleft), 'ada11111-1111-1111-1111-111111111111', 305);
select scrabble._finish((select id from gleft), 'timeout', 'timeout', null, null);
select is((select game_ended_outcome from common.games where id = (select id from gleft)), 'lost',
  'a goal is judged on the final score: the leftovers can pull the team under it');

-- ─── With no goal, the timer is still no result ──────────
update scrabble.games set team_rack = array['q'] where game_id = (select id from gnone);
select scrabble._finish((select id from gnone), 'timeout', 'timeout', null, null);
select is((select game_ended_outcome from common.games where id = (select id from gnone)), 'neutral',
  'with no goal, the timer with tiles left over is no result');

-- ─── A Stop is neutral, goal or not ──────────────────────
create temp table gstop on commit drop as
  select pg_temp.coop_game('{"dict_2": 6, "dict_3plus": 6, "goal_score": 300, "timer": {"kind": "none"}}') as id;
select pg_temp.sc_score((select id from gstop), 'ada11111-1111-1111-1111-111111111111', 100);
select id as stop_id from gstop \gset
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.stop_game(:'stop_id');
reset role;
select is((select game_ended_outcome from common.games where id = (select id from gstop)), 'neutral',
  'a Stop short of the goal is neutral');
select is((select array_agg(distinct outcome) from common.game_players where game_id = (select id from gstop)),
  array['neutral'], 'for every player');

-- ─── Passing toward the goal ─────────────────────────────
create temp table gpass on commit drop as
  select pg_temp.coop_game('{"dict_2": 6, "dict_3plus": 6, "goal_score": 300, "timer": {"kind": "none"}}') as id;
select id as pass_id from gpass \gset
select pg_temp.sc_coop(:'pass_id', array['a','b','c','d','e','f','g'],
  array['h','i','j','k','l','m','n','o']);
select pg_temp.sc_score(:'pass_id', 'ada11111-1111-1111-1111-111111111111', 360);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.pass_turn(:'pass_id', (select version from scrabble.games where game_id = :'pass_id'));
reset role;
select is((select ended_at from common.games where id = :'pass_id'), null,
  'one of two passing does not end it');
select is((select jsonb_agg(p->'passed' order by p->>'username') from common.games,
             jsonb_array_elements(game_data->'players') p where id = :'pass_id'),
  '[true, false]'::jsonb, 'the page knows who has passed');

-- bea swaps: the count starts again.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select scrabble.exchange_tiles(:'pass_id', (select version from scrabble.games where game_id = :'pass_id'),
  array['a']);
reset role;
select is((select jsonb_agg(p->'passed') from common.games,
             jsonb_array_elements(game_data->'players') p where id = :'pass_id'),
  '[false, false]'::jsonb, 'a swap starts the count again');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.pass_turn(:'pass_id', (select version from scrabble.games where game_id = :'pass_id'));
reset role;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select scrabble.pass_turn(:'pass_id', (select version from scrabble.games where game_id = :'pass_id'));
reset role;
select is((select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = :'pass_id'),
  'all_passed/blocked', 'every player passing ends it, all_passed / blocked');
-- 360 in words, less the swap's 5 and the seven tiles left in the rack: still over 300.
select is((select game_ended_outcome from common.games where id = :'pass_id'), 'won',
  'and it is judged against the goal, leftovers off');

-- Solo: one pass ends it, short of the goal.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gsolo on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "goal_score": 300, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop')->'data'->>'id')::uuid as id;
select scrabble.pass_turn((select id from gsolo), 0);
reset role;
select is((select game_ended_outcome from common.games where id = (select id from gsolo)), 'lost',
  'solo: one pass ends it, and short of the goal it is lost');

select * from finish();
rollback;
