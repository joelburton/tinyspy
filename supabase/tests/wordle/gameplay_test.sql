-- cs-blessed-wordle

-- ============================================================
-- Test: wordle.submit_guess (coop) — soft rejects, shared board, win
-- ============================================================
-- Coop: one shared board + budget; either player guesses. A not-a-word or
-- duplicate guess is soft-rejected without burning a guess; a malformed
-- one is a fault, the frontend having refused it first. The target is
-- random, so we read it back as the superuser to craft the winning guess. A
-- guess into a game a friend deleted is the shared race (PN485), and so is one
-- naming a game that never existed: the row is asked before membership.

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(21);

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
    "message":"BUG: guess that was not five letters"}'::jsonb,
  'too-short entry is a fault');

-- Every `ok` here is asserted to carry NO outcome and NO message, which is
-- half of one rule: an ok from this game is the FACT, and what it is worth —
-- the words a soft reject shows included — is decided once, in
-- src/wordle/lib/answer.ts (its test pins the other half).
select pg_temp.envelope_is(
  wordle.submit_guess((select id from g), 'zzzzz'),
  '{"type":"ok","outcome":null,"message":null,
    "data":{"result":"notAWord","solved":false,"terminal":false}}'::jsonb,
  'a 5-letter non-word → notAWord, the case alone');

reset role;
select is(
  (select guesses_used from wordle.players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  0, 'soft rejects did not burn a guess');
select is(
  (select count(*) from wordle.events where game_id = (select id from g)),
  0::bigint, 'soft rejects wrote no guess row');

-- ── A valid non-target guess: incorrect, burns one ─────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table missres on commit drop as
select wordle.submit_guess((select id from g), (select word from valw)) as res;
select is((select res->'data'->>'result' from missres), 'incorrect',
  'a valid non-answer word → incorrect');
select is((select res->>'outcome' from missres), null::text,
  'a non-solving guess carries no outcome');

reset role;
select is(
  (select guesses_used from wordle.players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  1, 'coop: the guess is shared — bea''s budget moved too (lock-step)');
select is(
  (select length(colors) from wordle.events
    where game_id = (select id from g) order by id limit 1),
  5, 'the guess row stores 5-char colors');

-- Every row here is an accepted guess, so `kind` has one value and
-- `took_turn` is true — a soft reject returns without writing, which is the
-- assertion above about no row being written at all.
select is(
  (select array_agg(distinct kind || ':' || took_turn) from wordle.events
    where game_id = (select id from g)),
  array['guess:true'],
  'every row is a guess that spent a go');
-- The club-list title becomes a readout of the shared board: the most recent
-- guess. (Coop only — compete's guesses are private; see compete_test.)
select is(
  (select title from common.games where id = (select id from g)),
  (select upper(word) from valw),
  'coop: the title reads the most recent guess');

-- ── Duplicate (same word again): soft reject, no burn ──────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordle.submit_guess((select id from g), (select word from valw)),
  '{"type":"ok","outcome":null,"message":null,
    "data":{"result":"duplicate","solved":false,"terminal":false}}'::jsonb,
  'a word already on the shared board → duplicate, the case alone');
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
select is((select (res->>'outcome') from winres), null::text,
  'a solving guess carries no outcome');
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
-- The solving guess is the most recent one, so the title now reads the answer
-- — by the ordinary latest-guess branch, not because the game is terminal
-- (reveal_test pins that a terminal alone never spells it).
select is(
  (select title from common.games where id = (select id from g)),
  (select upper(w) from tgt),
  'the title reads the winning guess');

-- ============================================================
-- A guess into a game a friend deleted
-- ============================================================
-- Any club member may delete a game, and the delete takes the game's rows and
-- every membership together — so the row is asked BEFORE membership, and the
-- guess answers the shared race rather than a fault or "You are not in this
-- game" (docs/envelopes.md → a missing game row is PN485).
reset role;
delete from common.games where id = (select id from g);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordle.submit_guess((select id from g), (select word from valw)),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'a guess into a deleted game is the shared race (PN485)'
);

-- The order, from the other side: a stranger naming a game that does not
-- exist hears that it is gone, since the row is asked before membership.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  wordle.submit_guess('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'zzzzz'),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'a game that does not exist is answered as gone, before membership is asked'
);

select * from finish();
rollback;
