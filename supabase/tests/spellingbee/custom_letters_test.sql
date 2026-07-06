-- ============================================================
-- Test: spellingbee.create_game — custom (player-specified) letters
-- ============================================================
--
-- The optional custom-board path: setup carries `custom_letters` +
-- `custom_center` (the player's own letters). Coverage:
--   1. A custom board with FEWER than 30 required words is accepted
--      (the ≥30 quality gate relaxes to ≥1 for custom boards).
--   2. The one-off custom letters are STRIPPED from the club's saved
--      default (clubs_gametypes.default_setup) — the next game starts
--      random — while the rest of the setup (timer) is preserved.
--   3. A RANDOM board (no custom_letters) with <30 words is still
--      rejected — the gate only relaxes for custom.
--   4. A custom board with ZERO required words is rejected (the ≥1
--      playability floor).
--
-- See ./create_game_test.sql for the base board/setup fixtures.

begin;

set search_path = spellingbee, common, public, extensions;

select plan(6);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Custom Letters', array['ada','bea']) as handle;

-- A custom setup = default coop setup + the player's letters (abcdfg + e).
create temp table cset on commit drop as
select pg_temp.spellingbee_setup()
       || jsonb_build_object('custom_letters', 'abcdfg', 'custom_center', 'e') as s;

-- A small board (only 3 required words) — below the ≥30 random gate.
create temp table small on commit drop as
select jsonb_build_object(
  'outer_letters',        'abcdfg',
  'center_letter',        'e',
  'required_words_score', 3,
  'required_words_count', 3,
  'required_words', jsonb_build_array(
    jsonb_build_object('word', 'bead', 'points', 1, 'is_pangram', false),
    jsonb_build_object('word', 'beef', 'points', 1, 'is_pangram', false),
    jsonb_build_object('word', 'face', 'points', 1, 'is_pangram', false)),
  'bonus_words', '[]'::jsonb
) as b;

-- ── (1) Custom board with <30 required words is accepted ────
create temp table g on commit drop as
select * from spellingbee.create_game(
  (select handle from club),
  (select s from cset),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  (select b from small)
);
select isnt((select id from g), null,
  'custom board with only 3 required words is accepted (≥30 gate relaxed)');
select is(
  (select required_words_count from spellingbee.games where id = (select id from g)),
  3, 'custom board stores its actual (sub-30) required_words_count');

-- ── (2) Saved default strips the one-off custom letters ─────
select is(
  (select default_setup ? 'custom_letters' or default_setup ? 'custom_center'
     from common.clubs_gametypes
    where club_handle = (select handle from club) and gametype = 'spellingbee_coop'),
  false, 'saved default drops custom_letters + custom_center (next game is random)');
select is(
  (select default_setup -> 'timer' ->> 'kind'
     from common.clubs_gametypes
    where club_handle = (select handle from club) and gametype = 'spellingbee_coop'),
  'none', 'saved default still keeps the rest of the setup (timer)');

-- ── (3) A RANDOM board with <30 words is still rejected ─────
select throws_ok(
  format(
    $$ select spellingbee.create_game(%L,
                                   pg_temp.spellingbee_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid,
                                         'bea22222-2222-2222-2222-222222222222'::uuid],
                                   'coop',
                                   %L::jsonb) $$,
    (select handle from club), (select b from small)
  ),
  'P0001', NULL,
  'a NON-custom board with <30 required words is still rejected (gate holds)');

-- ── (4) A custom board with ZERO required words is rejected ─
select throws_ok(
  format(
    $$ select spellingbee.create_game(%L,
                                   pg_temp.spellingbee_setup()
                                     || '{"custom_letters":"abcdfg","custom_center":"e"}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid,
                                         'bea22222-2222-2222-2222-222222222222'::uuid],
                                   'coop',
                                   jsonb_build_object(
                                     'outer_letters','abcdfg','center_letter','e',
                                     'required_words_score',0,'required_words_count',0,
                                     'required_words','[]'::jsonb,'bonus_words','[]'::jsonb)) $$,
    (select handle from club)
  ),
  'P0001', NULL,
  'a custom board with ZERO required words is rejected (≥1 playability floor)');

select * from finish();
rollback;
