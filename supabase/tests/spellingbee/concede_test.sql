-- ============================================================
-- Test: spellingbee.concede(target_game)
-- ============================================================
-- spellingbee is a NON-elimination game (a player is only ever done
-- by winning — first to the target rank — or by conceding), so its
-- concede is a thin wrapper over the generic common.concede. This
-- test covers the spellingbee-specific parts: the compete-only mode
-- guard, and that the wrapper delegates (marks the caller conceded,
-- keeps the game going while others race, and — via common.concede —
-- ends it as a collective loss when the last racer drops out). The
-- full common.concede matrix is in common/concede_test.sql.
-- ============================================================

begin;
set search_path = spellingbee, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(6);

-- ─── A 3-player compete game (ada, bea, cade) ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Bee concede', array['ada', 'bea', 'cade']) as handle;
create temp table g on commit drop as
select * from spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup() || '{"target_rank": 2}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.spellingbee_board()
);

-- ─── (1) ada concedes; bea + cade still race ───
select lives_ok(
  format($$ select spellingbee.concede(%L) $$, (select id from g)),
  'a compete player can concede'
);
select is(
  (select conceded from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'the conceder is marked conceded');
select is(
  (select is_terminal from common.games where id = (select id from g)),
  false, 'the game continues while others race');

-- ─── (2) bea then cade concede → last one out ends it (collective loss) ───
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select spellingbee.concede((select id from g));
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select spellingbee.concede((select id from g));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from g)),
  'lost', 'everyone conceding ends the game as a collective loss');
select is(
  (select status->>'outcome' from common.games where id = (select id from g)),
  'conceded', 'status.outcome is conceded');

-- ─── (3) concede is rejected in coop ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select * from spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.spellingbee_board()
);
select throws_ok(
  format($$ select spellingbee.concede(%L) $$, (select id from gc)),
  'P0001',
  'concede is only for compete games',
  'conceding a coop game is rejected'
);

select * from finish();
rollback;
