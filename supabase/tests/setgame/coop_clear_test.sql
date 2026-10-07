-- cs-unmet

-- ============================================================
-- Test: how a coop clear ends — a perfect clear wins, tiles left are no result
-- ============================================================
-- The last claim on a spent deck ends a coop game ('cleared'). With no tile
-- left on the table, every tile went into a set: a perfect clear, a win for
-- the whole team. With tiles left over, every set was found but not every
-- tile used: no result, nobody ranked. Planted, because a shuffled deck ends
-- in a perfect clear in about 2% of games.

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(6);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Set clear', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select mode, (setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id
  from (values ('perfect'), ('leftover')) m(mode);
reset role;

-- The deck spent. The perfect table holds one set; the other holds the set and
-- three tiles that make none (1121, 1122, 1231: the second feature is 1, 1, 2).
update setgame.games
   set deck_pos = setgame._deck_size(deck_kind),
       board = case game_id when (select id from g where mode = 'perfect')
                 then array[1111,1112,1113]::smallint[]
                 else array[1111,1112,1113,1121,1122,1231]::smallint[] end
 where game_id in (select id from g);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select setgame.submit_set((select id from g where mode = 'perfect'), array[1111,1112,1113]::smallint[]);
select setgame.submit_set((select id from g where mode = 'leftover'), array[1111,1112,1113]::smallint[]);
reset role;

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g where mode = 'perfect')),
  'reached_goal/cleared/won', 'a perfect clear wins');
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g where mode = 'perfect') and final_ranking = 1 and outcome = 'won'),
  2, 'the whole team is ranked 1');
select is(
  (select (summary_data->>'perfectClear')::boolean from common.games where id = (select id from g where mode = 'perfect')),
  true, 'the summary says it was a perfect clear');

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g where mode = 'leftover')),
  'resource_exhausted/cleared/neutral', 'every set found with tiles left over is no result');
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g where mode = 'leftover') and final_ranking is null and outcome = 'neutral'),
  2, 'nobody is ranked; every teammate neutral');
select is(
  (select (summary_data->>'perfectClear')::boolean from common.games where id = (select id from g where mode = 'leftover')),
  false, 'the summary says it was not a perfect clear');

select * from finish();
rollback;
