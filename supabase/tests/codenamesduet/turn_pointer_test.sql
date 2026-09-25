-- cs-unmet

-- ============================================================
-- Test: the shared turn pointer names whoever must act now
-- ============================================================
--
-- codenamesduet keeps its turn in its own state (the clue seat, and whether
-- this turn's clue is in), and mirrors it onto the common turn order so the
-- page reads the turn the way it does in every game
-- (docs/win-lose.md → Where a player stands):
--
--   1. create_game seats both players — A at 0, B at 1 — and points at A,
--      who owes the first clue
--   2. a clue moves the pointer to the guesser; a turn that ends moves it to
--      the next clue-giver; a restart moves it back to A
--   3. sudden death with words left on both sides points at NOBODY — the
--      rulebook lets either guess, which one pointer cannot say
--   4. sudden death with one side's words all found points at the one player
--      who still has words to guess, and the other player's guess is
--      refused: they have none
--
-- A guess is read off the PARTNER's key in sudden death, so a player has
-- words to guess while their partner's key still has an agent unfound.
--
-- See `create_game_test.sql` for the pgTAP primer.
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(11);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- Who the shared pointer names, read as postgres.
create function pg_temp.pointer(g uuid) returns uuid
language sql as $$
  select current_turn_user_id from common.games where id = g;
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada','bea']) as handle;
create temp table g on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;

-- ============================================================
-- (1) Both players seated; the pointer on A, who owes the clue
-- ============================================================
reset role;
select is(
  (select array_agg(turn_seat order by turn_seat) from common.game_players
    where game_id = (select id from g)),
  array[0, 1],
  'create_game seats both players in a turn order'
);
select is(
  (select turn_seat from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  0,
  'the first clue-giver, seated A, is seat 0'
);
select is(pg_temp.pointer((select id from g)), 'ada11111-1111-1111-1111-111111111111'::uuid,
  'a new game points at A, who owes the first clue');

-- ============================================================
-- (2) The pointer follows the move
-- ============================================================
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select submit_clue((select id from g), 'FIRST', 1);
reset role;
select is(pg_temp.pointer((select id from g)), 'bea22222-2222-2222-2222-222222222222'::uuid,
  'once the clue is in, the pointer names the guesser');

-- Bea turns over a bystander on ada's key: the turn ends, the seats swap.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select submit_guess((select id from g), pg_temp.find_position((select id from g), 'A', 'N'));
reset role;
select is(pg_temp.pointer((select id from g)), 'bea22222-2222-2222-2222-222222222222'::uuid,
  'a turn that ends points at the next clue-giver');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select replay_board((select id from g));
reset role;
select is(pg_temp.pointer((select id from g)), 'ada11111-1111-1111-1111-111111111111'::uuid,
  'a restart points back at A');

-- ============================================================
-- (3) Sudden death, words left on both sides: nobody's turn
-- ============================================================
update codenamesduet.games set turns_remaining = 1, turn_number = 9
  where id = (select id from g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select submit_clue((select id from g), 'LAST', 1);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pass_turn((select id from g));
reset role;
select is(pg_temp.pointer((select id from g)), null,
  'sudden death with words on both sides points at nobody');

-- ============================================================
-- (4) Sudden death, one side's words all found
-- ============================================================
-- A second game in which every agent on ADA's key is found. A guess reads the
-- partner's key in sudden death, so bea — who guesses off ada's key — has
-- nothing left to guess, and ada still does.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;
reset role;
update codenamesduet.words w set revealed_as = 'G'
  from codenamesduet.games gm
 where w.game_id = gm.id and gm.id = (select id from g2)
   and gm.key_card_a ->> w.position = 'G';
update codenamesduet.games set turns_remaining = 1, turn_number = 9
  where id = (select id from g2);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select submit_clue((select id from g2), 'LAST', 1);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pass_turn((select id from g2));
reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'sudden_death',
  'the second game is in sudden death'
);
select is(pg_temp.pointer((select id from g2)), 'ada11111-1111-1111-1111-111111111111'::uuid,
  'sudden death points at the one player who still has words to guess');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  submit_guess((select id from g2), pg_temp.find_position((select id from g2), 'A', 'N')),
  '{"type":"not-ok","severity":"race","dbcode":"PN509",
    "message":"No words left to guess"}'::jsonb,
  'a player with no words left is refused a sudden-death guess'
);
reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'sudden_death',
  '…and the refused guess leaves the game in sudden death'
);

-- ============================================================
select * from finish();
rollback;
