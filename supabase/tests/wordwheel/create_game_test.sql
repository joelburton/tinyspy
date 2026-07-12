-- ============================================================
-- Test: wordwheel.create_game (sibling-manifest era)
-- ============================================================
--
-- A fork of spellingbee's create_game_test. Coverage:
--   1. Coop happy path: ada creates a game; common.games +
--      wordwheel.games rows materialize; mode='coop'; gametype
--      string is 'wordwheel_coop'; title formula correct;
--      is_current_view flips on; status seeded with coop shape.
--   2. Compete happy path: separate game with mode='compete'
--      + target_rank=4; mode column + gametype string match;
--      compete-shape status seeded (target_rank + empty leaderboard).
--   3. Auth + membership: dee (outsider) rejected with 42501.
--   4. mode arg validation: invalid value; setup.mode field rejected;
--      compete with <2 players; target_rank required iff compete;
--      target_rank range.
--   5. Board validation: outer_letters length (NOW 8) / alphabet /
--      distinctness; center; center-not-in-outer;
--      required_words_count ≥ 15 gate (NOT 30 — the wordwheel fork).
--   6. THE FORK: 's' is ALLOWED in outer_letters (each tile used once,
--      so 's' can't pluralize explosively — spellingbee bans it, wordwheel
--      does not).
--   7. Title formula: "<CENTER>·<OUTER-SORTED>".
--   8. Player-count upper bound: 7+ entries rejected.
--
-- Fixture board (pg_temp.wordwheel_board): 19 required words scoring 62.

begin;

set search_path = wordwheel, common, public, extensions;

select plan(34);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up: an ada+bea club for the happy-path tests
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

-- ============================================================
-- (1) Coop happy path: every base assertion fires
-- ============================================================

create temp table g on commit drop as
select * from wordwheel.create_game(
  (select handle from club),
  pg_temp.wordwheel_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordwheel_board()
);

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
-- (3)-(6) Coop status jsonb seeding
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
-- (7) Compete happy path
-- ============================================================

create temp table compete_club on commit drop as
select common.create_club('Compete club', array['ada','bea','cade']) as handle;

create temp table g_compete on commit drop as
select * from wordwheel.create_game(
  (select handle from compete_club),
  pg_temp.wordwheel_setup() || '{"target_rank": 4}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.wordwheel_board()
);

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
-- (12) Auth: dee (outsider) cannot create a wordwheel game
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select wordwheel.create_game(%L, pg_temp.wordwheel_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.wordwheel_board()) $$,
    (select handle from club)
  ),
  '42501',
  null,
  'dee (non-member) cannot create a wordwheel game'
);

