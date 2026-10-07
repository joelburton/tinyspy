-- cs-unmet

-- ============================================================
-- Test: waffle.concede(target_game)  (elimination-game concede)
-- ============================================================
-- waffle is an ELIMINATION game (a player is done when solved or out of
-- swaps, without the table ending), so waffle.concede records the
-- concession through common._concede, which ends the game once everyone has
-- conceded, then runs its own end check (_maybe_finish_compete), which
-- counts a conceder as ended and leaves them unranked. Covers: a concede
-- keeps the game going while an opponent races; both conceding ends it as a
-- collective loss (no winner, since a conceder forfeits); coop is rejected.
-- ============================================================

begin;
set search_path = waffle, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(7);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Waffle concede', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.waffle_board()
)->'data'->>'id')::uuid as id;

-- (1) ada concedes; bea still races → game continues.
select lives_ok(
  format($$ select waffle.concede(%L) $$, (select id from g)),
  'a compete player can concede');
select is(
  (select player_ended_reason from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'conceded', 'the conceder has ended, by conceding');
select is(
  (select ended_at from common.games where id = (select id from g)),
  null, 'the game continues while bea races');

-- (2) bea (last racer) concedes → nobody eligible to win → a collective loss.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select waffle.concede((select id from g));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select game_ended_outcome from common.games where id = (select id from g)),
  'lost', 'both conceding ends the game as a collective loss');
select is(
  (select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g)),
  '[]'::jsonb, 'no winner when everyone conceded (a conceder forfeits)');
-- The two ways a race ends with nobody winning are both `lost`; the reason is
-- what lets the club list tell "everyone spent their swaps" from "everyone
-- walked away".
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g)),
  'conceded/conceded', 'an all-conceded race ends conceded, not exhausted');

-- (3) coop concede rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select (waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board()
)->'data'->>'id')::uuid as id;
select pg_temp.envelope_is(
  waffle.concede((select id from gc)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN484",
    "message":"BUG: a concede in a coop game"}'::jsonb,
  'conceding a coop game is rejected');

select * from finish();
rollback;
