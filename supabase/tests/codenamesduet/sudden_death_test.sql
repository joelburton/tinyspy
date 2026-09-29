-- cs-blessed-codenamesduet

-- ============================================================
-- Test: sudden death rules
-- ============================================================
--
-- Sudden death triggers when the last turn is spent and agents remain: it is
-- `turn_number` past `max_turns` on a game that hasn't ended. The game here is
-- put ONE turn from the end (the turn number is the only thing set by hand),
-- and the last turn is spent the real way — a clue and a pass — so what
-- `_end_turn` writes on the way in is what gets checked:
--
--   1. the pass answers turns_remaining 0, with no clue-giver, and the rows
--      say so
--   2. a clue, a pass and the AI suggester are each refused, as races, in
--      words that say sudden death rather than game over
--   3. submit_guess works for a player with words left to guess (both have
--      them here; `turn_pointer_test.sql` covers the side that does not),
--      and a green reveal keeps the game going
--   4. a bystander loses the game, fatal_move / 'neutral'
--   5. an assassin loses it, fatal_move / 'assassin', as it does in ordinary
--      play
--
-- For the reveal label, sudden death uses the *partner's* view
-- (the seat opposite the guesser). So when ada guesses, we
-- look up positions on bea's key view to find a "green for ada
-- to hit" or "neutral for ada to hit".
--
-- See `create_game_test.sql` for the pgTAP primer.
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- A game one turn from the end
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada','bea']) as handle;
create temp table g on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;

-- The budget is the one thing set by hand, as postgres (the table has no
-- UPDATE grant for the authenticated role): turn 9 of 9.
reset role;
update codenamesduet.games set turn_number = 9
  where game_id = (select id from g);

-- ============================================================
-- (1) The last pass drops the game into sudden death
-- ============================================================
-- Ada holds the clue (seat A opens); she clues, bea passes.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select submit_clue((select id from g), 'LAST', 1);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  pass_turn((select id from g)),
  '{"type":"ok","data":{"result":"passed","turn_number":10,"turns_remaining":0,
    "clue_giver":null}}'::jsonb,
  'the pass that spends the last turn answers turns_remaining 0, with no clue-giver'
);

select is(
  (select (cg.ended_at is null)::text || '/' || greatest(g.max_turns - g.turn_number + 1, 0)
     from common.games cg join codenamesduet.games g on g.game_id = cg.id
    where cg.id = (select id from g)),
  'true/0',
  'the last pass drops the game into sudden death: not ended, no turns left'
);

select is(
  (select current_clue_giver from codenamesduet.games where game_id = (select id from g)),
  null,
  'nobody holds the clue seat in sudden death'
);

-- ============================================================
-- (2) A clue, a pass and the AI are refused, in sudden death's words
-- ============================================================
-- Each a RACE rather than a fault: the controls are drawn from state that
-- arrives by subscription, so the turn that spent the last budget can land
-- while they are still up.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  submit_clue((select id from g), 'CLUE', 1),
  '{"type":"not-ok","severity":"race","dbcode":"PN502",
    "message":"Sudden death — no more clues"}'::jsonb,
  'submit_clue in sudden death is refused as sudden death, not game over'
);

select pg_temp.envelope_is(
  pass_turn((select id from g)),
  '{"type":"not-ok","severity":"race","dbcode":"PN503",
    "message":"Sudden death — no turn to pass"}'::jsonb,
  'pass_turn in sudden death is refused as sudden death, not game over'
);

select pg_temp.envelope_is(
  get_clue_context((select id from g)),
  '{"type":"not-ok","severity":"race","dbcode":"PN504",
    "message":"Sudden death — no more clues"}'::jsonb,
  'the AI suggester in sudden death is refused in submit_clue''s words'
);

-- ============================================================
-- (3) A green guess works, and the game stays in sudden death
-- ============================================================
-- Ada guesses; the reveal uses bea's view. We look up a 'G' on bea's
-- side and submit it.

select pg_temp.envelope_is(
  submit_guess(
    (select id from g),
    pg_temp.find_position((select id from g), 'B', 'G')
  ),
  '{"type":"ok","outcome":null,"data":{"result":"agent","revealed":"G",
    "found_agents_count":1,"turns_remaining":0}}'::jsonb,
  'green reveal in sudden death answers ok/agent and stays in sudden death'
);

select is(
  (select (cg.ended_at is null)::text || '/' || greatest(g.max_turns - g.turn_number + 1, 0)
     from common.games cg join codenamesduet.games g on g.game_id = cg.id
    where cg.id = (select id from g)),
  'true/0',
  'the game stays in sudden death after a green reveal'
);

-- ============================================================
-- (4) Any non-green loses the game, fatal_move / neutral
-- ============================================================
-- A neutral on the partner's view is enough.

select pg_temp.envelope_is(
  submit_guess(
    (select id from g),
    pg_temp.find_position((select id from g), 'B', 'N')
  ),
  '{"type":"ok","outcome":null,"data":{"result":"lost","reason":"neutral",
    "revealed":"N","found_agents_count":1}}'::jsonb,
  'a neutral in sudden death answers ok/lost, reason neutral — the game is over'
);

select is(
  (select array[game_ended_outcome, game_ended_reason, game_ended_reason_detail,
                game_ended_by_user_id::text]
     from common.games where id = (select id from g)),
  array['lost', 'fatal_move', 'neutral', 'ada11111-1111-1111-1111-111111111111'],
  'a non-green reveal in sudden death ends the game lost, fatal_move / neutral, by the guesser'
);

-- ============================================================
-- (5) An assassin in sudden death is still the assassin's loss
-- ============================================================
-- A second game, brought to sudden death the same real way.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;
reset role;
update codenamesduet.games set turn_number = 9
  where game_id = (select id from g2);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select submit_clue((select id from g2), 'LAST', 1);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pass_turn((select id from g2));

-- Ada guesses; the reveal uses bea's view, so an assassin on bea's side.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  submit_guess(
    (select id from g2),
    pg_temp.find_position((select id from g2), 'B', 'A')
  ),
  '{"type":"ok","outcome":null,"data":{"result":"lost","reason":"assassin","revealed":"A"}}'::jsonb,
  'an assassin in sudden death answers ok/lost, reason assassin, not neutral'
);

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g2)),
  'fatal_move/assassin',
  'and its reason is the assassin, not the spent budget'
);

-- ============================================================
select * from finish();
rollback;
