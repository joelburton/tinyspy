-- ============================================================
-- Test: boggle.concede(target_game)
-- ============================================================
-- boggle is a NON-elimination game (a player is only ever done by the
-- clock or by conceding), so concede is a thin wrapper over the generic
-- common.concede. Covers the boggle-specific parts: the compete-only
-- mode guard, and that the wrapper delegates (marks the caller,
-- continues while others race, and ends as a collective loss when the
-- last racer drops). Full common.concede matrix: common/concede_test.sql.
-- ============================================================

begin;
set search_path = boggle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(5);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Boggle concede', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.boggle_board()
);

-- (1) ada concedes; bea still races → game continues.
select lives_ok(
  format($$ select boggle.concede(%L) $$, (select id from g)),
  'a compete player can concede');
select is(
  (select conceded from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'the conceder is marked conceded');
select is(
  (select is_terminal from common.games where id = (select id from g)),
  false, 'the game continues while bea races');

-- (2) bea (last racer) concedes → collective loss.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select boggle.concede((select id from g));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select status->>'outcome' from common.games where id = (select id from g)),
  'conceded', 'the last concede ends the game as a collective loss');

-- (3) coop concede rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select * from boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.boggle_board()
);
select throws_ok(
  format($$ select boggle.concede(%L) $$, (select id from gc)),
  'P0001', 'concede is only for compete games',
  'conceding a coop game is rejected');

select * from finish();
rollback;
