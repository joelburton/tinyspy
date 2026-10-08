-- cs-unmet

-- ============================================================
-- Test: wordleone.rate_puzzle — the puzzle-feedback survey
-- ============================================================
-- A player of an ended game saves a rating; every column but the three the
-- player gives is copied from the game. Covers: refused before the end and to
-- a non-player; the puzzle, the answer's band, the generator's view and the
-- caller's own play copied; a blank rating is still a row; a second save is a second row; the
-- range checks; the table unreadable to clients; a deleted game.

begin;
set search_path = wordleone, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(17);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordleone ratings', array['ada', 'bea']) as handle;
-- The fixture puzzle, with the generator's scores this time.
create temp table g on commit drop as
select (wordleone.create_game(
  (select handle from club), pg_temp.wordleone_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop', pg_temp.wordleone_puzzle() || '{"positive_space": 2, "load_bearing": 3}')->'data'->>'id')::uuid as id;

-- ── Not before the end ──────────────────────────────────────
select pg_temp.envelope_is(
  wordleone.rate_puzzle((select id from g), 3, null, null),
  '{"type":"not-ok","severity":"fault","dbcode":"PN533"}'::jsonb,
  'a rating before the game has ended is a fault');

-- ada misses once, tries a non-word, then solves.
select wordleone.submit_guess((select id from g), 'crane');
select wordleone.submit_guess((select id from g), 'zzzzz');
select wordleone.submit_guess((select id from g), 'verse');

select pg_temp.envelope_is(
  wordleone.rate_puzzle((select id from g), 4, 90, '  a hard one  ', 5),
  '{"type":"ok","data":{"result":"rated"}}'::jsonb,
  'a player of an ended game rates it');

reset role;
select is(
  (select array[user_id::text, game_id::text, starter::text, starter_colors::text, answer::text,
                legal_band::text, difficulty_asked, tier, greens::text, positive_space::text, load_bearing::text]
     from wordleone.ratings where user_id = 'ada11111-1111-1111-1111-111111111111'),
  array['ada11111-1111-1111-1111-111111111111', (select id from g)::text, 'sieve', 'yxyyg', 'verse',
        '4', 'medium', 'medium', '1', '2', '3'],
  'the puzzle, the tier built and the generator''s view are copied from the game');
select is(
  (select array[rated_difficulty::text, suggested_band::text, seconds_reported::text, comment]
     from wordleone.ratings where user_id = 'ada11111-1111-1111-1111-111111111111'),
  array['4', '5', '90', 'a hard one'],
  'what the player said, the comment trimmed');
select is(
  (select answer_band from wordleone.ratings where user_id = 'ada11111-1111-1111-1111-111111111111'),
  (select band::int from common.words where word = 'verse'),
  'the answer''s band in the word list is copied beside the suggestion');
select is(
  (select array[(solved_at is not null)::text, seconds_measured::text, n_misses::text, n_submits::text]
     from wordleone.ratings where user_id = 'ada11111-1111-1111-1111-111111111111'),
  array['true', '0', '1', '3'],
  'the caller''s play: solved, timed from the start to the end, one miss, three guesses logged (the non-word included)');

-- ── A blank rating is still a row ───────────────────────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordleone.rate_puzzle((select id from g), null, null, '   ');
reset role;
select is(
  (select array[coalesce(rated_difficulty::text, '-'), coalesce(seconds_reported::text, '-'),
                coalesce(comment, '-'), (solved_at is not null)::text, n_misses::text, n_submits::text]
     from wordleone.ratings where user_id = 'bea22222-2222-2222-2222-222222222222'),
  array['-', '-', '-', 'true', '0', '0'],
  'a blank rating saves the play alone; coop''s solve is every teammate''s');

-- ── A second save is a second row ───────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordleone.rate_puzzle((select id from g), 2, null, null);
reset role;
select is(
  (select count(*)::int from wordleone.ratings where user_id = 'ada11111-1111-1111-1111-111111111111'),
  2, 'a second save adds a second row');

-- ── A stopped game is timed too ─────────────────────────────
-- The seconds run from the start to the END, so a game nobody solved still
-- says how long it went; `solved_at` is what tells the two apart.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table stopped on commit drop as
select (wordleone.create_game(
  (select handle from club), pg_temp.wordleone_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop', pg_temp.wordleone_puzzle())->'data'->>'id')::uuid as id;
select wordleone.stop_game((select id from stopped));
select wordleone.rate_puzzle((select id from stopped), 6, null, null);
reset role;
select is(
  (select array[(solved_at is not null)::text, (seconds_measured is not null)::text]
     from wordleone.ratings where game_id = (select id from stopped)),
  array['false', 'true'],
  'a stopped game''s rating: no solve, but the seconds to the end');

-- ── The checks ──────────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordleone.rate_puzzle((select id from g), 8, null, null),
  '{"type":"not-ok","severity":"fault","dbcode":"PN534"}'::jsonb,
  'a difficulty outside 1..7 is a fault');
select pg_temp.envelope_is(
  wordleone.rate_puzzle((select id from g), p_suggested_band => 7),
  '{"type":"not-ok","severity":"fault","dbcode":"PN537"}'::jsonb,
  'a suggested band outside 1..6 is a fault');
select pg_temp.envelope_is(
  wordleone.rate_puzzle((select id from g), null, -1, null),
  '{"type":"not-ok","severity":"form-validation","field":"seconds_reported","dbcode":"PN535"}'::jsonb,
  'negative seconds is a validation under the field');
select pg_temp.envelope_is(
  wordleone.rate_puzzle((select id from g), null, null, repeat('x', 1001)),
  '{"type":"not-ok","severity":"form-validation","field":"comment","dbcode":"PN536"}'::jsonb,
  'an over-long comment is a validation under the field');
select throws_ok(
  $$ select count(*) from wordleone.ratings $$,
  '42501', null,
  'the table is psql''s alone: a client cannot read it');

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  wordleone.rate_puzzle((select id from g), 3, null, null),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253"}'::jsonb,
  'a non-player cannot rate');

-- ── A deleted game ──────────────────────────────────────────
reset role;
delete from common.games where id = (select id from g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordleone.rate_puzzle((select id from g), 3, null, null),
  '{"type":"not-ok","severity":"race","dbcode":"PN485"}'::jsonb,
  'a rating of a deleted game is the shared race');
reset role;
select is(
  (select count(*)::int from wordleone.ratings where game_id = (select id from g)),
  3, 'the ratings outlive the deleted game');

select * from finish();
rollback;
