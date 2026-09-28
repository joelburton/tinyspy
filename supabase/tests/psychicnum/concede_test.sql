-- cs-blessed-psychicnum

-- ============================================================
-- Test: psychicnum.concede(p_game_id)  (elimination-game concede)
-- ============================================================
-- psychicnum is an ELIMINATION game (each player has an independent
-- guess budget; a player is done when out of guesses, without the table
-- ending). psychicnum.concede records the concession through
-- common._concede, which ends the game once everyone has conceded, then
-- checks whether any player who hasn't ended still has budget; if not, the
-- game ends as a collective loss. Covers: a concede keeps the game going
-- while an opponent still has budget; both conceding ends it (`conceded`,
-- nobody ranked, everyone `lost`); a concession that leaves only spent
-- players ends it `resource_exhausted`; coop is rejected.
-- ============================================================

begin;
set search_path = psychicnum, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

select plan(10);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Psychic concede', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 7, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
)->'data'->>'id')::uuid as id;

-- (1) ada concedes; bea still has budget → game continues.
select lives_ok(
  format($$ select psychicnum.concede(%L) $$, (select id from g)),
  'a compete player can concede');
select is(
  (select player_ended_reason from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'conceded', 'the conceder has ended, by conceding');
select is(
  (select ended_at from common.games where id = (select id from g)),
  null, 'the game continues while bea has budget');

-- (2) bea (last active) concedes → everyone conceded → a collective loss.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.concede((select id from g));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select game_ended_reason || '/' || game_ended_outcome from common.games where id = (select id from g)),
  'conceded/lost', 'both conceding ends the game as a collective loss');
select is(
  (select array_agg(outcome order by user_id) from common.game_players where game_id = (select id from g)),
  array['lost', 'lost'], 'both conceders lost, unranked');
select is(
  (select game_ended_by_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid, 'the last conceder ended it');

-- (3) ada spends her one guess; bea's concession leaves nobody with budget →
-- the game ends resource_exhausted, not conceded.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gm on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 1, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
)->'data'->>'id')::uuid as id;
reset role;
update psychicnum.games
   set words = array['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel'],
       secrets = array['alpha','bravo','charlie']
 where game_id = (select id from gm);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from gm), 'delta');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.concede((select id from gm));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select player_ended_reason from common.game_players
    where game_id = (select id from gm) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'resource_exhausted', 'a spent racer has ended, out of guesses');
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from gm)),
  'resource_exhausted/exhausted/lost',
  'a concession that leaves only spent players ends the game exhausted');
select is(
  (select array_agg(outcome order by user_id) from common.game_players where game_id = (select id from gm)),
  array['lost', 'lost'], 'nobody found the set, so everyone lost');

-- (4) coop concede rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 7, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
)->'data'->>'id')::uuid as id;
select pg_temp.envelope_is(
  psychicnum.concede((select id from gc)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN484",
    "message":"BUG: a concede in a coop game"}'::jsonb,
  'conceding a coop game is rejected');

select * from finish();
rollback;
