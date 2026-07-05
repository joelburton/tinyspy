-- ============================================================
-- Test: wordle.submit_guess (coop) — soft rejects, shared board, win
-- ============================================================
-- Coop: one shared board + budget; either player guesses. Malformed /
-- not-a-word / duplicate guesses are soft-rejected without burning a
-- guess. The target is random, so we read it back as the superuser to
-- craft the winning guess.

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(14);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Wordle coop', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);

-- Read the hidden target + a valid non-target word (as superuser).
reset role;
create temp table tgt on commit drop as
select target::text as w from wordle.games where id = (select id from g);
create temp table valw on commit drop as
select word from common.words
 where len = 5 and difficulty <= 4 and word <> (select w from tgt)
 order by word limit 1;
-- The temp tables are created as postgres; grant so the personas
-- (authenticated) can read them inside their submit_guess calls.
grant select on tgt to authenticated;
grant select on valw to authenticated;

-- ── Soft rejects: no guess consumed, no row written ─────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  wordle.submit_guess((select id from g), 'zzz')->>'result',
  'invalid',
  'too-short entry → invalid');

select is(
  wordle.submit_guess((select id from g), 'zzzzz')->>'result',
  'notAWord',
  'a 5-letter non-word → notAWord');

reset role;
select is(
  (select guesses_used from wordle.players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  0, 'soft rejects did not burn a guess');
select is(
  (select count(*) from wordle.guesses where game_id = (select id from g)),
  0::bigint, 'soft rejects wrote no guess row');

-- ── A valid non-target guess: incorrect, burns one ─────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordle.submit_guess((select id from g), (select word from valw))->>'result',
  'incorrect',
  'a valid non-answer word → incorrect');

reset role;
select is(
  (select guesses_used from wordle.players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  1, 'coop: the guess is shared — bea''s budget moved too (lock-step)');
select is(
  (select length(colors) from wordle.guesses
    where game_id = (select id from g) and seq = 1),
  5, 'the guess row stores 5-char colors');

-- ── Duplicate (same word again): soft reject, no burn ──────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordle.submit_guess((select id from g), (select word from valw))->>'result',
  'duplicate',
  'a word already on the shared board → duplicate');
reset role;
select is(
  (select max(guesses_used) from wordle.players where game_id = (select id from g)),
  1, 'duplicate did not burn a guess');

-- ── bea solves it (coop: either player can guess) ──────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
create temp table winres on commit drop as
select wordle.submit_guess((select id from g), (select w from tgt)) as res;

select is((select (res->>'result') from winres), 'correct',
  'guessing the target → correct');
select is((select (res->>'terminal')::boolean from winres), true,
  'the solving guess is terminal');

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'won',
  'coop solve → play_state won');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g) and (result->>'won')::boolean),
  2::bigint,
  'both players recorded as won');
select is(
  (select target from wordle.games_state where id = (select id from g))::text,
  (select w from tgt),
  'target revealed once the game is terminal');

select * from finish();
rollback;
