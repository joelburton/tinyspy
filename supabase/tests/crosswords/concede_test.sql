begin;
set search_path = crosswords, common, public, extensions;
select plan(9);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.xw_insert_puzzle('h-2x2', pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_id \gset

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select common.create_club('XW Club', array['ada', 'bea', 'cade']) as club_handle \gset

select id as gp_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete') \gset
select id as gp2_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete') \gset
select id as gc_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop') \gset
select id as gc2_id from crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop') \gset
reset role;

-- ── Compete concede: non-elimination, last conceder ends the table ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.concede(:'gp_id');
reset role;
select is(
  (select conceded from common.game_players
     where game_id = :'gp_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'compete: conceding flips your conceded flag');
select is((select play_state from common.games where id = :'gp_id'), 'playing',
  'compete: one conceder of two does NOT end the table');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select crosswords.concede(:'gp_id');
reset role;
select is((select play_state from common.games where id = :'gp_id'), 'lost',
  'compete: the last conceder → collective loss');
select is((select status ->> 'outcome' from common.games where id = :'gp_id'), 'conceded',
  'compete: collective loss has outcome = conceded');

-- Concede is compete-only.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format('select crosswords.concede(%L)', :'gc2_id'),
  'P0001', null, 'concede is rejected in coop');
reset role;

-- ── Coop give-up (end_game): a NEUTRAL "finished", not a loss ────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.end_game(:'gc_id');
reset role;
select is((select play_state from common.games where id = :'gc_id'), 'ended',
  'coop give-up → play_state ended (neutral, not lost)');
select is((select status ->> 'outcome' from common.games where id = :'gc_id'), 'finished',
  'coop give-up → outcome finished');
select is(
  (select result -> 'won' from common.game_players
     where game_id = :'gc_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'false'::jsonb, 'coop give-up → nobody "won" (but it is not a loss)');

-- end_game is coop-only (compete drops out via concede).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format('select crosswords.end_game(%L)', :'gp2_id'),
  'P0001', null, 'end_game is rejected in compete');
reset role;

select * from finish();
rollback;
