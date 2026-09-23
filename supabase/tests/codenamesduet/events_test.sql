-- cs-met-codenamesduet

-- ============================================================
-- Test: codenamesduet.events — what each move writes
-- ============================================================
-- Every move a player makes is one row, in the order it was made:
--   1. a clue — `took_turn` false; its word and count, and whether it is
--      exactly the AI's suggestion;
--   2. a guess — `took_turn` true exactly when the turn number moves on after
--      it: a bystander in ordinary play, and an agent in sudden death, where
--      every guess is a turn of its own. An agent in ordinary play, and a
--      guess that ends the game, move nothing;
--   3. a hint — `log_hint`, only for the clue-giver, `took_turn` false, and no
--      payload at all (the suggestion would spoil the partner's guessing);
--   4. a pass — `took_turn` true;
--   5. so a game on turn N holds N - 1 events that took a turn;
--   6. the table holds its own shape: one clue per turn, and each kind only
--      its own payload columns.
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(18);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- The payload of the one event a query names, as jsonb — the columns that say
-- what the event WAS, so an assertion reads as the row it expects.
create function pg_temp.event_of(g uuid, k text, t int, s text) returns jsonb
language sql as $$
  select jsonb_build_object(
    'took_turn', e.took_turn, 'clue_word', e.clue_word, 'clue_count', e.clue_count,
    'clue_from_ai', e.clue_from_ai,
    'guess_position', e.guess_position, 'guess_result', e.guess_result)
    from codenamesduet.events e
   where e.game_id = g and e.kind = k and e.turn_number = t and e.seat = s
   order by e.id desc
   limit 1;
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada','bea']) as handle;
create temp table g1 on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;

-- Two cells for turn 1's guesser (bea, judged on ada's key) and one for turn
-- 2's (ada, judged on bea's): an agent of ada's, and a bystander of bea's that
-- is not the cell already turned over.
reset role;
create temp table cells on commit drop as
select pg_temp.find_position((select id from g1), 'A', 'G') as a_agent;
alter table cells add column b_bystander int;
update cells set b_bystander = (
  select p from unnest(pg_temp.find_position_set((select id from g1), 'B', 'N')) p
   where p <> (select a_agent from cells) limit 1);
grant select on cells to authenticated;

-- ─── Turn 1: ada clues ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select submit_clue((select id from g1), 'TOOLS', 2);
select is(
  pg_temp.event_of((select id from g1), 'clue', 1, 'A'),
  '{"took_turn":false,"clue_word":"TOOLS","clue_count":2,"clue_from_ai":false,
    "guess_position":null,"guess_result":null}'::jsonb,
  'a clue is logged with its word and count, not the AI''s unless said, and takes no turn'
);

-- ─── bea guesses an agent ───
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select submit_guess((select id from g1), (select a_agent from cells));
select is(
  pg_temp.event_of((select id from g1), 'guess', 1, 'B'),
  jsonb_build_object('took_turn', false, 'clue_word', null, 'clue_count', null,
    'clue_from_ai', null, 'guess_position', (select a_agent from cells), 'guess_result', 'G'),
  'an agent is logged with its tile and label, and takes no turn — the turn goes on'
);

-- ─── The hint: only the clue-giver may ask ───
select pg_temp.envelope_is(
  log_hint((select id from g1)),
  '{"type":"not-ok","severity":"race","dbcode":"PN389",
    "message":"Your partner is giving the clue now"}'::jsonb,
  'log_hint refuses the guesser — the same gate get_clue_context asks'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  log_hint((select id from g1)),
  '{"type":"ok","outcome":null,"data":{"result":"logged"}}'::jsonb,
  'log_hint answers ok/logged for the clue-giver'
);
select is(
  pg_temp.event_of((select id from g1), 'hint', 1, 'A'),
  '{"took_turn":false,"clue_word":null,"clue_count":null,"clue_from_ai":null,
    "guess_position":null,"guess_result":null}'::jsonb,
  'a hint is logged with no payload, and takes no turn'
);

-- ─── bea passes ───
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pass_turn((select id from g1));
select is(
  pg_temp.event_of((select id from g1), 'pass', 1, 'B'),
  '{"took_turn":true,"clue_word":null,"clue_count":null,"clue_from_ai":null,
    "guess_position":null,"guess_result":null}'::jsonb,
  'a pass is logged against the turn it ended, and takes a turn'
);

