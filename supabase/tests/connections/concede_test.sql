-- cs-blessed-connections

-- ============================================================
-- Test: connections.concede(target_game)  (elimination-game concede)
-- ============================================================
-- connections is an ELIMINATION game (a player is out at 4 mistakes,
-- without the table ending), so connections.concede records the
-- concession through common._concede, which ends the game once everyone
-- has conceded, then runs its own end check (_maybe_finish_compete),
-- which counts a conceder as ended alongside the eliminated. Covers: a
-- concede keeps the game going while an opponent is still alive; both
-- conceding ends it (conceded, nobody ranked, lost); coop is rejected.
-- ============================================================

begin;
set search_path = connections, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(6);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Conn concede', array['ada', 'bea']) as handle;
create temp table puzzle on commit drop as
select pg_temp.connections_puzzle() as id;
create temp table g on commit drop as
select (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

-- (1) ada concedes; bea is still alive → game continues.
select lives_ok(
  format($$ select connections.concede(%L) $$, (select id from g)),
  'a compete player can concede');
select is(
  (select player_ended_reason from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'conceded', 'the conceder has ended, by conceding');
select is(
  (select ended_at from common.games where id = (select id from g)),
  null, 'the game continues while bea is alive');

-- (2) bea (last alive) concedes → everyone conceded → a collective loss.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select connections.concede((select id from g));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g)),
  'conceded/conceded/lost', 'both conceding ends the game as a collective loss');
-- common._concede ends the game; the builder must still run after it, so the
-- page blobs catch up with the ending.
select is(
  (select (p ->> 'conceded')::boolean
     from common.games cg, jsonb_array_elements(cg.game_data -> 'players') p
    where cg.id = (select id from g) and p ->> 'id' = 'bea22222-2222-2222-2222-222222222222'),
  true, 'the ending concede runs the builder: the last conceder''s player in game_data says conceded');

-- (3) coop concede rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;
select pg_temp.envelope_is(
  connections.concede((select id from gc)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN484",
    "message":"BUG: a concede in a coop game"}'::jsonb,
  'conceding a coop game is rejected');

select * from finish();
rollback;
