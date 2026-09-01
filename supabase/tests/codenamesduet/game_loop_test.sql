-- cs-unmet

-- ============================================================
-- Test: the turn loop (submit_clue, submit_guess, pass_turn)
-- ============================================================
--
-- Covers the heart of the game: who can act in which phase, what
-- a green / neutral / assassin reveal does, and how the turn +
-- clue-giver bookkeeping advances at turn end.
--
-- Plays two short games:
--   1. A full active-play loop with clue, green guess, neutral
--      guess (turn ends), pass (zero-guess turn ends).
--   2. A fresh game where the first guess hits an assassin —
--      the game ends immediately in `lost_assassin` play_state.
--
-- See `create_game_test.sql` for the pgTAP primer.
-- ============================================================

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(18);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- Game 1: full active-play loop
-- ============================================================
-- Ada creates the 2-member club; codenamesduet.create_game seats both
-- members per the setup (ada as first clue-giver → seat A) and
-- brings the game straight to play_state='playing'.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada','bea']) as handle;
create temp table g1 on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;

-- ----- Phase-enforcement rejections -----
-- Bea is not the clue-giver (Ada is), so submit_clue must reject. All three of
-- these are RACES rather than faults: each turns on state the FE learns by
-- subscription, so a stale panel can genuinely send one.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  submit_clue((select id from g1), 'TOOLS', 2),
  '{"type":"not-ok","severity":"race","dbcode":"PN371",
    "message":"Your partner is giving the clue now"}'::jsonb,
  'submit_clue rejects when caller is not the current clue-giver'
);

-- Bea also can't guess yet — there's no clue for the current turn.
select pg_temp.envelope_is(
  submit_guess((select id from g1), 0),
  '{"type":"not-ok","severity":"race","dbcode":"PN381",
    "message":"No clue yet this turn"}'::jsonb,
  'submit_guess rejects in the clue phase (no clue submitted yet)'
);

-- Ada (the clue-giver) can't guess either, even after a clue exists —
-- but right now there's no clue either, so the error she'd hit is
-- "you are the clue-giver this turn" (checked first in the RPC).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  submit_guess((select id from g1), 0),
  '{"type":"not-ok","severity":"race","dbcode":"PN380",
    "message":"Your partner is guessing this turn"}'::jsonb,
  'submit_guess rejects the clue-giver'
);

-- ----- Happy path: clue + green guess + neutral guess -----
-- Ada submits a clue. The answer echoes the stored row, seat included.

select pg_temp.envelope_is(
  submit_clue((select id from g1), 'TOOLS', 2),
  '{"type":"ok","data":{"result":"clued","word":"TOOLS","count":2,
    "turn_number":1,"by_seat":"A"}}'::jsonb,
  'submit_clue succeeds for the current clue-giver in the clue phase'
);

-- Ada can't double up — the unique (game_id, turn_number) constraint
-- on `clues` is enforced by the RPC ahead of the actual insert.
select pg_temp.envelope_is(
  submit_clue((select id from g1), 'OTHER', 1),
  '{"type":"not-ok","severity":"race","dbcode":"PN372",
    "message":"A clue is already in for this turn"}'::jsonb,
  'submit_clue rejects a second clue in the same turn'
);

-- Bea guesses a green. The label is determined by *Ada's* view (the
-- clue-giver's view), which is the most subtle rule in Duet. We use
-- find_position to pin down a cell that's 'G' on Ada's side.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  submit_guess(
    (select id from g1),
    pg_temp.find_position((select id from g1), 'A', 'G')
  ),
  '{"type":"ok","outcome":"won","data":{"result":"agent","revealed":"G",
    "greens_found":1,"turn_number":1,"turns_remaining":9,
    "clue_giver":"A","play_state":"playing"}}'::jsonb,
  'a green guess answers ok/agent, turn state unchanged'
);

-- Green keeps the turn alive: no turn spent, clue-giver unchanged.
select is(
  (select turns_remaining from games where id = (select id from g1)),
  9,
  'green guess does not spend a turn'
);
select is(
  (select current_clue_giver from games where id = (select id from g1)),
  'A',
  'green guess does not swap the clue-giver'
);
select is(
  (select turn_number from games where id = (select id from g1)),
  1,
  'green guess does not advance the turn number'
);

-- Bea guesses a neutral (on Ada's view). This ends the turn, and the answer
-- carries the turn state _end_turn just wrote — which is how the FE learns a
-- pass or a bystander dropped the game into sudden death.
select pg_temp.envelope_is(
  submit_guess(
    (select id from g1),
    pg_temp.find_position((select id from g1), 'A', 'N')
  ),
  '{"type":"ok","outcome":"lost","data":{"result":"bystander","revealed":"N",
    "greens_found":1,"turn_number":2,"turns_remaining":8,
    "clue_giver":"B","play_state":"playing"}}'::jsonb,
  'a neutral guess answers ok/bystander with the new turn state'
);

select is(
  (select turns_remaining from games where id = (select id from g1)),
  8,
  'neutral guess spends one turn (9 → 8)'
);
select is(
  (select current_clue_giver from games where id = (select id from g1)),
  'B',
  'neutral guess swaps the clue-giver (A → B)'
);
select is(
  (select turn_number from games where id = (select id from g1)),
  2,
  'neutral guess advances the turn number (1 → 2)'
);

-- ----- pass_turn -----
-- Bea is now the clue-giver. He submits a clue, Ada passes immediately
-- (a zero-guess turn — rulebook-legal). Turn ends just like a neutral.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select submit_clue((select id from g1), 'WHATEVER', 1);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  pass_turn((select id from g1)),
  '{"type":"ok","data":{"result":"passed","turn_number":3,
    "turns_remaining":7,"clue_giver":"A","play_state":"playing"}}'::jsonb,
  'pass_turn succeeds for the guesser in the guess phase'
);

select is(
  (select turns_remaining from games where id = (select id from g1)),
  7,
  'pass spends one turn (8 → 7)'
);
select is(
  (select current_clue_giver from games where id = (select id from g1)),
  'A',
  'pass swaps the clue-giver back (B → A)'
);

-- ============================================================
-- Game 2: assassin reveal
-- ============================================================
-- Bea guesses Ada's assassin cell — game ends immediately, regardless
-- of turn count. play_state flips to lost_assassin and current_clue_giver
-- is cleared.

-- Game 2 reuses the same club. common.create_game flips the prior
-- current-view row to is_current_view=false before inserting the new one with
-- is_current_view=true, so g1 implicitly stops being the current view — fine
-- for this test, which doesn't poke at the is_current_view state directly.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (codenamesduet.create_game((select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players())->'data'->>'id')::uuid as id;
select submit_clue((select id from g2), 'DOOM', 1);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  submit_guess(
    (select id from g2),
    pg_temp.find_position((select id from g2), 'A', 'A')
  ),
  '{"type":"ok","outcome":"lost","data":{"result":"lost_assassin",
    "revealed":"A","greens_found":0,"turns_used":0}}'::jsonb,
  'an assassin guess answers ok/lost_assassin'
);

select is(
  (select play_state from common.games where id = (select id from g2)),
  'lost_assassin',
  'assassin reveal sets play_state = lost_assassin'
);

-- ============================================================
select * from finish();
rollback;
