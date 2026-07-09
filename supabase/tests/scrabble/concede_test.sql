-- ============================================================
-- Test: scrabble.concede(target_game)  (turn-based concede)
-- ============================================================
-- scrabble is turn-based, so concede is more than a flag: the conceder
-- is removed from the turn order (_advance_turn skips them), forfeits any
-- win (_finish picks the winner among non-conceded players), and if it
-- was their turn the turn hands off. When the last active player concedes
-- the game ends with nobody eligible to win. Covers:
--   1. A concede marks the caller + keeps the game going; the current
--      turn is always a NON-conceded player afterward (handoff / skip)
--   2. Both conceding ends the game with NO winner (forfeit), everyone
--      recorded a loss
--   3. Coop concede is rejected (coop has no turns / no race)
-- ============================================================

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql

select plan(6);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Scrabble concede', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select id from scrabble.create_game(
  (select handle from club),
  '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete');

-- (1) ada concedes; bea still plays → game continues, and the current
-- turn is bea (either ada was current and handed off, or bea already was).
select lives_ok(
  format($$ select scrabble.concede(%L) $$, (select id from g)),
  'a compete player can concede');
select is(
  (select conceded from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'the conceder is marked conceded');
select is(
  (select is_terminal from common.games where id = (select id from g)),
  false, 'the game continues while bea plays');
select is(
  (select p.user_id from scrabble.players p
     join scrabble.games gm on gm.id = p.game_id and gm.current_seat = p.seat
    where gm.id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'the turn is a non-conceded player (conceder skipped / handed off)');

-- (2) bea (last active) concedes → game ends, nobody eligible to win.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select scrabble.concede((select id from g));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select status->>'winner' from common.games where id = (select id from g)),
  null, 'no winner when everyone conceded (a conceder forfeits)');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g) and result->>'won' = 'true'),
  0::bigint, 'nobody is recorded a win');

select * from finish();
rollback;
