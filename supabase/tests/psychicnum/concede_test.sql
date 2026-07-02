-- ============================================================
-- Test: psychicnum.concede(target_game)  (elimination-game concede)
-- ============================================================
-- psychicnum is an ELIMINATION game (each player has an independent
-- guess budget; a player is done when out of guesses, without the table
-- ending). psychicnum.concede flips the shared conceded flag then checks
-- whether any NON-conceded player still has budget; if not, the game
-- ends as a collective loss. Covers: a concede keeps the game going
-- while an opponent still has budget; both conceding ends it
-- (lost_compete, no winner); coop is rejected.
-- ============================================================

begin;
set search_path = psychicnum, common, public, extensions;
\ir ../_shared/setup.psql

select plan(5);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Psychic concede', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select psychicnum.create_game(
  (select handle from club),
  '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
) as id;

-- (1) ada concedes; bea still has budget → game continues.
select lives_ok(
  format($$ select psychicnum.concede(%L) $$, (select id from g)),
  'a compete player can concede');
select is(
  (select conceded from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'the conceder is marked conceded');
select is(
  (select is_terminal from common.games where id = (select id from g)),
  false, 'the game continues while bea has budget');

-- (2) bea (last active) concedes → nobody with budget left → lost_compete.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.concede((select id from g));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from g)),
  'lost_compete', 'both conceding ends the game as a collective loss');

-- (3) coop concede rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select psychicnum.create_game(
  (select handle from club),
  '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
) as id;
select throws_ok(
  format($$ select psychicnum.concede(%L) $$, (select id from gc)),
  'P0001', 'concede is only for compete games',
  'conceding a coop game is rejected');

select * from finish();
rollback;
