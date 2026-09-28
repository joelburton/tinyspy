-- cs-unmet

-- ============================================================
-- Test: stackdown.concede(target_game)
-- ============================================================
-- stackdown compete is a race to clear the stack (first to clear wins),
-- with no other way for a player to end — so concede locks its row and
-- hands the rest to common._concede, which ends the game once everyone has
-- conceded. Covers the mode guard + that the wrapper delegates. Full
-- matrix: common/concede_test.sql.
-- ============================================================

begin;
set search_path = stackdown, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(5);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Stack concede', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (stackdown.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

-- (1) ada concedes; bea still races → game continues.
select lives_ok(
  format($$ select stackdown.concede(%L) $$, (select id from g)),
  'a compete player can concede');
select is(
  (select player_ended_reason from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'conceded', 'the conceder has ended, by conceding');
select is(
  (select ended_at from common.games where id = (select id from g)),
  null, 'the game continues while bea races');

-- (2) bea (last racer) concedes → collective loss.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select stackdown.concede((select id from g));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
          || '/' || game_ended_by_user_id::text
     from common.games where id = (select id from g)),
  'conceded/conceded/lost/bea22222-2222-2222-2222-222222222222',
  'the last concede ends the game as a collective loss, ended by the last conceder');

-- (3) coop concede rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select (stackdown.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;
select pg_temp.envelope_is(
  stackdown.concede((select id from gc)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN484",
    "message":"BUG: a concede in a coop game"}'::jsonb,
  'conceding a coop game is rejected');

select * from finish();
rollback;
