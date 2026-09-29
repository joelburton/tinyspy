-- cs-unmet

begin;
set search_path = crosswords, common, public, extensions;
select plan(13);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.xw_insert_puzzle('h-2x2', pg_temp.xw_meta_2x2(), pg_temp.xw_sol_2x2()) as pz_id \gset

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.create_club('XW Club', array['ada', 'bea', 'cade']) as club_handle \gset

select (crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as gp_id \gset
select (crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as gp2_id \gset
select (crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as gc_id \gset
select (crosswords.create_game(
  :'club_handle', pg_temp.xw_setup(:'pz_id'),
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop')->'data'->>'id')::uuid as gc2_id \gset
reset role;

-- ── Compete concede: non-elimination, last conceder ends the table ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.concede(:'gp_id');
reset role;
select is(
  (select player_ended_reason from common.game_players
     where game_id = :'gp_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'conceded', 'compete: conceding ends you, by conceding');
select is((select ended_at from common.games where id = :'gp_id'), null,
  'compete: one conceder of two does NOT end the table');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select crosswords.concede(:'gp_id');
reset role;
select is((select game_ended_outcome from common.games where id = :'gp_id'), 'lost',
  'compete: the last conceder → collective loss');
select is((select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = :'gp_id'),
  'conceded/conceded',
  'compete: collective loss has reason conceded');

-- Concede is compete-only.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  crosswords.concede(:'gc2_id'::uuid),
  '{"type":"not-ok","severity":"fault","dbcode":"PN484",
    "message":"BUG: a concede in a coop game"}'::jsonb,
  'concede is rejected in coop');
reset role;

-- ── Coop give-up (stop_game): a NEUTRAL "finished", not a loss ────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.stop_game(:'gc_id');
reset role;
select is((select game_ended_outcome from common.games where id = :'gc_id'), 'neutral',
  'coop give-up → the game ends neutral, not lost');
select is((select game_ended_reason || '/' || game_ended_by_user_id::text from common.games where id = :'gc_id'),
  'stopped/ada11111-1111-1111-1111-111111111111',
  'coop give-up → reason stopped, ended by the caller');
select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
     where game_id = :'gc_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'unranked/neutral', 'coop give-up → nobody won (but it is not a loss)');

-- A conceded compete player can't check their now-frozen grid (same guard
-- set_cell has). ada concedes gp2 (bea still active → the game goes on).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.concede(:'gp2_id');
select pg_temp.envelope_is(
  crosswords.check_cells(:'gp2_id', '[{"row":0,"col":0}]'::jsonb),
  '{"type":"not-ok","severity":"race","dbcode":"PN483",
    "message":"Already conceded"}'::jsonb,
  'check_cells is rejected for a conceded compete player');
reset role;

-- ── Compete give-up (stop_game): the table stops, neutrally ───────────
-- Concede is NOT the only way out of a race. gp2 still has bea racing and ada
-- conceded above, so this also pins what an end does to a player who already
-- quit: nothing. Unlike the last-conceder path, which is a loss.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select crosswords.stop_game(:'gp2_id');
reset role;
select is((select game_ended_outcome from common.games where id = :'gp2_id'), 'neutral',
  'compete give-up → the game ends neutral, not lost');
select is((select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = :'gp2_id'),
  'stopped/stopped',
  'compete give-up → reason stopped, the same as coop''s end');
select is((select game_ended_by_user_id from common.games where id = :'gp2_id'),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'compete give-up → ended by the caller');
select is(
  (select player_ended_reason || '/' || outcome from common.game_players
     where game_id = :'gp2_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'conceded/lost', 'compete give-up leaves an earlier conceder conceded — their quit is theirs, and a loss');

select * from finish();
rollback;
