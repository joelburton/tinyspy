-- cs-met-wordwheel

-- ============================================================
-- Test: wordwheel.create_game
-- ============================================================
--
-- A fork of spellingbee's create_game_test. Coverage, by section:
--    1. Coop happy path: common.games + wordwheel.games rows
--       materialize; mode='coop'; gametype 'wordwheel_coop'; play_state
--       'playing'; the outer letters stored verbatim.
--    2. Title formula: "<CENTER>·<OUTER-SORTED>".
--    3. Coop status seeded with the coop shape.
--    4. Compete happy path: mode='compete' + target_rank=4; mode column
--       + gametype string match; compete-shape status seeded
--       (target_rank + empty leaderboard).
--    5. Auth: dee (outsider) rejected.
--    6. mode arg: an invalid value rejected.
--    7. Compete with fewer than 2 players rejected.
--    8. target_rank required iff compete, and above 6 rejected; coop may
--       set one, and it is echoed into the status.
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

select plan(38);

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
  (select mode from wordwheel.games where id = (select id from g)),
  'coop',
  'wordwheel.games.mode = coop (denormalized for RLS branching)'
);

select is(
  (select play_state from common.games where id = (select id from g)),
  'playing',
  'common.games.play_state initialized to "playing"'
);

select is(
  (select outer_letters from wordwheel.games where id = (select id from g)),
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
-- (3) Coop status jsonb seeding
-- ============================================================

select is(
  (select status->>'mode' from common.games where id = (select id from g)),
  'coop',
  'coop status.mode = "coop"'
);

select is(
  (select (status->>'required_words_score')::int from common.games where id = (select id from g)),
  62,
  'coop status.required_words_score = board.required_words_score'
);

select is(
  (select (status->>'required_words_count')::int from common.games where id = (select id from g)),
  19,
  'coop status.required_words_count = board.required_words_count'
);

select is(
  (select (status->>'found_words_score')::int from common.games where id = (select id from g)),
  0,
  'coop status.score = 0 at create time'
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
  (select mode from wordwheel.games where id = (select id from g_compete)),
  'compete',
  'compete: wordwheel.games.mode = compete'
);

select is(
  (select status->>'mode' from common.games where id = (select id from g_compete)),
  'compete',
  'compete status.mode = "compete"'
);

select is(
  (select (status->>'target_rank')::int from common.games where id = (select id from g_compete)),
  4,
  'compete status.target_rank seeded from setup'
);

-- The compete status seeds an empty leaderboard array; the first
-- submit_word call populates it.
select is(
  (select jsonb_typeof(status->'leaderboard') from common.games where id = (select id from g_compete)),
  'array',
  'compete status.leaderboard seeded as a (empty) jsonb array'
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
-- (8) target_rank required iff compete
-- ============================================================

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup(),
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid],
    'compete',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN179",
    "message":"BUG: race with no target rank"}'::jsonb,
  'compete without target_rank rejected');

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
  (select (status->>'target_rank')::int
     from common.games
    where gametype = 'wordwheel_coop'
      and (status->>'target_rank') is not null
    limit 1),
  3,
  'the coop target rank is echoed into status (the FE reads it for the win copy)'
);

-- ============================================================
-- (9) Word-difficulty band validation
-- ============================================================
-- The setup carries two vocabulary bands: `required` (the goal words,
-- 1..6) and `legal` (the wider accepted set, required..6). create_game
-- re-checks them server-side. The defaults (required 3 / legal 5) are
-- absent from pg_temp.wordwheel_setup(), so the happy paths above
-- exercise the coalesced defaults; these assert the rejection edges.

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup() || '{"required": 0}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN182",
    "message":"BUG: required difficulty of 0"}'::jsonb,
  'rejects setup.required below 1 (band floor)');

-- required = 1 is the floor — accepted. Same fixture board (its
-- required_words_count clears the ≥15 gate regardless of the band).
select isnt(
      (wordwheel.create_game(
      (select pg_temp.create_club('Required one', array['ada','bea']) as handle),
      pg_temp.wordwheel_setup() || '{"required": 1}'::jsonb,
      array['ada11111-1111-1111-1111-111111111111'::uuid,
            'bea22222-2222-2222-2222-222222222222'::uuid],
      'coop',
      pg_temp.wordwheel_board()
    )->'data'->>'id'),
  null,
  'accepts setup.required = 1 (the band floor)'
);

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup() || '{"required": 7}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN182",
    "message":"BUG: required difficulty of 7"}'::jsonb,
  'rejects setup.required above 6 (band ceiling)');

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup() || '{"required": 4, "legal": 3}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN183"}'::jsonb,
  'rejects setup.legal below setup.required (legal must contain required)');

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup() || '{"required": 2, "legal": 7}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN183"}'::jsonb,
  'rejects setup.legal above 6 (band ceiling)');

-- A band that is not a number answers in the envelope rather than escaping
-- as a bare cast error, the way target_rank's does (PN180).
select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup() || '{"required": "three"}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN505",
    "message":"BUG: required difficulty that is not a number"}'::jsonb,
  'rejects a setup.required that is not a number, in the envelope');

select pg_temp.envelope_is(
  wordwheel.create_game((select handle from club),
    pg_temp.wordwheel_setup() || '{"legal": "5.5"}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'coop',
    pg_temp.wordwheel_board()),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN506",
    "message":"BUG: legal difficulty that is not a number"}'::jsonb,
  'rejects a setup.legal that is not a whole number, in the envelope');

-- Happy path with explicit non-default bands: required 4, legal 6.
select isnt(
      (wordwheel.create_game(
      (select pg_temp.create_club('Bands ok', array['ada','bea']) as handle),
      pg_temp.wordwheel_setup() || '{"required": 4, "legal": 6}'::jsonb,
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
    pg_temp.wordwheel_board() || '{"required_words_count": 14}'::jsonb),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN189",
    "message":"BUG: generated wheel had only 14 words to find"}'::jsonb,
  'rejects board.required_words_count < 15 (puzzle-quality gate — the wordwheel floor)');

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
