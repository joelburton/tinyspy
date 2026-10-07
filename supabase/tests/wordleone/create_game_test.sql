-- cs-unmet

-- ============================================================
-- Test: wordleone.create_game — the setup, the puzzle's checks, the hidden target
-- ============================================================
-- create_game checks a handed puzzle for what makes it a puzzle at all, and
-- refuses one that isn't as a fault: the generator only hands over puzzles
-- that pass. How hard it is, it does not check.

begin;
set search_path = wordleone, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(21);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordleone cg', array['ada', 'bea']) as handle;
create temp table created on commit drop as
select wordleone.create_game(
  (select handle from club), pg_temp.wordleone_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop', pg_temp.wordleone_puzzle()) as env;
create temp table g on commit drop as
select (env->'data'->>'id')::uuid as id from created;

reset role;
select pg_temp.envelope_is(
  (select env from created),
  '{"type":"ok","data":{"result":"created"}}'::jsonb,
  'the answer names itself, so a call site has a case to assert');
select is(
  (select array[starter::text, starter_colors::text, target::text, legal_band::text, difficulty]
     from wordleone.games where game_id = (select id from g)),
  array['sieve', 'yxyyg', 'verse', '2', 'medium'],
  'the puzzle and the setup are stored on the games row');
select is(
  (select count(*) from wordleone.players
    where game_id = (select id from g) and n_misses = 0),
  2::bigint, 'one players row per player, no misses');
select is(
  (select gametype || '/' || title from common.games where id = (select id from g)),
  'wordleone_coop/New game', 'the gametype carries the mode; the title starts as a placeholder');

-- ── The target is hidden mid-game ───────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select target from wordleone.games where game_id = %L::uuid $$, (select id from g)),
  '42501', null,
  'direct SELECT of wordleone.games.target is denied (column-level grant)');
select is(
  (select starter::text from wordleone.games where game_id = (select id from g)),
  'sieve', '… while the starter, which every player sees, is readable');
select is(
  (select game_data->'puzzle'->'target' from common.games where id = (select id from g)),
  'null'::jsonb,
  'game_data''s target is null while the game is in progress');

-- ── The setup ───────────────────────────────────────────────
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup(7),
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop', pg_temp.wordleone_puzzle()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN519"}'::jsonb,
  'legal_band above 6 is a fault');
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup() - 'legal_band',
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop', pg_temp.wordleone_puzzle()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN519"}'::jsonb,
  'a missing legal_band is the same fault: there is no default');
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup() || '{"difficulty": "brutal"}',
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop', pg_temp.wordleone_puzzle()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN520"}'::jsonb,
  'a difficulty outside the four is a fault');
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup() - 'difficulty',
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop', pg_temp.wordleone_puzzle()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN520"}'::jsonb,
  'a missing difficulty is the same fault');
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'solo', pg_temp.wordleone_puzzle()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN040"}'::jsonb,
  'an invalid mode is a fault');
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete', pg_temp.wordleone_puzzle()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN518"}'::jsonb,
  'a solo race is refused');
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete', pg_temp.wordleone_puzzle()),
  '{"type":"ok","data":{"result":"created"}}'::jsonb,
  'two racers is the case the guard must not eat');

-- ── The puzzle's checks ─────────────────────────────────────
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop',
    '{"starter": "sieve", "colors": "yxyyg"}'::jsonb),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN521"}'::jsonb,
  'a puzzle with no answer is a fault');
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop',
    '{"starter": "sieve", "colors": "yxyyq", "answer": "verse"}'::jsonb),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN521"}'::jsonb,
  'a color that is not g, y or x is a fault');
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop',
    '{"starter": "verse", "colors": "ggggg", "answer": "verse"}'::jsonb),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN522"}'::jsonb,
  'a starter that is the answer is a fault');
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop',
    '{"starter": "sieve", "colors": "yxyyx", "answer": "verse"}'::jsonb),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN523"}'::jsonb,
  'colors that are not the starter scored against the answer are a fault');
-- MOXIE is band 3, so against a band-2 game it is no legal guess; the colors
-- are its own, so the colors check passes and this one is reached.
reset role;
create temp table moxie on commit drop as
select common._wordle_colors('sieve', 'moxie') as colors;
grant select on moxie to authenticated;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup(2),
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop',
    jsonb_build_object('starter', 'sieve', 'colors', (select colors from moxie), 'answer', 'moxie')),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN524"}'::jsonb,
  'an answer above the legal band is a fault');
-- CRANE against VERSE: many words make those colors.
reset role;
create temp table crane on commit drop as
select common._wordle_colors('crane', 'verse') as colors;
grant select on crane to authenticated;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup(6),
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop',
    jsonb_build_object('starter', 'crane', 'colors', (select colors from crane), 'answer', 'verse')),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN525"}'::jsonb,
  'a puzzle another legal word also fits is a fault');

-- ── The caller must be among the players ────────────────────
select pg_temp.envelope_is(
  wordleone.create_game(
    (select handle from club), pg_temp.wordleone_setup(),
    array['bea22222-2222-2222-2222-222222222222'::uuid], 'coop', pg_temp.wordleone_puzzle()),
  '{"type":"not-ok","severity":"fault","dbcode":"PN510"}'::jsonb,
  'nobody starts a game they are not in');

select * from finish();
rollback;
