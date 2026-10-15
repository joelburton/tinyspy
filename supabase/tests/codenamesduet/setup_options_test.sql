-- cs-unmet

-- ============================================================
-- Test: the three setup options
-- ============================================================
--
--   guess_required            no pass before the turn's first guess
--   strict_words              a clue is the letters a to z
--   can_decline_clue_giving   the clue-giver declines: no turn is spent, the
--                             partner clues from then on, and when nobody is
--                             left to clue, sudden death begins early
--
-- Each game turns on only the option it tests. A seat is made "done" as
-- clue_giver_handoff_test.sql does it: its agents marked contacted directly,
-- as the test role.
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(32);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada','bea']) as handle;

-- A game with the given options on top of the default setup; ada is seat A.
create function pg_temp.new_game(options jsonb) returns uuid
language sql as $$
  select (codenamesduet.create_game((select handle from club),
    pg_temp.codenamesduet_setup() || options,
    pg_temp.codenamesduet_players())->'data'->>'id')::uuid;
$$;

-- ============================================================
-- guess_required
-- ============================================================
create temp table g_guess on commit drop as
select pg_temp.new_game('{"guess_required": true}') as id;

select submit_clue((select id from g_guess), 'one', 1);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

select is(
  (select game_data -> 'turns' -> 'passAllowed' from common.games where id = (select id from g_guess)),
  'false'::jsonb,
  'guess_required: the page grays Pass before the turn''s first guess'
);

