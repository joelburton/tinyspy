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
  (select conceded from common.game_players
     where game_id = :'gp_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'compete: conceding flips your conceded flag');
select is((select play_state from common.games where id = :'gp_id'), 'playing',
  'compete: one conceder of two does NOT end the table');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select crosswords.concede(:'gp_id');
reset role;
select is((select play_state from common.games where id = :'gp_id'), 'lost_compete',
  'compete: the last conceder → collective loss');
select is((select status ->> 'outcome' from common.games where id = :'gp_id'), 'conceded',
  'compete: collective loss has outcome = conceded');

-- Concede is compete-only.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  crosswords.concede(:'gc2_id'::uuid),
  '{"type":"not-ok","severity":"fault","dbcode":"PN484",
    "message":"BUG: a concede in a coop game"}'::jsonb,
  'concede is rejected in coop');
reset role;

-- ── Coop give-up (end_game): a NEUTRAL "finished", not a loss ────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.end_game(:'gc_id');
reset role;
select is((select play_state from common.games where id = :'gc_id'), 'ended',
  'coop give-up → play_state ended (neutral, not lost)');
select is((select status ->> 'outcome' from common.games where id = :'gc_id'), 'manual',
  'coop give-up → outcome manual (the roster''s word for a player-fired stop)');
select is(
  (select result -> 'won' from common.game_players
     where game_id = :'gc_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'false'::jsonb, 'coop give-up → nobody "won" (but it is not a loss)');

-- A conceded compete player can't check their now-frozen grid (same guard
-- set_cell has). ada concedes gp2 (bea still active → game stays playing).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.concede(:'gp2_id');
select pg_temp.envelope_is(
  crosswords.check_cells(:'gp2_id', '[{"row":0,"col":0}]'::jsonb),
  '{"type":"not-ok","severity":"race","dbcode":"PN474",
    "message":"Already conceded"}'::jsonb,
  'check_cells is rejected for a conceded compete player');
reset role;

-- ── Compete give-up (end_game): the table stops, neutrally ───────────
-- Concede is NOT the only way out of a race. gp2 still has bea racing and ada
-- conceded above, so this also pins what an end does to a player who already
-- quit: nothing. Unlike the last-conceder path, which is `lost_compete`.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select crosswords.end_game(:'gp2_id');
reset role;
select is((select play_state from common.games where id = :'gp2_id'), 'ended',
  'compete give-up → play_state ended (neutral, not lost_compete)');
select is((select status ->> 'outcome' from common.games where id = :'gp2_id'), 'manual',
  'compete give-up → outcome manual, the same word coop''s end writes');
select is((select status ->> 'mode' from common.games where id = :'gp2_id'), 'compete',
  'compete give-up → the status blob says which mode ended');
select is(
  (select conceded from common.game_players
     where game_id = :'gp2_id' and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'compete give-up leaves an earlier conceder conceded — their quit is theirs');

select * from finish();
rollback;
