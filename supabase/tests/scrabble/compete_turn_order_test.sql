-- cs-unmet

-- ============================================================
-- Test: scrabble COMPETE turn order (the common turn pointer)
-- ============================================================
-- Compete rides the common turn order: each player's `turn_seat` is their
-- scrabble seat (humans, then bots), and `common.games.current_turn_user_id`
-- names whose turn it is — a bot's as much as a person's.
-- Covers:
--   1. create_game seats every player at their scrabble seat and points the
--      turn at one of them
--   2. an out-of-turn move is the shared race (PN243)
--   3. an exchange, a pass and a bot's pass each hand the turn to the next seat
--   4. get_ai_context finds the bot seat through the pointer
--   5. a player who concedes on their turn hands it on, and is skipped after
--   6. replay_board keeps the seats and points the turn at a seated player
-- ============================================================

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(13);

-- ada (seat 0), bea (seat 1), the first bot (seat 2).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select pg_temp.create_club('Scrabble race', array['ada', 'bea']) as handle;
reset role;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;

-- The game's current version, which every move sends back.
create function pg_temp.v() returns int language sql as $$
  select version from scrabble.games where id = (select id from g);
$$;

-- (1) The seats and the pointer.
select is(
  (select count(*)::int
     from common.game_players gp
     join scrabble.players p on p.game_id = gp.game_id and p.user_id = gp.user_id
    where gp.game_id = (select id from g) and gp.turn_seat = p.seat),
  3, 'create_game seats every player at their scrabble seat');
select ok(
  pg_temp.sc_current_seat((select id from g)) in (0, 1, 2),
  'create_game points the turn at a seated player');

select pg_temp.sc_turn((select id from g), 'ada11111-1111-1111-1111-111111111111');
select pg_temp.sc_rack((select id from g), 'ada11111-1111-1111-1111-111111111111',
  array['A','B','C','D','E','F','G']);
select pg_temp.sc_rack((select id from g), 'bea22222-2222-2222-2222-222222222222',
  array['H','I','J','K','L','M','N']);
select pg_temp.sc_bag((select id from g),
  array['O','P','Q','R','S','T','U','V','W','X','Y','Z']);

-- (2) bea moves on ada's turn.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  scrabble.exchange_tiles((select id from g), pg_temp.v(), array['H']),
  '{"type":"not-ok","severity":"race","dbcode":"PN243","message":"Not your turn"}'::jsonb,
  'a move out of turn is the shared race');
reset role;

-- (3) ada exchanges → bea; bea passes → the bot; the bot passes → ada.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select scrabble.exchange_tiles((select id from g), pg_temp.v(), array['A']) -> 'data' ->> 'result'),
  'exchanged', 'the player on turn may exchange');
reset role;
select is(pg_temp.sc_current_seat((select id from g)), 1, 'an exchange hands the turn to the next seat');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select scrabble.pass_turn((select id from g), pg_temp.v());
reset role;
select is(pg_temp.sc_current_seat((select id from g)), 2, 'a pass hands the turn to the bot''s seat');

-- (4) The bot's turn, found through the pointer.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select scrabble.get_ai_context((select id from g)) -> 'data' ->> 'seat'),
  '2', 'get_ai_context answers for the seat whose bot holds the turn');
select is(
  (select scrabble.ai_pass_turn((select id from g), 2, pg_temp.v()) -> 'data' ->> 'result'),
  'passed', 'the bot passes on its turn');
reset role;
select is(pg_temp.sc_current_seat((select id from g)), 0, 'the bot''s pass wraps the turn to seat 0');

-- (5) ada concedes on her own turn → bea; bea exchanges → the bot, past ada.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.concede((select id from g));
reset role;
select is(pg_temp.sc_current_seat((select id from g)), 1, 'conceding on your turn hands it on');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select scrabble.exchange_tiles((select id from g), pg_temp.v(), array['H']);
reset role;
select is(pg_temp.sc_current_seat((select id from g)), 2, 'the rotation skips a player who conceded');

-- (6) A restart keeps the seats and points at a seated player.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select scrabble.replay_board((select id from g));
reset role;
select is(
  (select count(*)::int
     from common.game_players gp
     join scrabble.players p on p.game_id = gp.game_id and p.user_id = gp.user_id
    where gp.game_id = (select id from g) and gp.turn_seat = p.seat),
  3, 'replay_board keeps every player at their scrabble seat');
select ok(
  pg_temp.sc_current_seat((select id from g)) in (0, 1, 2),
  'replay_board points the turn at a seated player');

select * from finish();
rollback;
