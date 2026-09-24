-- cs-blessed-wordwheel

-- ============================================================
-- Test: wordwheel.concede(target_game)
-- ============================================================
-- A fork of spellingbee's concede_test. wordwheel is a NON-elimination
-- game (a player is only ever done by winning — first to the target
-- rank — or by conceding), so its concede is a thin wrapper over the
-- generic common.concede. This test covers the wordwheel-specific parts:
-- the compete-only mode guard; that the wrapper delegates (marks the
-- caller conceded, keeps the game going while others race, and — via
-- common.concede — ends it as a collective loss when the last racer drops
-- out); that a conceder's next word is refused (PN358), so they cannot go
-- on to win; and that only the concede that ENDS the game touches the found
-- rows, which is what wakes the reveal. The full common.concede matrix is
-- in common/concede_test.sql.
-- ============================================================

begin;
set search_path = wordwheel, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(9);

-- ─── A 3-player compete game (ada, bea, cade) ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wheel concede', array['ada', 'bea', 'cade']) as handle;
create temp table g on commit drop as
select (wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup() || '{"target_rank": 2}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.wordwheel_board()
)->'data'->>'id')::uuid as id;

-- ─── (1) ada concedes; bea + cade still race ───
select lives_ok(
  format($$ select wordwheel.concede(%L) $$, (select id from g)),
  'a compete player can concede'
);
select is(
  (select conceded from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'the conceder is marked conceded');
select is(
  (select is_terminal from common.games where id = (select id from g)),
  false, 'the game continues while others race');

-- A conceder is out of the race: their next word is refused, so they cannot
-- go on to reach the target and be recorded the winner.
select pg_temp.envelope_is(
  wordwheel.submit_word((select id from g), 'bead', 1, false, false),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN358",
    "message":"Already conceded"}'::jsonb,
  'a conceder cannot submit a word');

-- ─── (2) bea then cade concede → last one out ends it (collective loss) ───
-- bea finds a word first, so the reveal touch below has a row to touch.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordwheel.submit_word((select id from g), 'bead', 1, false, false);

-- The touch is ctid-visible: the no-op update writes a new row version, and
-- this whole file is one transaction, so xmin would not change.
reset role;
create temp table before_last on commit drop as
select ctid::text as version from wordwheel.found_words where game_id = (select id from g);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordwheel.concede((select id from g));
reset role;
select is(
  (select ctid::text from wordwheel.found_words where game_id = (select id from g)),
  (select version from before_last),
  'a concede that leaves racers in the game does not touch the found rows');

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select wordwheel.concede((select id from g));
reset role;
select isnt(
  (select ctid::text from wordwheel.found_words where game_id = (select id from g)),
  (select version from before_last),
  'the last concede, which ends the game, touches the found rows (the reveal wakes)');
select set_config('request.jwt.claims', '', true);
select is(
  (select play_state from common.games where id = (select id from g)),
  'lost_compete', 'everyone conceding ends the game as a collective loss');
select is(
  (select status->>'reason' from common.games where id = (select id from g)),
  'conceded', 'status.reason is conceded');

-- ─── (3) concede is rejected in coop ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select (wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordwheel_board()
)->'data'->>'id')::uuid as id;
select pg_temp.envelope_is(
  wordwheel.concede((select id from gc)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN484",
    "message":"BUG: a concede in a coop game"}'::jsonb,
  'conceding a coop game is rejected');

select * from finish();
rollback;
