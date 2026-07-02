-- ============================================================
-- Test: connections.concede(target_game)  (elimination-game concede)
-- ============================================================
-- connections is an ELIMINATION game (a player is out at 4 mistakes,
-- without the table ending), so connections.concede flips the shared
-- conceded flag then re-runs its own terminal check
-- (_maybe_finish_compete), which counts a conceder as "not alive"
-- alongside the eliminated. Covers: a concede keeps the game going while
-- an opponent is still alive; both conceding ends it (nobody alive,
-- nobody solved → lost_compete); coop is rejected.
-- ============================================================

begin;
set search_path = connections, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(5);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Conn concede', array['ada', 'bea']) as handle;
create temp table puzzle on commit drop as
select pg_temp.connections_puzzle() as id;
create temp table g on commit drop as
select * from connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);

-- (1) ada concedes; bea is still alive → game continues.
select lives_ok(
  format($$ select connections.concede(%L) $$, (select id from g)),
  'a compete player can concede');
select is(
  (select conceded from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'the conceder is marked conceded');
select is(
  (select is_terminal from common.games where id = (select id from g)),
  false, 'the game continues while bea is alive');

-- (2) bea (last alive) concedes → nobody alive, nobody solved → lost_compete.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select connections.concede((select id from g));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from g)),
  'lost_compete', 'both conceding ends the game as a collective loss');

-- (3) coop concede rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select * from connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);
select throws_ok(
  format($$ select connections.concede(%L) $$, (select id from gc)),
  'P0001', 'concede is only for compete games',
  'conceding a coop game is rejected');

select * from finish();
rollback;
