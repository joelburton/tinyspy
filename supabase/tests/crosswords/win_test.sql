begin;
set search_path = crosswords, common, public, extensions;
select plan(11);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.xw_insert_puzzle('h-2x2', pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_id \gset

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select common.create_club('XW Club', array['ada', 'bea', 'cade']) as club_handle \gset

-- Three games off the same puzzle: coop (solve fully), coop (pencil solve),
-- compete (first-correct-wins). Answers: (0,0)C (0,1)A (1,0)T (1,1)S.
select id as gc_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop') \gset
select id as gc2_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop') \gset
select id as gp_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete') \gset

-- ── Coop: solving the whole grid wins ────────────────────────────────
select set_cell from crosswords.set_cell(:'gc_id', 0, 0, 'c', false);
select set_cell from crosswords.set_cell(:'gc_id', 0, 1, 'a', false);
select set_cell from crosswords.set_cell(:'gc_id', 1, 0, 't', false);
select solved as s_last from crosswords.set_cell(:'gc_id', 1, 1, 's', false) \gset
select is(:'s_last'::boolean, true, 'the final correct fill reports solved = true');

reset role;
select is((select play_state from common.games where id = :'gc_id'), 'won',
  'coop solved → play_state won');
select is((select is_terminal from common.games where id = :'gc_id'), true,
  'coop solved → is_terminal');
select is(
  (select result -> 'won' from common.game_players
     where game_id = :'gc_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'true'::jsonb, 'coop solved → each player result won = true');

-- Solution reveals in the terminal view.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select isnt(
  (select solution from crosswords.games_state where id = :'gc_id'), null,
  'terminal: games_state.solution is revealed');
reset role;

-- ── Pencil counts toward solve (mirror isPuzzleSolved) ───────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select set_cell from crosswords.set_cell(:'gc2_id', 0, 0, 'c', false);
select set_cell from crosswords.set_cell(:'gc2_id', 0, 1, 'a', false);
select set_cell from crosswords.set_cell(:'gc2_id', 1, 0, 't', false);
-- Last cell is PENCIL but correct — solve does not skip pencil.
select solved as s_pencil from crosswords.set_cell(:'gc2_id', 1, 1, 's', true) \gset
select is(:'s_pencil'::boolean, true, 'a correct PENCIL cell still completes the solve');
reset role;

-- ── Compete: first fully-correct grid wins outright ──────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select set_cell from crosswords.set_cell(:'gp_id', 0, 0, 'c', false);
select set_cell from crosswords.set_cell(:'gp_id', 0, 1, 'a', false);
select set_cell from crosswords.set_cell(:'gp_id', 1, 0, 't', false);
select solved as s_comp from crosswords.set_cell(:'gp_id', 1, 1, 's', false) \gset
select is(:'s_comp'::boolean, true, 'compete: completing your grid reports solved');
reset role;

select is((select play_state from common.games where id = :'gp_id'), 'won_compete',
  'compete solved → play_state won_compete');
select is(
  (select status ->> 'winner_username' from common.games where id = :'gp_id'),
  'ada', 'compete → status.winner_username is the solver');
select is(
  (select result -> 'won' from common.game_players
     where game_id = :'gp_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'true'::jsonb, 'compete winner result won = true');
select is(
  (select result -> 'won' from common.game_players
     where game_id = :'gp_id' and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'false'::jsonb, 'compete non-winner result won = false');

select * from finish();
rollback;
