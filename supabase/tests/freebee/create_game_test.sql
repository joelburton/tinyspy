-- ============================================================
-- Test: freebee.create_game
-- ============================================================
--
-- Coverage:
--   1. Happy path: ada creates a freebee game; common.games +
--      freebee.games rows materialize; title formula correct;
--      is_current_view flips on; status seeded.
--   2. Auth + membership: dee (outsider) rejected with 42501.
--   3. Setup validation: missing mode / invalid mode /
--      target_rank-iff-compete coupling / timer delegation.
--   4. Board validation: outer_letters length, alphabet, no-s,
--      distinctness; center_letter validity; center-not-in-outer;
--      total_words ≥ 30 gate; scoring/legal must be arrays.
--   5. Title formula: "<CENTER>·<OUTER-SORTED>" — uppercased,
--      center first, dot, then outer letters alphabetized.
--
-- See ../tinyspy/create_game_test.sql for the pgTAP primer.

begin;

set search_path = freebee, common, public, extensions;

select plan(22);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up: an ada+bea club for the happy-path tests
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('Ada and Bea', array['ada','bea']);

-- ============================================================
-- Happy path: ada creates a game; both rows materialize
-- ============================================================

create temp table g on commit drop as
select * from freebee.create_game(
  (select id from club),
  pg_temp.freebee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  pg_temp.freebee_board()
);

select isnt(
  (select id from g), null,
  'create_game returns a non-null id'
);

select is(
  (select count(*) from common.games where id = (select id from g)),
  1::bigint,
  'common.games row materialized for the new game'
);

select is(
  (select count(*) from freebee.games where id = (select id from g)),
  1::bigint,
  'freebee.games row materialized for the new game'
);

select is(
  (select is_current_view from common.games where id = (select id from g)),
  true,
  'common.create_game flipped is_current_view=true on the new row'
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

select is(
  (select center_letter from freebee.games where id = (select id from g)),
  'e'::char(1),
  'freebee.games.center_letter carries the board''s center letter'
);

-- ============================================================
-- Title formula: "<CENTER>·<OUTER-SORTED>" (uppercased)
-- ============================================================
-- Board has center='e', outer='abcdfg'. Sorted-uppercased outer
-- is 'ABCDFG'. Title is 'E·ABCDFG'.

select is(
  (select title from common.games where id = (select id from g)),
  'E·ABCDFG',
  'title formula: <CENTER>·<OUTER-SORTED>, uppercased, dot-separated'
);

-- ============================================================
-- Status jsonb: seeded with zeros + totals from the board
-- ============================================================

select is(
  (select status->>'mode' from common.games where id = (select id from g)),
  'coop',
  'status.mode = setup.mode'
);

select is(
  (select (status->>'total_score')::int from common.games where id = (select id from g)),
  50,                                                  -- 28*1 + 1*5 + 1*17
  'status.total_score = board.total_score (cached for labelFor)'
);

select is(
  (select (status->>'total_words')::int from common.games where id = (select id from g)),
  30,
  'status.total_words = board.total_words'
);

select is(
  (select (status->>'score')::int from common.games where id = (select id from g)),
  0,
  'status.score = 0 at create time'
);

-- ============================================================
-- Auth: dee (outsider) cannot create a game in ada+bea's club
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select freebee.create_game(%L::uuid, pg_temp.freebee_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   pg_temp.freebee_board()) $$,
    (select id from club)
  ),
  '42501',
  null,
  'dee (non-member) cannot create a freebee game'
);

-- ============================================================
-- Setup validation: mode required + must be coop/compete
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select throws_ok(
  format(
    $$ select freebee.create_game(%L::uuid,
                                   '{"timer": {"kind": "none"}}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   pg_temp.freebee_board()) $$,
    (select id from club)
  ),
  'P0001',
  'setup.mode is required',
  'rejects setup without mode'
);

select throws_ok(
  format(
    $$ select freebee.create_game(%L::uuid,
                                   '{"mode": "solo", "timer": {"kind": "none"}}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   pg_temp.freebee_board()) $$,
    (select id from club)
  ),
  'P0001',
  null,
  'rejects unknown mode (only coop / compete accepted)'
);

-- ============================================================
-- Setup: target_rank required iff mode=compete
-- ============================================================

select throws_ok(
  format(
    $$ select freebee.create_game(%L::uuid,
                                   '{"mode": "compete", "timer": {"kind": "none"}}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   pg_temp.freebee_board()) $$,
    (select id from club)
  ),
  'P0001',
  'setup.target_rank is required when mode=compete',
  'compete mode rejects missing target_rank'
);

select throws_ok(
  format(
    $$ select freebee.create_game(%L::uuid,
                                   '{"mode": "compete", "target_rank": 7, "timer": {"kind": "none"}}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   pg_temp.freebee_board()) $$,
    (select id from club)
  ),
  'P0001',
  null,
  'compete mode rejects target_rank > 6'
);

select throws_ok(
  format(
    $$ select freebee.create_game(%L::uuid,
                                   '{"mode": "coop", "target_rank": 3, "timer": {"kind": "none"}}'::jsonb,
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   pg_temp.freebee_board()) $$,
    (select id from club)
  ),
  'P0001',
  'setup.target_rank only allowed when mode=compete',
  'coop mode rejects a stray target_rank (FE forgot to strip)'
);

-- ============================================================
-- Board validation: invalid outer / center letters
-- ============================================================
-- Spot-check that the rejection paths trigger. We don't enumerate
-- every regex match here; the patterns themselves live in the
-- migration's CHECK and validation block. One representative
-- failure mode per assertion.

-- "abcdef" contains 'e', and the default center is 'e' — that's
-- the center-in-outer rejection path.
select throws_ok(
  format(
    $$ select freebee.create_game(%L::uuid, pg_temp.freebee_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   pg_temp.freebee_board() || '{"outer_letters": "abcdef"}'::jsonb) $$,
    (select id from club)
  ),
  'P0001',
  null,
  'rejects board where center_letter appears in outer_letters'
);

-- A 5-char outer (length mismatch).
select throws_ok(
  format(
    $$ select freebee.create_game(%L::uuid, pg_temp.freebee_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   pg_temp.freebee_board() || '{"outer_letters": "abcde"}'::jsonb) $$,
    (select id from club)
  ),
  'P0001',
  null,
  'rejects outer_letters with wrong length (not 6)'
);

-- Outer containing 's'.
select throws_ok(
  format(
    $$ select freebee.create_game(%L::uuid, pg_temp.freebee_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   pg_temp.freebee_board() || '{"outer_letters": "absdfg"}'::jsonb) $$,
    (select id from club)
  ),
  'P0001',
  null,
  'rejects outer_letters containing "s"'
);

-- total_words below the 30-gate.
select throws_ok(
  format(
    $$ select freebee.create_game(%L::uuid, pg_temp.freebee_setup(),
                                   array['ada11111-1111-1111-1111-111111111111'::uuid],
                                   pg_temp.freebee_board() || '{"total_words": 29}'::jsonb) $$,
    (select id from club)
  ),
  'P0001',
  null,
  'rejects board.total_words < 30 (puzzle-quality gate; mirrors the edge function''s pre-check)'
);

-- ============================================================
select * from finish();
rollback;
