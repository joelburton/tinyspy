-- cs-blessed-wordwheel

-- ============================================================
-- Test: wordwheel.create_game
-- ============================================================
--
-- A fork of spellingbee's create_game_test. Coverage, by section:
--    1. Coop happy path: common.games + wordwheel.games rows
--       materialize; mode='coop'; gametype 'wordwheel_coop'; not yet
--       ended; the outer letters stored verbatim.
--    2. Title formula: "<CENTER>·<OUTER-SORTED>".
--    3. Coop statuses seeded with the coop shape.
--    4. Compete happy path: mode='compete' + target_rank=4; mode column
--       + gametype string match; compete-shape statuses seeded
--       (target_rank, no team score, every player at 0).
--    5. Auth: dee (outsider) rejected.
--    6. mode arg: an invalid value rejected.
--    7. Compete with fewer than 2 players rejected.
--    8. target_rank required iff compete, and above 6 rejected; coop may
--       set one, and it is copied to its column.
--    9. The word bands: required out of range, legal below required or
--       above 6, either one not a number; required = 1 and an explicit
--       4 / 6 accepted.
--   10. Board validation: DUPLICATES ACCEPTED (repeated outers + a center
--       repeating an outer are ordinary boards, the title carrying the
--       repeat); outer_letters of the wrong length refused.
--   11. THE FORK: 's' is ALLOWED in outer_letters (a tile is spent per
--       use, so 's' can't pluralize explosively — spellingbee bans it);
--       and the ≥ 15 required-words gate (NOT 30 — the wordwheel floor).
--   12. Player-count upper bound: 7+ entries rejected.
--   13. Both gametype strings registered in common.gametypes.
--
-- Not pinned here: the outer alphabet, the center's own shape, and a
-- target_rank below 0.
--
-- Fixture board (pg_temp.wordwheel_board): 19 required words scoring 62.

begin;

set search_path = wordwheel, common, public, extensions;

select plan(39);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- Set up: an ada+bea club for the happy-path tests
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada and Bea', array['ada','bea']) as handle;

-- ============================================================
-- (1) Coop happy path: every base assertion fires
-- ============================================================

-- The whole envelope is kept, not just the id: `data.result` is the field both
-- call sites filter the `ok` on, and it reaches them through
-- `wordwheel-build-board` untouched.
create temp table created on commit drop as
select wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordwheel_board()
) as env;
create temp table g on commit drop as
select (env->'data'->>'id')::uuid as id from created;

select pg_temp.envelope_is(
  (select env from created),
  '{"type":"ok","data":{"result":"created"}}'::jsonb,
  'the answer names itself, so a call site has a case to assert');

select isnt(
  (select id from g), null,
  'coop create_game returns a non-null id'
);

select is(
  (select gametype from common.games where id = (select id from g)),
  'wordwheel_coop',
  'common.games.gametype = wordwheel_coop (mode routes the suffix)'
);

select is(
  (select mode from common.games where id = (select id from g)),
  'coop',
  'common.games.mode = coop (the RLS branches read it)'
);

select is(
  (select ended_at from common.games where id = (select id from g)),
  null,
  'the new game has not ended'
);

select is(
  (select outer_letters from wordwheel.games where game_id = (select id from g)),
  'abcdfghi'::char(8),
  'wordwheel.games.outer_letters carries the board''s 8 outer letters verbatim'
);

-- ============================================================
-- (2) Title formula: "<CENTER>·<OUTER-SORTED>" (uppercased)
-- ============================================================

select is(
  (select title from common.games where id = (select id from g)),
  'E·ABCDFGHI',
  'title formula: <CENTER>·<OUTER-SORTED>, uppercased, dot-separated'
);

-- ============================================================
-- (3) Coop statuses seeding
-- ============================================================

select is(
  (select jsonb_typeof(summary_data->'team'->'foundWordsScore') from common.games where id = (select id from g)),
  'number',
  'coop summary_data carries the team''s score (the coop shape)'
);

select is(
  (select (static_game_data->'puzzle'->>'reqdWordsScore')::int from common.games where id = (select id from g)),
  62,
  'coop static_game_data.puzzle.reqdWordsScore = board.reqd_words_score'
);

select is(
  (select (static_game_data->'puzzle'->>'nReqdWords')::int from common.games where id = (select id from g)),
  19,
  'coop static_game_data.puzzle.nReqdWords = board.n_reqd_words'
);

select is(
  (select (summary_data->'team'->>'foundWordsScore')::int from common.games where id = (select id from g)),
  0,
  'coop summary_data team score = 0 at create time'
);

-- ============================================================
-- (4) Compete happy path
-- ============================================================

create temp table compete_club on commit drop as
select pg_temp.create_club('Compete club', array['ada','bea','cade']) as handle;

create temp table g_compete on commit drop as
select (wordwheel.create_game(
  (select handle from compete_club),
  pg_temp.wordwheel_setup() || '{"target_rank": 4}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.wordwheel_board()
)->'data'->>'id')::uuid as id;

