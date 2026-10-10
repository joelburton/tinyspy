-- cs-unmet

-- ============================================================
-- Test: wordleone.submit_guess (coop) — the four answers, the shared board
-- ============================================================
-- A guess is one of four: a duplicate (the starter, or a word already
-- guessed) costs nothing and writes nothing; an entry that fits the starter's
-- colors but is outside the legal band costs nothing and is logged, keeping
-- the turn; anything that breaks the colors, a word or not, is a miss, logged
-- with no colors and counted; the answer solves. A malformed entry is a fault,
-- the frontend having refused it first. A guess into a game a friend deleted
-- is the shared race (PN485).
--
-- VERSE is the only word in common.words that fits SIEVE's colors, so the
-- fitting entries here are made up: VESRE is no word, and VESSE is planted at
-- band 5, above this game's legal band 4.

begin;
set search_path = wordleone, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(26);

insert into common.words (word, band, american, british, canadian, australian, len)
values ('vesse', 5, true, true, true, true, 5);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordleone coop', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (wordleone.create_game(
  (select handle from club), pg_temp.wordleone_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop', pg_temp.wordleone_puzzle())->'data'->>'id')::uuid as id;

-- ── A malformed entry: a fault ──────────────────────────────
select pg_temp.envelope_is(
  wordleone.submit_guess((select id from g), 'zzz'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN527",
    "message":"BUG: guess that was not five letters"}'::jsonb,
  'a too-short entry is a fault');

-- ── The soft rejects: nothing counted ───────────────────────
-- Every `ok` carries no outcome and no message: what each answer is worth is
-- decided once, in the frontend's lib/answer.ts.
select pg_temp.envelope_is(
  wordleone.submit_guess((select id from g), 'vesre'),
  '{"type":"ok","outcome":null,"message":null,
    "data":{"result":"notAWord","n_misses":0,"solved":false,"game_ended":false}}'::jsonb,
  'a non-word that fits the colors → notAWord');
select pg_temp.envelope_is(
  wordleone.submit_guess((select id from g), 'vesse'),
  '{"type":"ok","data":{"result":"notAWord"}}'::jsonb,
  'a word that fits the colors, above the legal band → notAWord');
select pg_temp.envelope_is(
  wordleone.submit_guess((select id from g), 'SIEVE'),
  '{"type":"ok","outcome":null,"message":null,
    "data":{"result":"duplicate","n_misses":0,"solved":false,"game_ended":false}}'::jsonb,
  'the starter, in any case, → duplicate: it is already on the board');

reset role;
select is(
  (select array_agg(word || ':' || verdict || ':' || took_turn || ':' || coalesce(colors, '-') order by id)
     from wordleone.events where game_id = (select id from g)),
  array['vesre:not_a_word:false:-', 'vesse:not_a_word:false:-'],
  'the two non-words are logged, uncolored, spending no go; the duplicate writes nothing');
select is(
  (select sum(n_misses)::int from wordleone.players where game_id = (select id from g)),
  0, '… and counted no miss');
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordleone.submit_guess((select id from g), 'vesre')->'data'->>'result',
  'duplicate', 'a non-word already tried is a duplicate the second time');
reset role;

-- ── A miss ──────────────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordleone.submit_guess((select id from g), 'crane'),
  '{"type":"ok","outcome":null,"message":null,
    "data":{"result":"miss","n_misses":1,"solved":false,"game_ended":false}}'::jsonb,
  'a legal word that breaks the colors → miss, the count the team''s');

reset role;
select is(
  (select colors from wordleone.events where game_id = (select id from g) and verdict = 'miss'),
  null, 'a miss is logged with no colors');
select is(
  (select kind || ':' || took_turn || ':' || is_correct from wordleone.events
    where game_id = (select id from g) and verdict = 'miss'),
  'guess:true:false', '… as a guess that spent a go');
select is(
  (select array_agg(n_misses order by user_id) from wordleone.players where game_id = (select id from g)),
  array[1, 0], 'each row counts its own player''s misses');