select pg_temp.envelope_is(
  pass_turn((select id from g_guess)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN631"}'::jsonb,
  'guess_required: a pass before the turn''s first guess is a fault'
);

select submit_guess((select id from g_guess),
  pg_temp.find_position((select id from g_guess), 'A', 'G'));

select is(
  (select game_data -> 'turns' -> 'passAllowed' from common.games where id = (select id from g_guess)),
  'true'::jsonb,
  'guess_required: the page opens Pass once a guess is in'
);

select pg_temp.envelope_is(
  pass_turn((select id from g_guess)),
  '{"type":"ok","data":{"result":"passed"}}'::jsonb,
  'guess_required: after a guess, the pass goes through'
);

-- ============================================================
-- strict_words
-- ============================================================
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_strict on commit drop as
select pg_temp.new_game('{"strict_words": true}') as id;

select pg_temp.envelope_is(
  submit_clue((select id from g_strict), 'ice cream', 2),
  '{"type":"not-ok","severity":"fault","dbcode":"PN630"}'::jsonb,
  'strict_words: a space in the clue is a fault'
);

select pg_temp.envelope_is(
  submit_clue((select id from g_strict), 'x-ray', 2),
  '{"type":"not-ok","severity":"fault","dbcode":"PN630"}'::jsonb,
  'strict_words: a hyphen in the clue is a fault'
);

select pg_temp.envelope_is(
  submit_clue((select id from g_strict), 'Ocean', 2),
  '{"type":"ok","data":{"result":"clued","clue_word":"ocean"}}'::jsonb,
  'strict_words: letters go through, stored lowercase'
);

-- Off, a clue may be anything.
create temp table g_loose on commit drop as
select pg_temp.new_game('{}') as id;

select pg_temp.envelope_is(
  submit_clue((select id from g_loose), 'ice cream', 2),
  '{"type":"ok","data":{"result":"clued","clue_word":"ice cream"}}'::jsonb,
  'without strict_words, a clue with a space goes through'
);

-- ============================================================
-- can_decline_clue_giving: the refusals
-- ============================================================
create temp table g_off on commit drop as
select pg_temp.new_game('{}') as id;

select pg_temp.envelope_is(
  decline_clue_giving((select id from g_off)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN634"}'::jsonb,
  'decline: a game without the option refuses it as a fault'
);

create temp table g_dec on commit drop as
select pg_temp.new_game('{"can_decline_clue_giving": true}') as id;

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  decline_clue_giving((select id from g_dec)),
  '{"type":"not-ok","severity":"race","dbcode":"PN635"}'::jsonb,
  'decline: the guesser cannot decline; the race is submit_clue''s'
);

-- ============================================================
-- can_decline_clue_giving: ada declines on turn 1
-- ============================================================
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select pg_temp.envelope_is(
  decline_clue_giving((select id from g_dec)),
  '{"type":"ok","data":{"result":"declined","clue_giver":"B"}}'::jsonb,
  'decline: answers that the partner clues now'
);

select is(
  (select array[turn_number::text, current_clue_giver]
     from games where game_id = (select id from g_dec)),
  array['1', 'B'],
  'decline: no turn is spent, and the clue seat moves to the partner'
);

select is(
  (select current_turn_user_id from common.games where id = (select id from g_dec)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'decline: the turn pointer names the partner, who owes the clue'
);

select is(
  (select array[kind, seat, took_turn::text, turn_number::text]
     from events where game_id = (select id from g_dec) order by id desc limit 1),
  array['decline', 'A', 'false', '1'],
  'decline: logged under the decliner''s seat, taking no turn'
);

select is(
  (select jsonb_agg(p -> 'declinedClueGiving' order by p ->> 'seat')
     from common.games, jsonb_array_elements(game_data -> 'players') p
    where id = (select id from g_dec)),
  '[true, false]'::jsonb,
  'decline: the page marks the player who declined'
);

select pg_temp.envelope_is(
  decline_clue_giving((select id from g_dec)),
  '{"type":"not-ok","severity":"race","dbcode":"PN635"}'::jsonb,
  'decline: once declined, the seat is no longer the giver'
);

-- Bea clues, ada passes: the clue would alternate back to ada, who declined,
-- so bea keeps it.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select submit_clue((select id from g_dec), 'two', 1);

select pg_temp.envelope_is(
  decline_clue_giving((select id from g_dec)),
  '{"type":"not-ok","severity":"race","dbcode":"PN636"}'::jsonb,
  'decline: once the turn''s clue is in, there is none to decline'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pass_turn((select id from g_dec));

select is(
  (select array[turn_number::text, current_clue_giver]
     from games where game_id = (select id from g_dec)),
  array['2', 'B'],
  'decline: at the turn''s end the clue stays with the partner'
);

-- ============================================================
-- Nobody left to clue: the partner declines too
-- ============================================================
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

select pg_temp.envelope_is(
  decline_clue_giving((select id from g_dec)),
  '{"type":"ok","data":{"result":"declined","clue_giver":null}}'::jsonb,
  'both declined: nobody clues'
);

select is(
  (select array[turn_number::text, sudden_death_turn::text,
                coalesce(current_clue_giver, 'nobody')]
     from games where game_id = (select id from g_dec)),
  array['2', '2', 'nobody'],
  'both declined: sudden death begins on this turn, with the budget unspent'
);

select is(
  (select jsonb_build_object(
            'suddenDeath', game_data -> 'team' -> 'suddenDeath',
            'nTurnsUsed', game_data -> 'team' -> 'nTurnsUsed')
     from common.games where id = (select id from g_dec)),
  '{"suddenDeath": true, "nTurnsUsed": 1}'::jsonb,
  'both declined: the page says sudden death, and only the one turn spent'
);

select is(
  (select jsonb_agg(e -> 'suddenDeath' order by (e ->> 'id')::bigint)
     from common.games, jsonb_array_elements(game_data -> 'events') e
    where id = (select id from g_dec)),
  '[false, false, false, true]'::jsonb,
  'both declined: only the events of the sudden-death turn are marked'
);

select pg_temp.envelope_is(
  submit_clue((select id from g_dec), 'three', 1),
  '{"type":"not-ok","severity":"race","dbcode":"PN502"}'::jsonb,
  'both declined: a clue is refused as sudden death''s'
);

-- A sudden-death agent moves the turn on and still counts no turn against the
-- budget.
select submit_guess((select id from g_dec),
  pg_temp.find_position((select id from g_dec), 'A', 'G'));

select is(
  (select game_data -> 'team' -> 'nTurnsUsed' from common.games where id = (select id from g_dec)),
  '1'::jsonb,
  'sudden death begun early: its turns are not the budget''s'
);

-- ============================================================
-- Restart takes the declines back
-- ============================================================
select replay_board((select id from g_dec));

select is(
  (select array[turn_number::text, current_clue_giver, coalesce(sudden_death_turn::text, 'none')]
     from games where game_id = (select id from g_dec)),
  array['1', 'A', 'none'],
  'restart: out of sudden death, seat A clueing turn 1'
);

select is(
  (select jsonb_agg(p -> 'declinedClueGiving')
     from common.games, jsonb_array_elements(game_data -> 'players') p
    where id = (select id from g_dec)),
  '[false, false]'::jsonb,
  'restart: nobody has declined'
);

-- ============================================================
-- Nobody left to clue: the partner has no agents left
-- ============================================================
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_done on commit drop as
select pg_temp.new_game('{"can_decline_clue_giving": true}') as id;

reset role;
update codenamesduet.words
   set revealed_as = 'G'
 where game_id = (select id from g_done)
   and position = any(pg_temp.find_position_set((select id from g_done), 'B', 'G'));

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  decline_clue_giving((select id from g_done)),
  '{"type":"ok","data":{"result":"declined","clue_giver":null}}'::jsonb,
  'a decline when the partner has no agents left leaves nobody to clue'
);

select is(
  (select sudden_death_turn from games where game_id = (select id from g_done)),
  1,
  'and sudden death begins on this turn'
);

-- ============================================================
-- Nobody left to clue: the one giver left finishes their agents
-- ============================================================
create temp table g_last on commit drop as
select pg_temp.new_game('{"can_decline_clue_giving": true}') as id;

select decline_clue_giving((select id from g_last));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select submit_clue((select id from g_last), 'four', 1);

-- Bea's agents all found while she holds the clue; ada passes the turn.
reset role;
update codenamesduet.words
   set revealed_as = 'G'
 where game_id = (select id from g_last)
   and position = any(pg_temp.find_position_set((select id from g_last), 'B', 'G'));

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  pass_turn((select id from g_last)),
  '{"type":"ok","data":{"result":"passed","clue_giver":null,"turn_number":2}}'::jsonb,
  'the last giver finished: the turn ends with nobody to clue'
);

select is(
  (select sudden_death_turn from games where game_id = (select id from g_last)),
  2,
  'and sudden death begins on the next turn'
);

select is(
  (select current_turn_user_id from common.games where id = (select id from g_last)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'in it, only bea has words left — ada''s guesses read bea''s key, all found'
);

select is(
  (select game_data -> 'team' -> 'nTurnsUsed' from common.games where id = (select id from g_last)),
  '1'::jsonb,
  'the turn spent is counted'
);

-- ============================================================
select * from finish();
rollback;
