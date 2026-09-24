-- cs-blessed-codenamesduet

-- ============================================================
-- Test: get_clue_context (RPC used by suggest-clue Edge Function)
-- ============================================================
--
-- The RPC's job is to enforce "you are the current clue-giver in an
-- active game" so the Edge Function can stay thin. This file checks
-- the three rejection paths plus one happy path that returns a shape
-- with the expected keys and the whole board, the bystanders and the clues
-- given so far, and a deleted game: the gate `get_clue_context`
-- and `log_hint` share answers it with the shared race (PN485).
--
-- See create_game_test.sql for the pgTAP primer.
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- Set up an active game with ada as clue-giver (codenamesduet_setup()
-- defaults to ada as first clue-giver, so she's seated as A).
-- Dee isn't in the club, so she'll exercise the non-player
-- rejection path.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada','bea']) as handle;
create temp table g on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;

-- ============================================================
-- (1) Non-player rejection
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  get_clue_context((select id from g)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'get_clue_context rejects a non-player caller (via require_game_player)'
);

-- ============================================================
-- (2) Bea (the non-clue-giver) cannot ask
-- ============================================================

-- The same race, and the same sentence, as submit_clue's PN371: the AI button
-- and the Submit button share a row and lose the same races.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  get_clue_context((select id from g)),
  '{"type":"not-ok","severity":"race","dbcode":"PN389",
    "message":"Your partner is giving the clue now"}'::jsonb,
  'get_clue_context rejects the non-clue-giver player'
);

-- ============================================================
-- (3) Non-active game is rejected
-- ============================================================
-- To exercise the "no suggestions outside active play" path, force a
-- fresh game's status to a terminal value via direct UPDATE (RLS-free
-- because tests run as postgres by default — reset role first).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table done_game on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;
reset role;
update common.games set play_state = 'won', is_terminal = true, ended_at = now()
  where id = (select id from done_game);
update codenamesduet.games set current_clue_giver = null
  where id = (select id from done_game);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  get_clue_context((select id from done_game)),
  '{"type":"not-ok","severity":"race","dbcode":"PN388",
    "message":"Game over"}'::jsonb,
  'get_clue_context rejects when game is terminal'
);

-- ============================================================
-- (4)–(10) Happy path: ada gets a context with the expected keys,
-- the greens array has exactly 9 entries (one per A-side green),
-- the assassins array has exactly 3 (a Duet key card carries
-- three, and every one of them is returned), and the board is all 25.
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- The five lists live in the envelope's `data`, beside the `result` that
-- names the answer.
create temp table ctx on commit drop as
  select get_clue_context((select id from g)) -> 'data' as data;

select pg_temp.envelope_is(
  get_clue_context((select id from g)),
  '{"type":"ok","data":{"result":"context"}}'::jsonb,
  'answers ok/context'
);

select is(
  (select jsonb_array_length(data->'greens') from ctx),
  9,
  'greens array has 9 entries (the A-side green count at start)'
);

select is(
  (select jsonb_array_length(data->'assassins') from ctx),
  3,
  'assassins array has 3 entries (a Duet key card carries three)'
);

select is(
  (select jsonb_array_length(data->'neutrals') from ctx),
  13,
  'neutrals array has 13 entries (the A-side bystander count at start)'
);

select is(
  (select jsonb_array_length(data->'previous_clues') from ctx),
  0,
  'previous_clues array is empty before any clue submitted'
);

-- The board is every word, turned over or not: the clue may be none of them,
-- and the three lists above drop the ones already turned over.
reset role;
update codenamesduet.words set revealed_as = 'G'
  where game_id = (select id from g) and position = 0;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select get_clue_context((select id from g)) -> 'data' -> 'board'),
  (select jsonb_agg(word order by position) from codenamesduet.words
    where game_id = (select id from g)),
  'board is all 25 words in board order, a turned-over one included'
);

-- Once a clue is in, it is what the model is told not to repeat.
select submit_clue((select id from g), 'WAVE', 2);
select is(
  (select get_clue_context((select id from g)) -> 'data' -> 'previous_clues'),
  '[{"word": "WAVE", "count": 2, "by_seat": "A", "turn_number": 1}]'::jsonb,
  'previous_clues carries a clue given, as word, count, seat and turn'
);

-- ============================================================
-- (11)–(12) A game a friend deleted, through both callers of the gate
-- ============================================================
-- The delete takes the game's rows and every membership together, so the
-- gate answers the shared race rather than a fault or "You are not in this
-- game" (docs/envelopes.md → a missing game row is PN485).

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gone_game on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;
reset role;
delete from common.games where id = (select id from gone_game);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select pg_temp.envelope_is(
  get_clue_context((select id from gone_game)),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'get_clue_context on a deleted game is the shared race (PN485)'
);

select pg_temp.envelope_is(
  log_hint((select id from gone_game)),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'log_hint on a deleted game is the shared race (PN485)'
);

-- ============================================================
select * from finish();
rollback;
