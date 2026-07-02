-- ============================================================
-- Test: waffle.concede(target_game)  (elimination-game concede)
-- ============================================================
-- waffle is an ELIMINATION game (a player is done when solved or out of
-- swaps, without the table ending), so waffle.concede flips the shared
-- conceded flag then re-runs its own terminal check
-- (_maybe_finish_compete), which counts a conceder as done and excludes
-- them from the win. Covers: a concede keeps the game going while an
-- opponent races; both conceding ends it as a collective loss (no
-- winner, since a conceder forfeits); coop is rejected.
-- ============================================================

begin;
set search_path = waffle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(6);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Waffle concede', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.waffle_board()
);

-- (1) ada concedes; bea still races → game continues.
select lives_ok(
  format($$ select waffle.concede(%L) $$, (select id from g)),
  'a compete player can concede');
select is(
  (select conceded from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'the conceder is marked conceded');
select is(
  (select is_terminal from common.games where id = (select id from g)),
  false, 'the game continues while bea races');

-- (2) bea (last racer) concedes → nobody eligible to win → lost_compete.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select waffle.concede((select id from g));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from g)),
  'lost_compete', 'both conceding ends the game as a collective loss');
select is(
  (select status->>'winner' from common.games where id = (select id from g)),
  null, 'no winner when everyone conceded (a conceder forfeits)');

-- (3) coop concede rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select * from waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board()
);
select throws_ok(
  format($$ select waffle.concede(%L) $$, (select id from gc)),
  'P0001', 'concede is only for compete games',
  'conceding a coop game is rejected');

select * from finish();
rollback;
