-- cs-unmet

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
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(18);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordle coop', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;

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

-- Not a soft reject any more: `doSubmit` refuses a short word before it calls,
-- so one arriving is a broken client.
select pg_temp.envelope_is(
  wordle.submit_guess((select id from g), 'zzz'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN256",
    "message":"A guess must be five letters"}'::jsonb,
  'too-short entry is a fault');

select is(
  wordle.submit_guess((select id from g), 'zzzzz')->'data'->>'result',
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
  wordle.submit_guess((select id from g), (select word from valw))->'data'->>'result',
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
-- The club-list title becomes a readout of the shared board: the most recent
-- guess. (Coop only — compete's guesses are private; see compete_test.)
select is(
  (select title from common.games where id = (select id from g)),
  (select upper(word) from valw),
  'coop: the title reads the most recent guess');

-- ── Duplicate (same word again): soft reject, no burn ──────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordle.submit_guess((select id from g), (select word from valw))->'data'->>'result',
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

select is((select (res->'data'->>'result') from winres), 'correct',
  'guessing the target → correct');
select is((select (res->'data'->>'terminal')::boolean from winres), true,
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
-- Terminal → the title stops being the latest guess and becomes the answer
-- (which the solving guess happens to equal, so assert against the target).
select is(
  (select title from common.games where id = (select id from g)),
  (select upper(w) from tgt),
  'terminal: the title becomes the answer');

-- ============================================================
-- No such game — the guard that needs constructing
-- ============================================================
-- `require_game_player` runs BEFORE the games lookup, and it reads
-- common.game_players — so passing a random uuid raises "not in this game",
-- never this. The only state that reaches PN254 is a caller who IS a player of
-- a common.games row whose wordle.games row is missing, which `create_game`
-- writes together and nothing deletes. Constructed here on purpose: the guard
-- is defensive, and a defensive guard nothing exercises is a guard nobody knows
-- is wrong.
delete from wordle.games where id = (select id from g);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordle.submit_guess((select id from g), (select word from valw)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN254",
    "message":"That game no longer exists"}'::jsonb,
  'a common.games row with no wordle.games row is a fault'
);

-- And the ordering that makes the above the only route: a stranger asking about
-- a game that does not exist is told the thing that is true of THEM.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  wordle.submit_guess('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'zzzzz'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player on a nonexistent game is told they are not in it'
);

select * from finish();
rollback;
