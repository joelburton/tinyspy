-- cs-unmet

-- ============================================================
-- Test: boggle.create_game
-- ============================================================
-- Covers: coop happy path (header + per-game row + page blob), compete happy path,
-- and the validation guards (mode, compete player floor, a compete game with no
-- target and no countdown, band, ladder, dice_set, non-member).
-- See ../codenamesduet/create_game_test.sql for the pgTAP primer.

begin;
set search_path = boggle, common, public, extensions;
select plan(20);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ── Coop happy path ───────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Boggle Club', array['ada', 'bea', 'cade']) as handle;

-- The whole envelope is kept, not just the id: `data.result` is the field both
-- call sites filter the `ok` on, and it reaches them through
-- `boggle-build-board` untouched.
create temp table created on commit drop as
select boggle.create_game(
  (select handle from club),
  pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.boggle_board()
) as env;
create temp table g on commit drop as
select (env->'data'->>'id')::uuid as id from created;

select pg_temp.envelope_is(
  (select env from created),
  '{"type":"ok","data":{"result":"created"}}'::jsonb,
  'the answer names itself, so a call site has a case to assert');
select isnt((select id from g), null, 'create_game (coop) returns an id');
select is(
  (select count(*) from boggle.games where game_id = (select id from g)), 1::bigint,
  'create_game inserts one boggle.games row');
select is(
  (select mode from common.games where id = (select id from g)), 'coop',
  'common.games.mode = coop');
select is(
  (select n_reqd_words from boggle.games where game_id = (select id from g)), 6,
  'n_reqd_words cached = 6');
select is(
  (select board_side_size from boggle.games where game_id = (select id from g)), 4,
  'board side length = 4');
select is(
  (select required_band from boggle.games where game_id = (select id from g)), 3,
  'required_band copied from setup.band');
select is(
  (select gametype from common.games where id = (select id from g)), 'boggle_coop',
  'common.games.gametype = boggle_coop');
select is(
  (select (game_data->'team'->>'nFoundWords')::int from common.games where id = (select id from g)), 0,
  'the page blob is written at create: the team has found nothing');
-- Club-list title = size + the board's top row. The fixture board is
-- 'CATRSEXOTMPLNGDB' at n=4, so the first four faces are C A T R.
select is(
  (select title from common.games where id = (select id from g)), '4×4 CATR',
  'title is "<n>×<n> <top row>"');

-- A multiface die is stored as a digit (1 = Qu) but a player sees two letters
-- on the tile, so the title expands it — see src/boggle/lib/dice.ts.
create temp table qg on commit drop as
select (boggle.create_game(
  (select handle from club),
  pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.boggle_board() || jsonb_build_object('board', '1ATRSEXOTMPLNGDB')
)->'data'->>'id')::uuid as id;
select is(
  (select title from common.games where id = (select id from qg)), '4×4 QuATR',
  'title expands a multiface die to the faces on the tile');

-- ── Compete happy path ────────────────────────────────────
create temp table cg on commit drop as
select (boggle.create_game(
  (select handle from club),
  pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.boggle_board()
)->'data'->>'id')::uuid as id;
select is(
  (select mode from common.games where id = (select id from cg)), 'compete',
  'create_game (compete) sets mode compete');

-- ── Validation guards ─────────────────────────────────────
select pg_temp.envelope_is(
  boggle.create_game((select handle from club), pg_temp.boggle_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'sideways', pg_temp.boggle_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN040",
    "message":"BUG: game mode of ''sideways''"}'::jsonb,
  'rejects an unknown mode');

select pg_temp.envelope_is(
  boggle.create_game((select handle from club), pg_temp.boggle_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete', pg_temp.boggle_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN136",
    "message":"BUG: race with fewer than two players"}'::jsonb,
  'compete with 1 player is rejected');

-- A compete game with no target needs a countdown: nothing else could crown a
-- winner. Refused under the target, the field the form shows it at.
select pg_temp.envelope_is(
  boggle.create_game((select handle from club),
    pg_temp.boggle_setup() || '{"timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,'bea22222-2222-2222-2222-222222222222'::uuid],
    'compete', pg_temp.boggle_board()),
  '{"type":"not-ok","severity":"form-validation","field":"win_percent","dbcode":"PN512",
    "message":"A compete game with no target needs a countdown"}'::jsonb,
  'compete with no target and no timer is refused');

select pg_temp.envelope_is(
  boggle.create_game((select handle from club),
    pg_temp.boggle_setup() || '{"timer": {"kind": "countup"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,'bea22222-2222-2222-2222-222222222222'::uuid],
    'compete', pg_temp.boggle_board()),
  '{"type":"not-ok","severity":"form-validation","field":"win_percent","dbcode":"PN512",
    "message":"A compete game with no target needs a countdown"}'::jsonb,
  'compete with no target and a count-up timer is refused too');

select pg_temp.envelope_is(
  boggle.create_game((select handle from club),
    pg_temp.boggle_setup() || '{"band": 9}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop', pg_temp.boggle_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN138",
    "message":"BUG: required difficulty of ''9''"}'::jsonb,
  'rejects band out of range');

-- legal_band must sit between the required band and 6. Default band is 3, so a
-- legal_band of 2 is below it and must be rejected.
select pg_temp.envelope_is(
  boggle.create_game((select handle from club),
    pg_temp.boggle_setup() || '{"legal_band": 2}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop', pg_temp.boggle_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN139",
    "message":"BUG: legal-word difficulty of ''2''"}'::jsonb,
  'rejects legal_band below the required band');

select pg_temp.envelope_is(
  boggle.create_game((select handle from club),
    pg_temp.boggle_setup() || '{"scoring_ladder": "wacky"}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,'bea22222-2222-2222-2222-222222222222'::uuid],
    'coop', pg_temp.boggle_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN140",
    "message":"BUG: scoring ladder of ''wacky''"}'::jsonb,
  'rejects an unknown scoring_ladder');

-- Non-member (dee) cannot create in this club.
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  boggle.create_game((select handle from club), pg_temp.boggle_setup(),
    array['dee44444-4444-4444-4444-444444444444'::uuid], 'coop', pg_temp.boggle_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN012"}'::jsonb,
  'non-member is rejected');

select * from finish();
rollback;
