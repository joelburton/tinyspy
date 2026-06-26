-- ============================================================
-- Test: wordle.submit_guess legality respects setup.legal_guess
-- ============================================================
-- A guess is "not a word" unless it's a real 5-letter word of difficulty ≤ the
-- game's legal_guess band. So the SAME word can be illegal in a strict game and
-- legal in a permissive one. We use "moxie" (a real band-3 word, not on the
-- Wordle answer list — so never the target when answer_source is 0).
-- ============================================================

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(2);

-- legal_guess 2: a band-3 word is too obscure → notAWord (it would have been
-- legal under the old hardcoded ≤4). Solo game in ada's solo club.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from wordle.create_game(
  '=ada',
  '{"max_guesses": 6, "answer_source": 0, "legal_guess": 2, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop');
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordle.submit_guess((select id from g2), 'moxie')->>'result',
  'notAWord',
  'legal_guess 2: a band-3 word is not a legal guess');

-- legal_guess 6: the same band-3 word is now a legal (but incorrect) guess.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g6 on commit drop as
select * from wordle.create_game(
  '=ada',
  '{"max_guesses": 6, "answer_source": 0, "legal_guess": 6, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop');
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordle.submit_guess((select id from g6), 'moxie')->>'result',
  'incorrect',
  'legal_guess 6: the same band-3 word is a legal (incorrect) guess');

select * from finish();
rollback;