-- ─── Turn 2: bea gives the AI's clue, ada turns over a bystander ───
select pg_temp.envelope_is(
  submit_clue((select id from g1), 'HAMMER', 1, true),
  '{"type":"ok","data":{"result":"clued","word":"HAMMER","count":1,
    "from_ai":true,"turn_number":2,"by_seat":"B"}}'::jsonb,
  'submit_clue answers with the clue as stored, provenance included'
);
select is(
  pg_temp.event_of((select id from g1), 'clue', 2, 'B') ->> 'clue_from_ai',
  'true',
  'a clue submitted as the AI''s suggestion says so'
);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select submit_guess((select id from g1), (select b_bystander from cells));
select is(
  pg_temp.event_of((select id from g1), 'guess', 2, 'A'),
  jsonb_build_object('took_turn', true, 'clue_word', null, 'clue_count', null,
    'clue_from_ai', null, 'guess_position', (select b_bystander from cells), 'guess_result', 'N'),
  'a bystander in ordinary play is logged as taking a turn — it ended one'
);

reset role;

-- ─── What the game has left behind ───
select is(
  (select array_agg(kind order by id) from codenamesduet.events
    where game_id = (select id from g1)),
  array['clue', 'guess', 'hint', 'pass', 'clue', 'guess'],
  'the events are in the order the moves were made'
);
select is(
  (select count(*)::int from codenamesduet.events
    where game_id = (select id from g1) and took_turn),
  (select turn_number - 1 from codenamesduet.games where id = (select id from g1)),
  'a game on turn N holds N - 1 events that took a turn'
);

-- ─── The table holds its own shape ───
select throws_ok(
  format($$ insert into codenamesduet.events
              (game_id, user_id, kind, took_turn, turn_number, seat, clue_word, clue_count, clue_from_ai)
            values (%L, 'ada11111-1111-1111-1111-111111111111', 'clue', false, 1, 'A', 'AGAIN', 1, false) $$,
         (select id from g1)),
  '23505', null,
  'a second clue for the same turn is refused by the table itself'
);
select throws_ok(
  format($$ insert into codenamesduet.events
              (game_id, user_id, kind, took_turn, turn_number, seat, clue_word, clue_count, clue_from_ai, guess_position)
            values (%L, 'ada11111-1111-1111-1111-111111111111', 'clue', false, 9, 'A', 'WORD', 1, false, 3) $$,
         (select id from g1)),
  '23514', null,
  'a clue carrying a guess''s tile is refused'
);
select throws_ok(
  format($$ insert into codenamesduet.events
              (game_id, user_id, kind, took_turn, turn_number, seat, guess_position, guess_result, clue_word)
            values (%L, 'ada11111-1111-1111-1111-111111111111', 'guess', false, 9, 'A', 3, 'G', 'WORD') $$,
         (select id from g1)),
  '23514', null,
  'a guess carrying a clue''s word is refused'
);
select throws_ok(
  format($$ insert into codenamesduet.events
              (game_id, user_id, kind, took_turn, turn_number, seat, clue_word, clue_count)
            values (%L, 'ada11111-1111-1111-1111-111111111111', 'clue', false, 9, 'A', 'WORD', 1) $$,
         (select id from g1)),
  '23514', null,
  'a clue that does not say whether it is the AI''s is refused'
);
select throws_ok(
  format($$ insert into codenamesduet.events
              (game_id, user_id, kind, took_turn, turn_number, seat, clue_count)
            values (%L, 'ada11111-1111-1111-1111-111111111111', 'pass', true, 9, 'A', 1) $$,
         (select id from g1)),
  '23514', null,
  'a pass carrying any payload is refused'
);

-- ─── Sudden death: every guess is a turn of its own ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;

reset role;
update common.games set play_state = 'sudden_death' where id = (select id from g2);
update codenamesduet.games set turns_remaining = 0, turn_number = 10, current_clue_giver = null
  where id = (select id from g2);

-- The budget is 9, so sudden death is turn 10. ada guesses, judged on bea's
-- key: an agent, then a bystander that loses.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select submit_guess((select id from g2), pg_temp.find_position((select id from g2), 'B', 'G'));
select submit_guess((select id from g2), pg_temp.find_position((select id from g2), 'B', 'N'));
reset role;

select is(
  (select array_agg(guess_result || ':' || took_turn || ':' || turn_number order by id)
     from codenamesduet.events where game_id = (select id from g2)),
  array['G:true:10', 'N:false:11'],
  'in sudden death the agent takes a turn and the next guess is the next turn; the losing guess moves nothing'
);
select is(
  (select turn_number from codenamesduet.games where id = (select id from g2)),
  11,
  'the game ends on the losing guess''s turn'
);

select * from finish();
rollback;
