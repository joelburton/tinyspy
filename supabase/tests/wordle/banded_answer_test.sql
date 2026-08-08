-- ============================================================
-- Test: the answer is ALWAYS guessable — even banded out from under
-- a live game
-- ============================================================
--
-- submit_guess reads the legal-word band LIVE from common.words, but the
-- target was banded at game creation — so a dictionary edit (or an
-- upstream re-band + reimport) can move the answer above the game's
-- legal_guess mid-game. Before 2026-08-08 the dictionary gate ran before
-- the target comparison, which made such a game UNWINNABLE: typing the
-- actual answer returned notAWord. The rule this pins (stackdown's rule,
-- adopted here): the solution is checked before the dictionary, so a
-- solved game never hears "not a word", whatever the dictionary says
-- today.

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(2);

-- A strict solo game: legal_guess 2.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g on commit drop as
select * from wordle.create_game(
  '=ada',
  '{"max_guesses": 6, "answer_source": 0, "legal_guess": 2, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop');

-- The word edit: shove the answer far above the game's band, as the
-- superuser — exactly what common.update_word does live, minus the gate.
reset role;
create temp table t on commit drop as
select target from wordle.games where id = (select id from g);
update common.words set difficulty = 6
 where word = (select lower(target) from t);
-- The temp table was made as postgres; ada reads it below.
grant select on t to authenticated;

-- A non-answer word above the band is still rejected (the gate works)…
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordle.submit_guess((select id from g), 'moxie')->>'result',
  'notAWord',
  'the dictionary gate still rejects a non-answer above the band'
);

-- …but the ANSWER solves, banded out or not.
select is(
  wordle.submit_guess((select id from g), (select target from t))->>'result',
  'correct',
  'the banded-out answer still solves — never notAWord'
);

select * from finish();
rollback;