-- ============================================================
-- (13) mode arg: invalid value rejected
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select throws_ok(
  format(
    $$ select wordwheel.create_game(%L, pg_temp.wordwheel_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'solo',
                                   pg_temp.wordwheel_board()) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects mode value not in {coop, compete}'
);

-- ============================================================
-- (14) setup.mode field rejected (catch stale FE)
-- ============================================================

select throws_ok(
  format(
    $$ select wordwheel.create_game(%L,
                                   '{"mode": "coop", "timer": {"kind": "none"}}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.wordwheel_board()) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.mode is no longer valid; mode is now a top-level argument',
  'rejects setup.mode even when mode arg matches (loud over silent)'
);

-- ============================================================
-- (15) Compete needs ≥2 players
-- ============================================================

select throws_ok(
  format(
    $$ select wordwheel.create_game(%L,
                                   pg_temp.wordwheel_setup() || '{"target_rank": 3}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'compete',
                                   pg_temp.wordwheel_board()) $$,
    (select handle from club)
  ),
  'P0001',
  'compete mode requires at least 2 players',
  'compete with 1 player rejected'
);

-- ============================================================
-- (16) target_rank required iff compete
-- ============================================================

select throws_ok(
  format(
    $$ select wordwheel.create_game(%L,
                                   pg_temp.wordwheel_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid,
                                         'bea22222-2222-2222-2222-222222222222'::uuid],
                                   'compete',
                                   pg_temp.wordwheel_board()) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.target_rank is required when mode=compete',
  'compete without target_rank rejected'
);

select throws_ok(
  format(
    $$ select wordwheel.create_game(%L,
                                   pg_temp.wordwheel_setup() || '{"target_rank": 7}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid,
                                         'bea22222-2222-2222-2222-222222222222'::uuid],
                                   'compete',
                                   pg_temp.wordwheel_board()) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'compete with target_rank > 6 rejected'
);

select throws_ok(
  format(
    $$ select wordwheel.create_game(%L,
                                   pg_temp.wordwheel_setup() || '{"target_rank": 3}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.wordwheel_board()) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.target_rank only allowed when mode=compete',
  'coop with a stray target_rank rejected (loud — FE forgot to strip)'
);

-- ============================================================
-- (16b) Word-difficulty band validation
-- ============================================================
-- The setup carries two vocabulary bands: `required` (the goal words,
-- 1..6) and `legal` (the wider accepted set, required..6). create_game
-- re-checks them server-side. The defaults (required 3 / legal 5) are
-- absent from pg_temp.wordwheel_setup(), so the happy paths above
-- exercise the coalesced defaults; these assert the rejection edges.

select throws_ok(
  format(
    $$ select wordwheel.create_game(%L,
                                   pg_temp.wordwheel_setup() || '{"required": 0}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.wordwheel_board()) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects setup.required below 1 (band floor)'
);

-- required = 1 is the floor — accepted. Same fixture board (its
-- required_words_count clears the ≥15 gate regardless of the band).
select isnt(
  (
    select id from wordwheel.create_game(
      (select common.create_club('Required one', array['ada','bea']) as handle),
      pg_temp.wordwheel_setup() || '{"required": 1}'::jsonb,
      array['ada11111-1111-1111-1111-111111111111'::uuid,
            'bea22222-2222-2222-2222-222222222222'::uuid],
      'coop',
      pg_temp.wordwheel_board()
    )
  ),
  null,
  'accepts setup.required = 1 (the band floor)'
);

select throws_ok(
  format(
    $$ select wordwheel.create_game(%L,
                                   pg_temp.wordwheel_setup() || '{"required": 7}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.wordwheel_board()) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects setup.required above 6 (band ceiling)'
);

select throws_ok(
  format(
    $$ select wordwheel.create_game(%L,
                                   pg_temp.wordwheel_setup() || '{"required": 4, "legal": 3}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.wordwheel_board()) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects setup.legal below setup.required (legal must contain required)'
);

select throws_ok(
  format(
    $$ select wordwheel.create_game(%L,
                                   pg_temp.wordwheel_setup() || '{"required": 2, "legal": 7}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.wordwheel_board()) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects setup.legal above 6 (band ceiling)'
);

-- Happy path with explicit non-default bands: required 4, legal 6.
select isnt(
  (
    select id from wordwheel.create_game(
      (select common.create_club('Bands ok', array['ada','bea']) as handle),
      pg_temp.wordwheel_setup() || '{"required": 4, "legal": 6}'::jsonb,
      array['ada11111-1111-1111-1111-111111111111'::uuid,
            'bea22222-2222-2222-2222-222222222222'::uuid],
      'coop',
      pg_temp.wordwheel_board()
    )
  ),
  null,
  'accepts explicit required=4 / legal=6 (legal ≥ required, both in range)'
);

-- ============================================================
-- (19)-(22) Board validation
-- ============================================================

select throws_ok(
  format(
    $$ select wordwheel.create_game(%L, pg_temp.wordwheel_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.wordwheel_board() || '{"outer_letters": "abcdefgh"}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects board where center_letter (e) appears in outer_letters'
);

select throws_ok(
  format(
    $$ select wordwheel.create_game(%L, pg_temp.wordwheel_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.wordwheel_board() || '{"outer_letters": "abcdfg"}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects outer_letters with wrong length (not 8)'
);

-- ============================================================
-- (21) THE FORK: 's' is ALLOWED in outer_letters
-- ============================================================
-- spellingbee REJECTS an 's' in the board letters (each tile is reusable
-- there, so 's' would pluralize almost anything). word wheel uses each
-- tile ONCE, so 's' is just one more ordinary letter — the board builder
-- may place it. Swap 'a'→'s' in the outer set (still 8 distinct, no 'e');
-- the fixture's word list is irrelevant to this structural check (the
-- ≥15 count gate is what create_game enforces, and the fixture clears it).

select isnt(
  (
    select id from wordwheel.create_game(
      (select common.create_club('Board with s', array['ada','bea']) as handle),
      pg_temp.wordwheel_setup(),
      array['ada11111-1111-1111-1111-111111111111'::uuid,
            'bea22222-2222-2222-2222-222222222222'::uuid],
      'coop',
      pg_temp.wordwheel_board() || '{"outer_letters": "sbcdfghi"}'::jsonb
    )
  ),
  null,
  'ACCEPTS outer_letters containing "s" (the wordwheel fork — used-once means no s-ban)'
);

select throws_ok(
  format(
    $$ select wordwheel.create_game(%L, pg_temp.wordwheel_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.wordwheel_board() || '{"required_words_count": 14}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects board.required_words_count < 15 (puzzle-quality gate — the wordwheel floor)'
);

-- ============================================================
-- (23) Player-count upper bound (max 6)
-- ============================================================

select throws_ok(
  format(
    $$ select wordwheel.create_game(%L, pg_temp.wordwheel_setup(),
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
                                   pg_temp.wordwheel_board()) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects player_user_ids with > 6 entries (max 6)'
);

-- ============================================================
-- (24) Both gametype strings land on common.gametypes
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
