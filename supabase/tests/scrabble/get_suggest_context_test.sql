-- cs-unmet

-- ============================================================
-- Test: scrabble.get_suggest_context
-- ============================================================
-- The move suggester's context RPC (docs/scrabble-ai.md S4): SECURITY
-- DEFINER, so it can hand the edge function the grant-hidden dictionary
-- bands — which makes its own gates the whole security story:
--   membership (require_game_player), play_state = playing, mode = coop.
-- The happy path must return all five keys atomically.

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(9);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select pg_temp.create_club('Suggest', array['ada', 'bea']) as handle;

create temp table gco on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 2, "dict_3plus": 5, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;
reset role;
select pg_temp.sc_coop((select id from gco), array['A','B','C','D','E','F','?'],
  array['H','I','J']);

-- ─── Gates ───────────────────────────────────────────────
-- cade is a club non-member who never sat down at this game.
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select pg_temp.envelope_is(
  scrabble.get_suggest_context((select id from gco)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player is rejected');
reset role;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gcp on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 2, "dict_3plus": 5, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
-- A FAULT: mode is fixed at create_game and the FE renders no suggest button
-- in compete, so nothing unbroken asks.
select pg_temp.envelope_is(
  scrabble.get_suggest_context((select id from gcp)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN462",
    "message":"BUG: a suggestion in a compete game"}'::jsonb,
  'a compete game is rejected — hints are a coop feature');
reset role;

-- A non-playing game (rig play_state directly; the state machinery has its
-- own tests) is rejected even for a legit player.
update common.games set play_state = 'suspended' where id = (select id from gco);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- A RACE: a teammate can end the game while the suggest button is on screen.
select pg_temp.envelope_is(
  scrabble.get_suggest_context((select id from gco)),
  '{"type":"not-ok","severity":"race","dbcode":"PN461",
    "message":"Game over"}'::jsonb,
  'a non-playing game is rejected');
reset role;
update common.games set play_state = 'playing' where id = (select id from gco);

-- ─── Happy path: the five-key atomic snapshot ────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ctx on commit drop as
  select scrabble.get_suggest_context((select id from gco)) -> 'data' as c;
reset role;

-- The five keys, plus the `result` that names the answer — which is what lets
-- the edge function branch on the answer rather than on a key being present.
select is(
  (select array(select jsonb_object_keys(c) order by 1) from ctx),
  array['board', 'dict_2', 'dict_3plus', 'rack', 'result', 'version'],
  'the context carries exactly the five expected keys, and names itself');
select is((select (c->>'dict_2')::int from ctx), 2,
  'dict_2 is the grant-hidden band from setup');
select is((select (c->>'dict_3plus')::int from ctx), 5,
  'dict_3plus is the grant-hidden band from setup');
select is((select (c->>'version')::int from ctx), 0,
  'version is the current optimistic-concurrency counter');
select is((select jsonb_array_length(c->'board') from ctx), 225,
  'board is the flat 225-cell array');
select is((select c->'rack' from ctx), '["A","B","C","D","E","F","?"]'::jsonb,
  'rack is the shared coop rack, blanks included');

select * from finish();
rollback;