select is(
  (select title from common.games where id = (select id from g)),
  'CRANE', 'coop: the title reads the most recent guess, a miss included');
select is(
  (select ended_at from common.games where id = (select id from g)),
  null, 'a miss ends nothing');

-- ── A duplicate of a miss, from either player ───────────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  wordleone.submit_guess((select id from g), 'crane'),
  '{"type":"ok","data":{"result":"duplicate","n_misses":1}}'::jsonb,
  'coop: a teammate''s earlier guess is a duplicate');

-- ── The solve ───────────────────────────────────────────────
create temp table winres on commit drop as
select wordleone.submit_guess((select id from g), 'verse') as res;
select pg_temp.envelope_is(
  (select res from winres),
  '{"type":"ok","outcome":null,"message":null,
    "data":{"result":"correct","n_misses":1,"solved":true,"game_ended":true}}'::jsonb,
  'the answer → correct, and the game ends');

reset role;
select is(
  (select colors || ':' || is_correct from wordleone.events
    where game_id = (select id from g) order by id desc limit 1),
  'ggggg:true', 'the solve is logged all green');
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g)),
  'reached_goal/solved/won',
  'coop solve ends the game reached_goal, won');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g) and final_ranking = 1 and outcome = 'won'
      and solved_at is not null),
  2::bigint,
  'every teammate ranked 1, won, and solved');
select is(
  (select game_data->'puzzle'->>'target' from common.games where id = (select id from g)),
  'verse', 'the target arrives once the game has ended');
select is(
  (select title from common.games where id = (select id from g)),
  'VERSE', 'the title reads the winning guess');

-- A guess after the end is the race it is.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordleone.submit_guess((select id from g), 'stare'),
  '{"type":"not-ok","severity":"race","dbcode":"PN486","message":"Game over"}'::jsonb,
  'a guess into an ended game is the game-over race');

-- ── The answer above the band still solves ──────────────────
-- The band is read live, so a re-band mid-game must not make the answer
-- "not a word": the answer is compared before the dictionary.
create temp table g2 on commit drop as
select (wordleone.create_game(
  '=ada', pg_temp.wordleone_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop', pg_temp.wordleone_puzzle())->'data'->>'id')::uuid as id;
reset role;
update common.words set band = 6 where word = 'verse';
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordleone.submit_guess((select id from g2), 'verse')->'data'->>'result',
  'correct', 'a banded-out answer still solves — never notAWord');
reset role;
update common.words set band = 1 where word = 'verse';
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- ── A non-word that breaks the colors is a miss ─────────────
-- It could never be the answer, so it is wrong before it is "not a word":
-- counted, and the go spent. (A word that fits the colors inside the legal
-- band cannot exist: create_game refuses that puzzle, PN525.)
create temp table g3 on commit drop as
select (wordleone.create_game(
  '=ada', pg_temp.wordleone_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop', pg_temp.wordleone_puzzle())->'data'->>'id')::uuid as id;
select pg_temp.envelope_is(
  wordleone.submit_guess((select id from g3), 'zzzzz'),
  '{"type":"ok","data":{"result":"miss","n_misses":1}}'::jsonb,
  'a non-word that breaks the colors → miss, counted');
reset role;
select is(
  (select verdict || ':' || took_turn from wordleone.events
    where game_id = (select id from g3) and word = 'zzzzz'),
  'miss:true', '… logged as a miss that spent a go');
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

-- ── A guess into a game a friend deleted ────────────────────
reset role;
delete from common.games where id = (select id from g3);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordleone.submit_guess((select id from g3), 'crane'),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'a guess into a deleted game is the shared race (PN485)');
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  wordleone.submit_guess('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'zzzzz'),
  '{"type":"not-ok","severity":"race","dbcode":"PN485"}'::jsonb,
  'a game that does not exist is answered as gone, before membership is asked');

select * from finish();
rollback;
