-- cs-unmet

-- ============================================================
-- Test: per-seat neutrals (the Duet cross-direction rule)
-- ============================================================
-- A bystander is only neutral on the CLUE-GIVER's key. The same word may be
-- the OTHER player's agent, so a neutral must lock only the guesser's
-- direction — the partner can still contact it. (Codenames Duet: a word one
-- player marks neutral may still be the other player's agent, so it stays open
-- for the partner's direction.)
--
-- Covers:
--   1. A neutral guess sets the GUESSER's per-seat flag, not the global
--      `revealed_as`.
--   2. The partner can still guess the same word — and it can be their agent.
--   3. Once contacted as an agent (global 'G'), it's locked for both.
--   4. Both seats hitting a word as neutral locks it for both.
--   5. Every guess is logged to codenamesduet.guesses (a word can appear twice).
--
-- The two locks answer DIFFERENTLY, which is the point of 3 vs 4: a globally
-- contacted agent is "That word is already revealed" (PN382), while your own
-- bystander is "You already tried that word" (PN383) — the partner is still
-- free to guess that one.
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(12);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada','bea']) as handle;
create temp table g1 on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;

-- P = neutral on A's view, GREEN on B's view (an N/G cell — 5 exist).
-- Q = neutral on BOTH views (an N/N cell — 7 exist).
-- Built as ada (a player can read both key columns) so the temp table is owned
-- by the authenticated role and stays readable inside the as_user guesses below.
create temp table cells on commit drop as
select
  (select gs from generate_series(0, 24) as gs
     where (g.key_card_a->>gs) = 'N' and (g.key_card_b->>gs) = 'G' limit 1) as p_ng,
  (select gs from generate_series(0, 24) as gs
     where (g.key_card_a->>gs) = 'N' and (g.key_card_b->>gs) = 'N' limit 1) as q_nn
from codenamesduet.games g where g.id = (select id from g1);

-- ─── Turn 1: ada clues, bea guesses P → neutral on ada's view ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select submit_clue((select id from g1), 'CLUE1', 1);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  submit_guess((select id from g1), (select p_ng from cells)),
  '{"type":"ok","data":{"result":"bystander","revealed":"N"}}'::jsonb,
  'P is a neutral on the clue-giver (ada) view'
);

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select neutral_b from codenamesduet.words
    where game_id = (select id from g1) and position = (select p_ng from cells)),
  true,
  'the guess set the GUESSER''s per-seat flag (neutral_b)'
);
select is(
  (select neutral_a from codenamesduet.words
    where game_id = (select id from g1) and position = (select p_ng from cells)),
  false,
  'it did NOT set the other seat''s flag (neutral_a)'
);
select is(
  (select revealed_as from codenamesduet.words
    where game_id = (select id from g1) and position = (select p_ng from cells)),
  null,
  'a neutral is NOT a global reveal (revealed_as stays null)'
);
select is(
  (select count(*)::int from codenamesduet.guesses
    where game_id = (select id from g1) and position = (select p_ng from cells)
      and guesser_seat = 'B' and result = 'N'),
  1,
  'the guess was logged to codenamesduet.guesses'
);

-- ─── Turn 2: bea clues, ada guesses P → GREEN on bea's view (the fix!) ───
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select submit_clue((select id from g1), 'CLUE2', 1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  submit_guess((select id from g1), (select p_ng from cells)),
  '{"type":"ok","data":{"result":"agent","revealed":"G"}}'::jsonb,
  'the PARTNER can still guess the word bea neutraled — and it is her agent'
);

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select revealed_as from codenamesduet.words
    where game_id = (select id from g1) and position = (select p_ng from cells)),
  'G',
  'contacting it as an agent flips the GLOBAL revealed_as to G'
);

-- ada (same turn, green continues) guesses Q → neutral on bea's view.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  submit_guess((select id from g1), (select q_nn from cells)),
  '{"type":"ok","data":{"result":"bystander","revealed":"N"}}'::jsonb,
  'Q is a neutral on bea''s view → ada''s turn ends'
);

-- ─── Turn 3: ada clues, bea guesses ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select submit_clue((select id from g1), 'CLUE3', 1);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
-- P is globally found now — locked for everyone.
select pg_temp.envelope_is(
  submit_guess((select id from g1), (select p_ng from cells)),
  '{"type":"not-ok","severity":"race","dbcode":"PN382",
    "message":"That word is already revealed"}'::jsonb,
  'a globally-contacted agent is locked for both players'
);
-- bea guesses Q → neutral on ada's view → now BOTH seats have marked it.
select submit_guess((select id from g1), (select q_nn from cells));

reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select neutral_a and neutral_b from codenamesduet.words
    where game_id = (select id from g1) and position = (select q_nn from cells)),
  true,
  'both seats hitting a word as neutral locks it for both'
);

select is(
  (select count(*)::int from codenamesduet.guesses where game_id = (select id from g1)),
  4,
  'every guess is logged (P×2, Q×2); the rejected re-guess inserted nothing'
);

-- ─── Turn 4: bea clues, ada guesses — her OWN bystander is locked ───
-- The other half of the split. Q is neutral on both views, so it is not
-- globally revealed and PN382 does not apply; what stops ada is her own mark
-- from turn 2, and the sentence says so.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select submit_clue((select id from g1), 'CLUE4', 1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  submit_guess((select id from g1), (select q_nn from cells)),
  '{"type":"not-ok","severity":"race","dbcode":"PN383",
    "message":"You already tried that word"}'::jsonb,
  'your own bystander is locked to you, and says so in its own words'
);

select * from finish();
rollback;
