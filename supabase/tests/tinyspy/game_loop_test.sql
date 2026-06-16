-- ============================================================
-- Test: the turn loop (submit_clue, submit_guess, pass_turn)
-- ============================================================
--
-- Covers the heart of the game: who can act in which phase, what
-- a green / neutral / assassin reveal does, and how the token +
-- clue-giver bookkeeping advances at turn end.
--
-- Plays two short games:
--   1. A full active-play loop with clue, green guess, neutral
--      guess (turn ends), pass (zero-guess turn ends).
--   2. A fresh game where the first guess hits an assassin —
--      the game ends immediately in `lost_assassin`.
--
-- See `create_game_test.sql` for the pgTAP primer.
-- ============================================================

begin;

set search_path = tinyspy, common, public, extensions;

select plan(18);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Game 1: full active-play loop
-- ============================================================
-- Ada creates the 2-member club; tinyspy.create_game seats both
-- members per the setup (ada as first clue-giver → seat A) and
-- brings the game straight to 'active'.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('test club', array['ada','bea']);
create temp table g1 on commit drop as
select * from tinyspy.create_game((select id from club), pg_temp.tinyspy_setup(), pg_temp.tinyspy_players());

-- ----- Phase-enforcement rejections -----
-- Bea is not the clue-giver (Ada is), so submit_clue must reject.

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  $$ select submit_clue((select id from g1), 'TOOLS', 2) $$,
  'P0001',
  'not your turn to give a clue',
  'submit_clue rejects when caller is not the current clue-giver'
);

-- Bea also can't guess yet — there's no clue for the current turn.
select throws_ok(
  $$ select submit_guess((select id from g1), 0) $$,
  'P0001',
  'waiting for clue this turn',
  'submit_guess rejects in the clue phase (no clue submitted yet)'
);

-- Ada (the clue-giver) can't guess either, even after a clue exists —
-- but right now there's no clue either, so the error she'd hit is
-- "you are the clue-giver this turn" (checked first in the RPC).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  $$ select submit_guess((select id from g1), 0) $$,
  'P0001',
  'you are the clue-giver this turn',
  'submit_guess rejects the clue-giver'
);

-- ----- Happy path: clue + green guess + neutral guess -----
-- Ada submits a clue.

select lives_ok(
  $$ select submit_clue((select id from g1), 'TOOLS', 2) $$,
  'submit_clue succeeds for the current clue-giver in the clue phase'
);

-- Ada can't double up — the unique (game_id, turn_number) constraint
-- on `clues` is enforced by the RPC ahead of the actual insert.
select throws_ok(
  $$ select submit_clue((select id from g1), 'OTHER', 1) $$,
  'P0001',
  'a clue has already been submitted this turn',
  'submit_clue rejects a second clue in the same turn'
);

-- Bea guesses a green. The label is determined by *Ada's* view (the
-- clue-giver's view), which is the most subtle rule in Duet. We use
-- find_position to pin down a cell that's 'G' on Ada's side.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  submit_guess(
    (select id from g1),
    pg_temp.find_position((select id from g1), 'A', 'G')
  ),
  'G',
  'a green guess returns G'
);

-- Green keeps the turn alive: no token spent, clue-giver unchanged.
select is(
  (select turns_remaining from games where id = (select id from g1)),
  9,
  'green guess does not spend a timer token'
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

-- Bea guesses a neutral (on Ada's view). This ends the turn.
select is(
  submit_guess(
    (select id from g1),
    pg_temp.find_position((select id from g1), 'A', 'N')
  ),
  'N',
  'a neutral guess returns N'
);

select is(
  (select turns_remaining from games where id = (select id from g1)),
  8,
  'neutral guess spends one timer token (9 → 8)'
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
select lives_ok(
  $$ select pass_turn((select id from g1)) $$,
  'pass_turn succeeds for the guesser in the guess phase'
);

select is(
  (select turns_remaining from games where id = (select id from g1)),
  7,
  'pass spends one timer token (8 → 7)'
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
-- of token count. status flips to lost_assassin and current_clue_giver
-- is cleared.

-- Game 2 reuses the same club. common.create_game flips the prior
-- active row to is_active=false before inserting the new one with
-- is_active=true, so g1 implicitly becomes suspended — fine for
-- this test, which doesn't poke at the is_active state directly.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from tinyspy.create_game((select id from club), pg_temp.tinyspy_setup(), pg_temp.tinyspy_players());
select submit_clue((select id from g2), 'DOOM', 1);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  submit_guess(
    (select id from g2),
    pg_temp.find_position((select id from g2), 'A', 'A')
  ),
  'A',
  'an assassin guess returns A'
);

select is(
  (select status from games where id = (select id from g2)),
  'lost_assassin',
  'assassin reveal sets status = lost_assassin'
);

-- ============================================================
select * from finish();
rollback;
