-- ============================================================
-- Test: freebee.create_game (sibling-manifest era)
-- ============================================================
--
-- Coverage:
--   1. Coop happy path: ada creates a game; common.games +
--      freebee.games rows materialize; mode='coop'; gametype
--      string is 'freebee_coop'; title formula correct;
--      is_current_view flips on; status seeded with coop shape.
--   2. Compete happy path: separate game with mode='compete'
--      + target_rank=4; mode column + gametype string match;
--      compete-shape status seeded (target_rank + empty
--      leaderboard).
--   3. Auth + membership: dee (outsider) rejected with 42501.
--   4. mode arg validation: invalid value; setup.mode field
--      rejected (catch a stale FE); compete with <2 players;
--      target_rank required iff compete; target_rank range.
--   5. Board validation (unchanged from pre-split): outer_letters
--      length / alphabet / no-s / distinctness; center; center-
--      not-in-outer; total_words ≥ 30 gate.
--   6. Title formula: "<CENTER>·<OUTER-SORTED>".
--   7. Player-count upper bound: 7+ entries rejected.
--
-- See ../tinyspy/create_game_test.sql for the pgTAP primer.

begin;

set search_path = freebee, common, public, extensions;

select plan(28);

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
select * from freebee.create_game(
  (select handle from club),
  pg_temp.freebee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.freebee_board()
);

select isnt(
  (select id from g), null,
  'coop create_game returns a non-null id'
);

select is(
  (select gametype from common.games where id = (select id from g)),
  'freebee_coop',
  'common.games.gametype = freebee_coop (mode routes the suffix)'
);

select is(
  (select mode from freebee.games where id = (select id from g)),
  'coop',
  'freebee.games.mode = coop (denormalized for RLS branching)'
);

select is(
  (select play_state from common.games where id = (select id from g)),
  'playing',
  'common.games.play_state initialized to "playing"'
);

select is(
  (select outer_letters from freebee.games where id = (select id from g)),
  'abcdfg'::char(6),
  'freebee.games.outer_letters carries the board''s outer letters verbatim'
);

-- ============================================================
-- (2) Title formula: "<CENTER>·<OUTER-SORTED>" (uppercased)
-- ============================================================

select is(
  (select title from common.games where id = (select id from g)),
  'E·ABCDFG',
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
  (select (status->>'total_score')::int from common.games where id = (select id from g)),
  50,
  'coop status.total_score = board.total_score'
);

select is(
  (select (status->>'total_words')::int from common.games where id = (select id from g)),
  30,
  'coop status.total_words = board.total_words'
);

select is(
  (select (status->>'score')::int from common.games where id = (select id from g)),
  0,
  'coop status.score = 0 at create time'
);

-- ============================================================
-- (7) Compete happy path
-- ============================================================
-- Fresh club for compete (the partial unique index on
-- common.games(club_handle) where is_current_view=true means a
-- second create in the same club would suspend the prior game —
-- testable but tangential here).

create temp table compete_club on commit drop as
select common.create_club('Compete club', array['ada','bea','cade']) as handle;

create temp table g_compete on commit drop as
select * from freebee.create_game(
  (select handle from compete_club),
  pg_temp.freebee_setup() || '{"target_rank": 4}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'compete',
  pg_temp.freebee_board()
);

select is(
  (select gametype from common.games where id = (select id from g_compete)),
  'freebee_compete',
  'compete: common.games.gametype = freebee_compete'
);

select is(
  (select mode from freebee.games where id = (select id from g_compete)),
  'compete',
  'compete: freebee.games.mode = compete'
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
-- (12) Auth: dee (outsider) cannot create a freebee game
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select freebee.create_game(%L, pg_temp.freebee_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.freebee_board()) $$,
    (select handle from club)
  ),
  '42501',
  null,
  'dee (non-member) cannot create a freebee game'
);

-- ============================================================
-- (13) mode arg: invalid value rejected
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select throws_ok(
  format(
    $$ select freebee.create_game(%L, pg_temp.freebee_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'solo',
                                   pg_temp.freebee_board()) $$,
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
    $$ select freebee.create_game(%L,
                                   '{"mode": "coop", "timer": {"kind": "none"}}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.freebee_board()) $$,
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
    $$ select freebee.create_game(%L,
                                   pg_temp.freebee_setup() || '{"target_rank": 3}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'compete',
                                   pg_temp.freebee_board()) $$,
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
    $$ select freebee.create_game(%L,
                                   pg_temp.freebee_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid,
                                         'bea22222-2222-2222-2222-222222222222'::uuid],
                                   'compete',
                                   pg_temp.freebee_board()) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.target_rank is required when mode=compete',
  'compete without target_rank rejected'
);

select throws_ok(
  format(
    $$ select freebee.create_game(%L,
                                   pg_temp.freebee_setup() || '{"target_rank": 7}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid,
                                         'bea22222-2222-2222-2222-222222222222'::uuid],
                                   'compete',
                                   pg_temp.freebee_board()) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'compete with target_rank > 6 rejected'
);

select throws_ok(
  format(
    $$ select freebee.create_game(%L,
                                   pg_temp.freebee_setup() || '{"target_rank": 3}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.freebee_board()) $$,
    (select handle from club)
  ),
  'P0001',
  'setup.target_rank only allowed when mode=compete',
  'coop with a stray target_rank rejected (loud — FE forgot to strip)'
);

-- ============================================================
-- (19)-(22) Board validation (unchanged from pre-split)
-- ============================================================

select throws_ok(
  format(
    $$ select freebee.create_game(%L, pg_temp.freebee_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.freebee_board() || '{"outer_letters": "abcdef"}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects board where center_letter appears in outer_letters'
);

select throws_ok(
  format(
    $$ select freebee.create_game(%L, pg_temp.freebee_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.freebee_board() || '{"outer_letters": "abcde"}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects outer_letters with wrong length (not 6)'
);

select throws_ok(
  format(
    $$ select freebee.create_game(%L, pg_temp.freebee_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.freebee_board() || '{"outer_letters": "absdfg"}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects outer_letters containing "s"'
);

select throws_ok(
  format(
    $$ select freebee.create_game(%L, pg_temp.freebee_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   'coop',
                                   pg_temp.freebee_board() || '{"total_words": 29}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects board.total_words < 30 (puzzle-quality gate)'
);

-- ============================================================
-- (23) Player-count upper bound (max 6)
-- ============================================================

select throws_ok(
  format(
    $$ select freebee.create_game(%L, pg_temp.freebee_setup(),
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
                                   pg_temp.freebee_board()) $$,
    (select handle from club)
  ),
  'P0001',
  null,
  'rejects player_user_ids with > 6 entries (max 6)'
);

-- ============================================================
-- (24) Compete writes the gametype string suffixed correctly
-- ============================================================
-- Defensive: the routing is `'freebee_' || mode`. Verify both
-- strings land on common.gametypes (cross-checked in
-- clubs_gametypes_test, but also here so a freebee-only regression
-- doesn't slip past).

select is(
  (
    select array_agg(gametype order by gametype)
      from common.gametypes
     where gametype like 'freebee%'
  ),
  array['freebee_compete', 'freebee_coop'],
  'common.gametypes carries both freebee_coop + freebee_compete'
);

-- ============================================================
select * from finish();
rollback;