select is(
  (select gametype from common.games where id = (select id from g_compete)),
  'wordwheel_compete',
  'compete: common.games.gametype = wordwheel_compete'
);

select is(
  (select mode from common.games where id = (select id from g_compete)),
  'compete',
  'compete: common.games.mode = compete'
);

select is(
  (select summary_data->'team' from common.games where id = (select id from g_compete)),
  'null'::jsonb,
  'compete summary_data carries no team (the compete shape)'
);

select is(
  (select (summary_data->>'targetRankIdx')::int from common.games where id = (select id from g_compete)),
  4,
  'compete summary_data.targetRankIdx seeded from setup'
);

-- Every player is seeded at 0; the first submit_word moves it.
select is(
  (select count(*)::int from jsonb_array_elements((select game_data->'players' from common.games where id = (select id from g_compete))) p
    where (p->>'foundWordsScore')::int = 0),
  3,
  'compete: every player is seeded at a score of 0'
);

-- ============================================================
-- (5) Auth: dee (outsider) cannot create a wordwheel game
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club), pg_temp.wordwheel_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN012"}'::jsonb,
  'dee (non-member) cannot create a wordwheel game');

-- ============================================================
-- (6) mode arg: invalid value rejected
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club), pg_temp.wordwheel_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'solo',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN040",
    "message":"BUG: game mode of ''solo''"}'::jsonb,
  'rejects mode value not in {coop, compete}');


-- ============================================================
-- (7) Compete needs ≥2 players
-- ============================================================

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup() || '{"target_rank": 3}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'compete',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN178",
    "message":"BUG: race with fewer than two players"}'::jsonb,
  'compete with 1 player rejected');

-- ============================================================
-- (8) target_rank: compete without one needs a countdown
-- ============================================================

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    'compete',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"form-validation","field":"target_rank","dbcode":"PN179",
    "message":"A compete game with no target needs a countdown"}'::jsonb,
  'compete without target_rank or a countdown is refused');

select lives_ok(
  format(
    $$ select wordwheel.create_game(%L,
                                 pg_temp.wordwheel_setup()
                                   || '{"timer": {"kind": "countdown", "seconds": 600}}'::jsonb,
                                 array['ada11111-1111-1111-1111-111111111111'::uuid,
                                       'bea22222-2222-2222-2222-222222222222'::uuid],
                                 'compete',
                                 pg_temp.wordwheel_board()) $$,
    (select handle from club)
  ),
  'compete without target_rank but with a countdown accepted'
);

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup() || '{"target_rank": 7}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    'compete',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN181",
    "message":"BUG: target rank of 7"}'::jsonb,
  'compete with target_rank > 6 rejected');

-- coop MAY set target_rank: it's the team's win threshold (reach that rank
-- together and wordwheel.submit_word ends the game as 'won'). Absent/null is the
-- open-ended hunt that only the clock or the End button stops.
select lives_ok(
  format(
    $$ select wordwheel.create_game(%L,
                                   pg_temp.wordwheel_setup() || '{"target_rank": 3}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.wordwheel_board()) $$,
    (select handle from club)
  ),
  'coop with a target_rank accepted (the coop win threshold)'
);

select is(
  (select wg.target_rank
     from wordwheel.games wg
     join common.games cg on cg.id = wg.game_id
    where cg.gametype = 'wordwheel_coop'
      and wg.target_rank is not null
    limit 1),
  3,
  'the coop target rank is copied to its column (the FE reads it for the win copy)'
);

-- ============================================================
-- (9) Word-difficulty band validation
-- ============================================================
-- The setup carries two vocabulary bands: `required_band` (the goal words,
-- 1..6) and `legal_band` (the wider accepted set, required_band..6). create_game
-- re-checks them server-side. The defaults (required 3 / legal 5) are
-- absent from pg_temp.wordwheel_setup(), so the happy paths above
-- exercise the coalesced defaults; these assert the rejection edges.

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup() || '{"required_band": 0}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN182",
    "message":"BUG: required difficulty of 0"}'::jsonb,
  'rejects setup.required_band below 1 (band floor)');

-- required = 1 is the floor — accepted. Same fixture board (its
-- n_reqd_words clears the ≥15 gate regardless of the band).
select isnt(
      (wordwheel.create_game(
      (select pg_temp.create_club('Required one', array['ada','bea']) as handle),
      pg_temp.wordwheel_setup() || '{"required_band": 1}'::jsonb,
      array['ada11111-1111-1111-1111-111111111111'::uuid,
            'bea22222-2222-2222-2222-222222222222'::uuid],
      'coop',
      pg_temp.wordwheel_board()
    )->'data'->>'id'),
  null,
  'accepts setup.required_band = 1 (the band floor)'
);

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup() || '{"required_band": 7}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN182",
    "message":"BUG: required difficulty of 7"}'::jsonb,
  'rejects setup.required_band above 6 (band ceiling)');

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup() || '{"required_band": 4, "legal_band": 3}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN183"}'::jsonb,
  'rejects setup.legal_band below setup.required_band (legal must contain required)');

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup() || '{"required_band": 2, "legal_band": 7}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN183"}'::jsonb,
  'rejects setup.legal_band above 6 (band ceiling)');

