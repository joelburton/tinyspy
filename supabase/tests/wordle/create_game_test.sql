-- cs-unmet

-- ============================================================
-- Test: wordle.create_game + the hidden-target pattern
-- ============================================================

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(17);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordle cg', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop')->'data'->>'id')::uuid as id;

reset role;
select is((select mode from wordle.games where id = (select id from g)), 'coop',
  'game stored with mode coop');
select is((select max_guesses from wordle.games where id = (select id from g)), 5,
  'max_guesses stored from setup');
select is(
  (select length(trim(target)) from wordle.games where id = (select id from g)),
  5, 'a 5-letter target was picked');
select is(
  (select count(*) from wordle.players where game_id = (select id from g)),
  2::bigint, 'one players row per player');
select is(
  (select max(guesses_used) from wordle.players where game_id = (select id from g)),
  0, 'guesses_used starts at 0');
select is(
  (select play_state from common.games where id = (select id from g)),
  'playing', 'play_state is playing');

-- ── The target is hidden mid-game ───────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select target from wordle.games where id = %L::uuid $$, (select id from g)),
  '42501', null,
  'direct SELECT of wordle.games.target is denied (column-level grant)');
select ok(
  (select target from wordle.games_state where id = (select id from g)) is null,
  'games_state.target is NULL while the game is in progress');

-- ── Setup validation ────────────────────────────────────────
select pg_temp.envelope_is(
  wordle.create_game(
    (select handle from club), pg_temp.wordle_setup(4),
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN053"}'::jsonb,
  'max_guesses below 5 names the max_guesses field');
select pg_temp.envelope_is(
  wordle.create_game(
    (select handle from club), pg_temp.wordle_setup(9),
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN053"}'::jsonb,
  'max_guesses above 8 names it too');
-- A mode nobody can pick is a FAULT, not a validation: no control offers one.
select pg_temp.envelope_is(
  wordle.create_game(
    (select handle from club), pg_temp.wordle_setup(6),
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'solo'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN040"}'::jsonb,
  'an invalid mode is a fault');

-- ── Word bands: answer_source + legal_guess ─────────────────
-- g used the default setup → answer_source 0 → target from the Wordle list.
reset role;
select set_config('request.jwt.claims', '', true);
select ok(
  exists (
    select 1 from common.words
     where word = trim((select target from wordle.games where id = (select id from g)))
       and wordle),
  'answer_source 0 (default) draws the target from the curated Wordle list');

-- A difficulty-band answer source: target is band-1-or-easier; legal_guess stored.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g1 on commit drop as
select (wordle.create_game(
  (select handle from club),
  '{"max_guesses": 6, "answer_source": 1, "legal_guess": 6, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select legal_guess from wordle.games where id = (select id from g1)),
  6, 'legal_guess is stored on the games row');
select ok(
  (select difficulty from common.words
     where word = trim((select target from wordle.games where id = (select id from g1)))) <= 1,
  'answer_source 1 draws a band-1-or-easier target');

-- Band validation (as a member).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordle.create_game(
    (select handle from club), '{"max_guesses":6,"answer_source":7,"legal_guess":6,"timer":{"kind":"none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN054"}'::jsonb,
  'answer_source above 6 names the answer_source field');
select pg_temp.envelope_is(
  wordle.create_game(
    (select handle from club), '{"max_guesses":6,"answer_source":1,"legal_guess":7,"timer":{"kind":"none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN055"}'::jsonb,
  'legal_guess above 6 names the legal_guess field');
-- The CROSS-FIELD rule. Two fields are involved and it names the one the form
-- can move: the legal band rises to meet the answer band, never the reverse.
select pg_temp.envelope_is(
  wordle.create_game(
    (select handle from club), '{"max_guesses":6,"answer_source":5,"legal_guess":4,"timer":{"kind":"none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop'),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN056"}'::jsonb,
  'a legal_guess below the answer band names the legal band');

select * from finish();
rollback;