-- A band that is not a number answers in the envelope rather than escaping
-- as a bare cast error, the way target_rank's does (PN180).
select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup() || '{"required_band": "three"}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN505",
    "message":"BUG: required difficulty that is not a number"}'::jsonb,
  'rejects a setup.required_band that is not a number, in the envelope');

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup() || '{"legal_band": "5.5"}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN506",
    "message":"BUG: legal difficulty that is not a number"}'::jsonb,
  'rejects a setup.legal_band that is not a whole number, in the envelope');

-- Happy path with explicit non-default bands: required 4, legal 6.
select isnt(
      (wordwheel.create_game(
      (select pg_temp.create_club('Bands ok', array['ada','bea']) as handle),
      pg_temp.wordwheel_setup() || '{"required_band": 4, "legal_band": 6}'::jsonb,
      array['ada11111-1111-1111-1111-111111111111'::uuid,
            'bea22222-2222-2222-2222-222222222222'::uuid],
      'coop',
      pg_temp.wordwheel_board()
    )->'data'->>'id'),
  null,
  'accepts explicit required=4 / legal=6 (legal ≥ required, both in range)'
);

-- ============================================================
-- (10) Board validation
-- ============================================================

-- The MULTISET acceptance: the dup fixture's outer letters 'abcdefgg' repeat
-- 'g' on two tiles AND carry an 'e' that duplicates the center, and both are
-- ordinary boards.
create temp table dup_g on commit drop as
select (wordwheel.create_game(
  (select pg_temp.create_club('Dup letters ok', array['ada','bea']) as handle),
  pg_temp.wordwheel_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordwheel_dup_board()
)->'data'->>'id')::uuid as id;

select isnt(
  (select id from dup_g),
  null,
  'ACCEPTS duplicate outer letters + a center repeating an outer (the wheel is a multiset)'
);

-- The title formula needs no dedup — duplicates simply appear twice, sorted.
select is(
  (select title from common.games where id = (select id from dup_g)),
  'E·ABCDEFGG',
  'duplicate-letter title: <CENTER>·<OUTER-SORTED> keeps both twins'
);

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club), pg_temp.wordwheel_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board() || '{"outer_letters": "abcdfg"}'::jsonb),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN184"}'::jsonb,
  'rejects outer_letters with wrong length (not 8)');

-- ============================================================
-- (11) THE FORK: 's' is ALLOWED in outer_letters
-- ============================================================
-- spellingbee REJECTS an 's' in the board letters (each tile is reusable
-- there, so 's' would pluralize almost anything). word wheel spends a
-- tile per use, so 's' is just one more ordinary letter — the board
-- builder may place it. Swap 'a'→'s' in the outer set (no 'e'); the
-- fixture's word list is irrelevant to this structural check (the
-- ≥15 count gate is what create_game enforces, and the fixture clears it).

select isnt(
      (wordwheel.create_game(
      (select pg_temp.create_club('Board with s', array['ada','bea']) as handle),
      pg_temp.wordwheel_setup(),
      array['ada11111-1111-1111-1111-111111111111'::uuid,
            'bea22222-2222-2222-2222-222222222222'::uuid],
      'coop',
      pg_temp.wordwheel_board() || '{"outer_letters": "sbcdfghi"}'::jsonb
    )->'data'->>'id'),
  null,
  'ACCEPTS outer_letters containing "s" (the wordwheel fork — tile-spending means no s-ban)'
);

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club), pg_temp.wordwheel_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board() || '{"n_reqd_words": 14}'::jsonb),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN189",
    "message":"BUG: generated wheel had only 14 words to find"}'::jsonb,
  'rejects board.n_reqd_words < 15 (puzzle-quality gate — the wordwheel floor)');

-- ============================================================
-- (12) Player-count upper bound (max 6)
-- ============================================================

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club), pg_temp.wordwheel_setup(),
    array[
      'ada11111-1111-1111-1111-111111111111'::uuid,
      'bea22222-2222-2222-2222-222222222222'::uuid,
      gen_random_uuid(),
      gen_random_uuid(),
      gen_random_uuid(),
      gen_random_uuid(),
      gen_random_uuid()
    ],
    'coop',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN041"}'::jsonb,
  'rejects player_user_ids with > 6 entries (max 6)');

-- ============================================================
-- (13) Both gametype strings land on common.gametypes
-- ============================================================

select is(
  (
    select array_agg(gametype order by gametype)
      from common.gametypes
     where gametype like 'wordwheel%'
  ),
  array['wordwheel_compete', 'wordwheel_coop'],
  'common.gametypes carries both wordwheel_coop + wordwheel_compete'
);

-- ============================================================
select * from finish();
rollback;
